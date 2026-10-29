import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {UsageLedger,DesktopUsage} from '../usage.mjs';
import {TrajectoryReader} from '../trajectory-reader.mjs';

const account='a'.repeat(64), id=n=>`${String(n).padStart(8,'0')}-1111-1111-1111-111111111111`;
const raw={trajectory:{steps:[{type:'PLANNER_RESPONSE',metadata:{createdAt:'2026-10-29T00:00:00Z'}}],generatorMetadata:[{stepIndices:[0],chatModel:{modelDisplayName:'Fixture',usage:{responseId:'safety',inputTokens:10,outputTokens:10,cacheReadTokens:0,cacheWriteTokens:0},chatStartMetadata:{createdAt:'2026-10-29T00:00:00Z'}}}]}};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function fixture(t){const dir=await mkdtemp(join(tmpdir(),'ag-usage-safety-'));t.after(()=>rm(dir,{recursive:true,force:true}));return new UsageLedger(dir);}

test('normal usage sync is bounded for a thousand historical conversations',async t=>{
 const ledger=await fixture(t),ids=Array.from({length:1000},(_,i)=>id(i));let calls=0;
 const store={identity:account,epoch:1,listConversations:async()=>ids.map((conversationId,i)=>({id:conversationId,status:'DONE',modifiedAt:`2026-10-${String(29-i%28).padStart(2,'0')}T00:00:00Z`})),client:{trajectory:async()=>{calls++;return raw;}}};
 const usage=new DesktopUsage(store,ledger,{host:'app',discoverLocal:async()=>({conversations:[],errors:0})});t.after(()=>usage.dispose());
 await usage.sync();
 assert.ok(calls<=25,`normal pass read ${calls} histories`);
 assert.equal(usage.status,'partial');
 assert.equal(usage.continuation,null,'normal refresh does not silently enqueue a full-history loop');
});

test('metrics snapshots do not start historical import until usage sync is requested',async t=>{
 const ledger=await fixture(t);let calls=0;
 const store={identity:account,epoch:1,listConversations:async()=>[{id:id(1),status:'DONE',modifiedAt:'2026-10-29T00:00:00Z'}],client:{trajectory:async()=>{calls++;return raw;}}};
 const usage=new DesktopUsage(store,ledger,{host:'app',discoverLocal:async()=>({conversations:[],errors:0}),now:()=>Date.now()-120000});t.after(()=>usage.dispose());
 await usage.snapshot({sync:false});assert.equal(calls,0);
 await usage.snapshot({sync:true});await usage.pending;assert.equal(calls,1);
});

test('failed signature-less candidates use persistent retry backoff',async t=>{
 const ledger=await fixture(t);let calls=0;
 const store={identity:account,epoch:1,listConversations:async()=>[{id:id(1),status:'DONE',modifiedAt:'2026-10-29T00:00:00Z'}],client:{trajectory:async()=>{calls++;throw Error('unavailable');}}};
 const usage=new DesktopUsage(store,ledger,{host:'app',discoverLocal:async()=>({conversations:[],errors:0})});t.after(()=>usage.dispose());
 await usage.sync();await usage.sync();
 assert.equal(calls,1);
 const state=await ledger.backfillState(account,'app');assert.equal(Object.values(state)[0].state,'retry');assert.ok(Object.values(state)[0].retryAt>Date.now());
});

test('repeated identified pagination pages fail before memory budget',async()=>{
 const client={now:Date.now,discover:async()=>({pid:1,port:2,csrf:'fixture'}),call:async(method,input)=>method.includes('Steps')?{steps:[{id:'same-page',type:'PLANNER_RESPONSE'}]}:{generatorMetadata:[]}};
 const reader=new TrajectoryReader(client,{budgetBytes:1024*1024});
 await assert.rejects(reader.read(id(1),{summary:{stepCount:4,status:'DONE',lastModifiedTime:'2026-10-29T00:00:00Z'}}),/重复返回/);
});

