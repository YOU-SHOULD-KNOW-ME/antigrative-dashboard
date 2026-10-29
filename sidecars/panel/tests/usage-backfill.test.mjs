import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {UsageLedger,DesktopUsage} from '../usage.mjs';
import {TrajectoryReader} from '../trajectory-reader.mjs';
import {discoverLocalConversations} from '../local-conversations.mjs';
const account='a'.repeat(64),otherAccount='b'.repeat(64);
const id='11111111-1111-1111-1111-111111111111',other='22222222-2222-2222-2222-222222222222';
const key=id=>createHash('sha256').update(id).digest('hex');
const step={type:'PLANNER_RESPONSE',metadata:{createdAt:'2026-09-01T00:00:00Z'}};
const generator=n=>({stepIndices:[n],chatModel:{modelDisplayName:'Fixture',usage:{responseId:'fixture-'+n,inputTokens:10,cacheReadTokens:0,cacheWriteTokens:0,outputTokens:10},chatStartMetadata:{createdAt:'2026-09-01T00:00:00Z'}}});
const raw=(count=2)=>({trajectory:{steps:Array.from({length:count},()=>step),generatorMetadata:Array.from({length:count},(_,i)=>generator(i))}});
async function setup(t){const home=await mkdtemp(join(tmpdir(),'ag-backfill-'));t.after(()=>rm(home,{recursive:true,force:true}));return {home,ledger:new UsageLedger(join(home,'custom-storage'))};}
const disk=(ids=[id],signature='one')=>async()=>({conversations:ids.map(id=>({id,signature})),errors:0});
function tracker(t,store,ledger,options={}){const usage=new DesktopUsage(store,ledger,{host:'app',discoverLocal:disk(),...options});t.after(()=>usage.dispose());return usage;}
const baseStore=()=>({identity:account,epoch:1,listConversations:async()=>[],client:{trajectory:async()=>raw()}});

test('disk discovery isolates App and IDE, includes WAL changes, and works without .gemini in ledger path',async t=>{
 const {home}=await setup(t);
 const app=join(home,'.gemini','antigravity','conversations'),ide=join(home,'.gemini','antigravity-ide','conversations');
 await mkdir(app,{recursive:true});await mkdir(ide,{recursive:true});await writeFile(join(app,id+'.db'),'fixture');await writeFile(join(ide,other+'.db'),'fixture');
 await writeFile(join(app,'not-a-conversation.db'),'ignore');
 const first=await discoverLocalConversations({home,host:'app'});assert.deepEqual(first.conversations.map(c=>c.id),[id]);
 assert.deepEqual((await discoverLocalConversations({home,host:'ide'})).conversations.map(c=>c.id),[other]);
 await writeFile(join(app,id+'.db-wal'),'new tokens');const changed=await discoverLocalConversations({home,host:'app'});
 assert.notEqual(first.conversations[0].signature,changed.conversations[0].signature);
 await assert.rejects(discoverLocalConversations({home}),/Explicit/);
 assert.equal((await discoverLocalConversations({home,host:'app',limit:1})).errors,1);
});

test('backfill imports every page for an unlisted conversation and migrates an existing partial ledger',async t=>{
 const {ledger}=await setup(t);await ledger.ingest(account,id,raw(1));const calls=[];
 const client={now:Date.now,discover:async()=>({pid:1,port:2,csrf:'fixture'}),call:async(name,input)=>{
  calls.push([name,input]);assert.notEqual(name,'GetAllCascadeTrajectories');
  const offset=input.stepOffset??input.generatorMetadataOffset;
  return name.includes('Steps')?{steps:offset<2?[step]:[]}:{generatorMetadata:offset<2?[generator(offset)]:[]};
 }};
 const reader=new TrajectoryReader(client);client.trajectory=(...args)=>reader.read(...args);
 const usage=tracker(t,{...baseStore(),client},ledger);await usage.sync();
 assert.equal((await ledger.summary(account)).totalTokens,40);assert.equal((await ledger.summary(account)).requests,2);
 assert.deepEqual(calls.filter(([n])=>n.includes('Metadata')).map(([,p])=>p.generatorMetadataOffset),[0,1,2]);
 assert.equal(usage.status,'ready');const journal=await ledger.backfillState(account,'app');assert.equal(journal[key(id)].state,'complete');
});

test('successful backfill survives restart, changed archives reimport, and refresh never double counts',async t=>{
 const {ledger}=await setup(t);let calls=0,signature='one';const store=baseStore();store.client.trajectory=async()=>{calls++;return raw();};
 const discoverLocal=async()=>({conversations:[{id,signature}],errors:0});const first=tracker(t,store,ledger,{discoverLocal});await first.sync();first.dispose();
 const second=tracker(t,store,new UsageLedger(ledger.directory),{discoverLocal});await second.sync();assert.equal(calls,1);
 signature='two';await second.sync();assert.equal(calls,2);await second.sync(true);assert.equal(calls,3);
 assert.equal((await ledger.summary(account)).requests,2);const saved=await readFile(join(ledger.directory,account,'backfill-v1.json'),'utf8');assert.equal(saved.includes(id),false);
});

test('failed history stays partial, respects backoff, retries automatically and allows manual override',async t=>{
 const {ledger}=await setup(t);let clock=100000,calls=0,fail=true;const store=baseStore();store.client.trajectory=async()=>{calls++;if(fail)throw Error('temporary');return raw();};
 const usage=tracker(t,store,ledger,{now:()=>clock});await usage.sync();assert.equal(usage.status,'partial');assert.equal(usage.missingConversations,1);
 await usage.sync();assert.equal(calls,1);clock+=30001;await usage.sync();assert.equal(calls,2);
 fail=false;await usage.sync(true);assert.equal(calls,3);assert.equal(usage.status,'ready');assert.equal(usage.missingConversations,0);
});

test('refresh requested during pending incremental import runs a full follow-up pass',async t=>{
 const {ledger}=await setup(t);let calls=0,release;const store=baseStore();store.client.trajectory=async()=>{calls++;if(calls===1)await new Promise(r=>{release=r;});return raw();};
 const usage=tracker(t,store,ledger);const pending=usage.sync();while(!release)await delay(1);
 const forced=usage.sync(true);release();await Promise.all([pending,forced]);assert.equal(calls,2);assert.equal((await ledger.summary(account)).requests,2);
});

test('account or backend change during a read cannot import into either wrong ledger',async t=>{
 const {ledger}=await setup(t);let release;const store=baseStore();store.client.trajectory=()=>new Promise(r=>{release=r;});
 const usage=tracker(t,store,ledger);const pending=usage.sync();while(!release)await delay(1);store.identity=otherAccount;store.epoch++;release(raw());await pending;
 assert.equal((await ledger.summary(account)).totalTokens,0);assert.equal((await ledger.summary(otherAccount)).totalTokens,0);
 store.client.trajectory=async()=>raw();await usage.sync();assert.equal((await ledger.summary(otherAccount)).requests,2);
});

test('reader stops paginating when the authenticated scope is superseded',async()=>{
 let current=true,calls=0;const client={now:Date.now,discover:async()=>({pid:1,port:1,csrf:'fixture'}),call:async()=>{calls++;current=false;return {steps:[step]};}};
 const reader=new TrajectoryReader(client);await assert.rejects(reader.read(id,{summary:{},isCurrent:()=>current}),/重新连接/);assert.equal(calls,1);
});

test('an import that changes on disk is retried instead of marked complete',async t=>{
 const {ledger}=await setup(t);const store=baseStore();
 await ledger.ingest(account,id,raw());
 store.client.trajectory=async()=>raw(2);
 const usage=tracker(t,store,ledger,{discoverLocal:async()=>({conversations:[{id,signature:'one',readSignature:async()=> 'two'}],errors:0})});
 await usage.sync();assert.equal(usage.status,'partial');assert.equal((await ledger.backfillState(account,'app'))[key(id)].state,'retry');
 assert.equal((await ledger.summary(account)).totalTokens,40,'An unstable source cannot replace the known statistics');
});

test('manual full refresh continues through every slice including already imported archives',async t=>{
 const {ledger}=await setup(t);const store=baseStore();let calls=[];
 store.client.trajectory=async id=>{calls.push(id);return raw();};
 const usage=tracker(t,store,ledger,{discoverLocal:disk([id,other]),sliceMs:0,continueDelay:5});
 await usage.sync();while(usage.continuation||usage.pending)await delay(5);assert.equal(calls.length,2);
 calls=[];await usage.sync(true);while(usage.continuation||usage.pending)await delay(5);assert.deepEqual(calls,[id,other]);
});

test('running foreground conversations cannot starve archives across background slices',async t=>{
 const {ledger}=await setup(t);let calls=[];const store=baseStore();store.listConversations=async()=>[{id,status:'RUNNING',modifiedAt:'one'}];
 store.client.trajectory=async id=>{calls.push(id);return raw();};
 const usage=tracker(t,store,ledger,{discoverLocal:disk([other]),sliceMs:0,continueDelay:5});await usage.sync();
 while(usage.continuation||usage.pending)await delay(5);assert.deepEqual(calls,[id,other]);assert.equal(usage.status,'ready');
});

test('owner loss prevents background import and disposal cancels pending continuations',async t=>{
 const {ledger}=await setup(t);let owned=false,calls=0;const store=baseStore();store.client.trajectory=async()=>{calls++;return raw();};
 const usage=tracker(t,store,ledger,{owns:()=>owned,discoverLocal:disk([id,other]),sliceMs:0,continueDelay:10});
 await usage.sync();assert.equal(calls,0);owned=true;await usage.sync();assert.ok(usage.continuation);usage.dispose();await delay(30);assert.equal(calls,1);
});