test('explicit full refresh resumes through bounded slices',async t=>{
 const ledger=await fixture(t),ids=Array.from({length:100},(_,i)=>id(i));let calls=0,lists=0,discoveries=0,checkpoints=0;
 const backfillState=ledger.backfillState.bind(ledger);ledger.backfillState=async(...args)=>{checkpoints++;return backfillState(...args);};
 const store={identity:account,epoch:1,listConversations:async()=>{lists++;return ids.map(conversationId=>({id:conversationId,status:'DONE',modifiedAt:'2026-10-29T00:00:00Z'}));},client:{trajectory:async()=>{calls++;return raw;}}};
 const usage=new DesktopUsage(store,ledger,{host:'app',sliceMs:0,maxCandidatesPerSlice:5,continueDelay:1,discoverLocal:async()=>{discoveries++;return {conversations:[],errors:0};}});t.after(()=>usage.dispose());
 await usage.sync(true);assert.ok(usage.continuation||calls===100);
 const deadline=Date.now()+10000;while(usage.pending||usage.continuation){if(Date.now()>deadline)throw Error('full refresh did not resume');await wait(2);}
 assert.equal(calls,100);assert.equal(usage.status,'ready');assert.equal(lists,1);assert.equal(discoveries,1);assert.equal(checkpoints,1);assert.equal(usage.fullJournal,null);
});

async function settleImport(usage){
 const deadline=Date.now()+5000;
 while(usage.pending||usage.continuation){if(Date.now()>deadline)throw Error('Full import did not terminate after its captured queue was exhausted');await wait(2);}
}
const listed=id=>({id,status:'DONE',modifiedAt:'2026-10-29T00:00:00Z'});

test('full import terminates when a queued conversation is deleted between slices',async t=>{
 const ledger=await fixture(t),attempted=[];let lists=0,deleted=false;
 const store={identity:account,epoch:1,listConversations:async()=>{lists++;return (deleted?[id(1)]:[id(1),id(2)]).map(listed);},client:{trajectory:async conversation=>{
  attempted.push(conversation);if(conversation===id(1)){deleted=true;return raw;}throw Error('Conversation deleted');
 }}};
 const usage=new DesktopUsage(store,ledger,{host:'app',maxCandidatesPerSlice:1,continueDelay:1,discoverLocal:async()=>({conversations:[],errors:0})});t.after(()=>usage.dispose());
 await usage.sync(true);await settleImport(usage);
 assert.deepEqual(attempted,[id(1),id(2)]);assert.equal(lists,1,'A continuation consumes its existing queue without rediscovering every slice');
 assert.equal(usage.fullRemaining.size,0);assert.equal(usage.status,'partial');assert.equal((await ledger.summary(account)).totalTokens,20);
 const checkpoint=await ledger.backfillState(account,'app');assert.equal(Object.values(checkpoint).filter(entry=>entry.state==='retry').length,1,'The unreadable queued history remains retryable, never complete');
});

test('full import retains single-source queued histories through transient discovery failures',async t=>{
 const ledger=await fixture(t),attempted=[];let discoveries=0,changed=false;
 const store={identity:account,epoch:1,listConversations:async()=>{if(changed)throw Error('Host discovery temporarily unavailable');return [listed(id(1))];},client:{trajectory:async conversation=>{attempted.push(conversation);changed=true;return raw;}}};
 const usage=new DesktopUsage(store,ledger,{host:'app',maxCandidatesPerSlice:1,continueDelay:1,discoverLocal:async()=>{discoveries++;return changed?{conversations:[],errors:1}:{conversations:[{id:id(2),signature:'local-revision'}],errors:0};}});t.after(()=>usage.dispose());
 await usage.sync(true);await settleImport(usage);
 assert.deepEqual(attempted,[id(1),id(2)]);assert.equal(discoveries,1);assert.equal(usage.status,'ready');assert.equal(usage.fullRemaining.size,0);
});

test('newly listed conversations cannot evict the active full-import queue at its cap',async t=>{
 const ledger=await fixture(t),attempted=[];let changed=false,lists=0;
 const store={identity:account,epoch:1,listConversations:async()=>{lists++;return (changed?[id(3),id(1)]:[id(1),id(2)]).map(listed);},client:{trajectory:async conversation=>{attempted.push(conversation);changed=true;return raw;}}};
 const usage=new DesktopUsage(store,ledger,{host:'app',maxMapEntries:2,maxCandidatesPerSlice:1,continueDelay:1,discoverLocal:async()=>({conversations:[],errors:0})});t.after(()=>usage.dispose());
 await usage.sync(true);await settleImport(usage);
 assert.deepEqual(attempted,[id(1),id(2)]);assert.equal(lists,1);assert.equal(usage.fullRemaining.size,0);assert.ok(usage.passSeen.size<=2);
 await usage.sync(true);await settleImport(usage);assert.ok(attempted.includes(id(3)),'A new explicit pass discovers conversations created during the previous import');
});