test('failed complete reader cannot overwrite a previously persisted token total',async t=>{
 const {ledger}=await setup(t);await ledger.ingest(account,id,raw());const store=baseStore();
 store.client.trajectory=async()=>{throw Error('statistics budget exceeded');};const usage=tracker(t,store,ledger);await usage.sync(true);
 assert.equal((await ledger.summary(account)).totalTokens,40);assert.equal(usage.status,'partial');
});

test('settled listed histories reuse verified disk and host checkpoints after restart',async t=>{
 const {ledger}=await setup(t);let calls=0;const store=baseStore();
 store.listConversations=async()=>[{id,status:'CASCADE_RUN_STATUS_IDLE',modifiedAt:'2026-10-15T00:00:00Z',stepCount:2}];
 store.client.trajectory=async()=>{calls++;return raw();};
 const first=tracker(t,store,ledger);await first.sync();first.dispose();
 const restarted=tracker(t,store,new UsageLedger(ledger.directory));await restarted.sync();assert.equal(calls,1);
 assert.equal((await restarted.snapshot()).totalTokens,40);assert.equal(restarted.status,'ready');
 await restarted.sync(true);assert.equal(calls,2,'Manual refresh still revalidates completed histories');
});

test('a first transient history failure retains cached totals and is distinguished from repeated failures',async t=>{
 const {ledger}=await setup(t);await ledger.ingest(account,id,raw());let clock=100000,fail=true;
 const store=baseStore();store.client.trajectory=async()=>{if(fail)throw Error('warming up');return raw();};
 const usage=tracker(t,store,ledger,{now:()=>clock});await usage.sync();let snapshot=await usage.snapshot();
 assert.equal(snapshot.totalTokens,40);assert.equal(snapshot.missingConversations,1);assert.equal(snapshot.confirmedMissingConversations,0);assert.equal(snapshot.retryingConversations,1);
 clock+=30001;await usage.sync();snapshot=await usage.snapshot();assert.equal(snapshot.confirmedMissingConversations,1);
 fail=false;await usage.sync(true);snapshot=await usage.snapshot();assert.equal(snapshot.totalTokens,40);assert.equal(snapshot.confirmedMissingConversations,0);assert.equal(snapshot.retryingConversations,0);
});

test('delegated histories absent from disk and lists survive slices, cycles, restart and repeated imports',async t=>{
 const {ledger}=await setup(t),grandchild='33333333-3333-3333-3333-333333333333';
 const store=baseStore(),calls=[];let childOutput=10;
 store.client.trajectory=async(cascade,options)=>{
  calls.push(cascade);assert.ok(options.summary,'Unlisted children still use bounded EOF pagination');
  const value=raw(1);value.trajectory.cascadeId=cascade;
  const usage=value.trajectory.generatorMetadata[0].chatModel.usage;usage.responseId=cascade;usage.apiProvider='API_PROVIDER_OPENAI';usage.outputTokens=cascade===other?childOutput:10;
  value.trajectory.steps.push({invokeSubagent:{results:[{conversationId:cascade===id?other:cascade===other?grandchild:id}]}});
  return value;
 };
 const first=tracker(t,store,ledger,{sliceMs:0,continueDelay:5});await first.sync();
 const settle=async usage=>{const end=Date.now()+3000;while(usage.continuation||usage.pending){if(Date.now()>end)throw Error('Delegation backfill failed to settle');await delay(5);}};
 await settle(first);assert.deepEqual(calls,[id,other,grandchild]);assert.equal((await ledger.summary(account)).totalTokens,60);
 assert.equal((await ledger.backfillState(account,'app'))[key(id)].hasDelegates,true);
 first.dispose();calls.length=0;childOutput=30;
 const restarted=tracker(t,store,new UsageLedger(ledger.directory),{sliceMs:0,continueDelay:5});await restarted.sync();await settle(restarted);
 assert.deepEqual(calls,[id,other,grandchild]);assert.equal((await restarted.ledger.summary(account)).totalTokens,80);
 await restarted.sync(true);await settle(restarted);assert.equal((await restarted.ledger.summary(account)).totalTokens,80);
 const checkpoint=await readFile(join(ledger.directory,account,'backfill-v1.json'),'utf8');assert.equal(checkpoint.includes(other),false,'Checkpoint keeps hashed identities only');
});

test('old completed checkpoints recheck once to discover omitted delegated histories',async t=>{
 const {ledger}=await setup(t),store=baseStore();let reads=0;
 const oldSignature=key('one'+JSON.stringify([undefined,undefined,undefined,undefined]));
 await ledger.saveBackfillState(account,'app',{[key(id)]:{signature:oldSignature,state:'complete',failures:0,retryAt:0}});
 store.client.trajectory=async()=>{reads++;return raw();};
 const usage=tracker(t,store,ledger);await usage.sync();assert.equal(reads,1);
 await usage.sync();assert.equal(reads,1,'The migration does not repeatedly reread ordinary settled history');
});