test('elapsed slice time cannot schedule a continuation without processing a queued history',async t=>{
 const ledger=await fixture(t);let clock=0,calls=0;
 const store={identity:account,epoch:1,listConversations:async()=>[listed(id(1)),listed(id(2))],client:{trajectory:async()=>{calls++;return raw;}}};
 const usage=new DesktopUsage(store,ledger,{host:'app',now:()=>clock+=100,maxPassMs:1,maxCandidatesPerSlice:1,continueDelay:1,discoverLocal:async()=>({conversations:[],errors:0})});t.after(()=>usage.dispose());
 await usage.sync(true);await settleImport(usage);assert.equal(calls,2);assert.equal(usage.fullRemaining.size,0);assert.equal(usage.status,'ready');
});

test('an unbounded delegated chain cannot grow a full import past its whole-pass cap',async t=>{
 const ledger=await fixture(t),attempted=[];
 const store={identity:account,epoch:1,listConversations:async()=>[listed(id(1))],client:{trajectory:async conversation=>{
  attempted.push(conversation);const value=structuredClone(raw);value.trajectory.steps.push({invokeSubagent:{results:[{conversationId:id(Number(conversation.slice(0,8))+1)}]}});return value;
 }}};
 const usage=new DesktopUsage(store,ledger,{host:'app',maxMapEntries:3,maxCandidatesPerSlice:1,continueDelay:1,discoverLocal:async()=>({conversations:[],errors:0})});t.after(()=>usage.dispose());
 await usage.sync(true);await settleImport(usage);assert.deepEqual(attempted,[id(1),id(2),id(3)]);assert.equal(usage.status,'partial');assert.ok(usage.missingConversations>0);assert.equal(usage.fullRemaining.size,0);assert.equal(usage.fullJournal,null);
});

test('account changes during full import release stale queued candidates and checkpoint references',async t=>{
 const ledger=await fixture(t),attempted=[];let release;
 const store={identity:account,epoch:1,listConversations:async()=>[listed(id(1)),listed(id(2))],client:{trajectory:async conversation=>{attempted.push(conversation);return new Promise(resolve=>{release=resolve;});}}};
 const usage=new DesktopUsage(store,ledger,{host:'app',maxCandidatesPerSlice:1,continueDelay:1,discoverLocal:async()=>({conversations:[],errors:0})});t.after(()=>usage.dispose());
 const pending=usage.sync(true);while(!release)await wait(1);store.identity='b'.repeat(64);store.epoch++;release(raw);await pending;
 assert.deepEqual(attempted,[id(1)]);assert.equal(usage.fullRemaining.size,0);assert.equal(usage.fullJournal,null);assert.equal(usage.continuation,null);assert.equal((await ledger.summary(account)).totalTokens,0);assert.equal((await ledger.summary(store.identity)).totalTokens,0);
});

test('backend changes, owner loss and disposal release full-import state before another slice',async t=>{
 for(const reason of ['backend','ownership','disposal'])await t.test(reason,async t=>{
  const ledger=await fixture(t),attempted=[];let release,owned=true;
  const store={identity:account,epoch:1,listConversations:async()=>[listed(id(1)),listed(id(2))],client:{trajectory:async conversation=>{attempted.push(conversation);return new Promise(resolve=>{release=resolve;});}}};
  const usage=new DesktopUsage(store,ledger,{host:'app',owns:()=>owned,maxCandidatesPerSlice:1,continueDelay:1,discoverLocal:async()=>({conversations:[],errors:0})});t.after(()=>usage.dispose());
  const pending=usage.sync(true);while(!release)await wait(1);
  if(reason==='backend')store.epoch++;else if(reason==='ownership')owned=false;else usage.dispose();
  release(raw);await pending;assert.deepEqual(attempted,[id(1)]);assert.equal(usage.fullRemaining.size,0);assert.equal(usage.fullJournal,null);assert.equal(usage.continuation,null);assert.equal((await ledger.summary(account)).totalTokens,0);
 });
});
