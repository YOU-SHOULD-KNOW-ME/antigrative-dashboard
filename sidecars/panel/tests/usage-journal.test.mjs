import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile,readFile,readdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {UsageLedger,DesktopUsage} from '../usage.mjs';

const account='a'.repeat(64),hash=value=>createHash('sha256').update(String(value)).digest('hex');
const id=n=>`${String(n).padStart(8,'0')}-1111-1111-1111-111111111111`;
const row=(state='complete')=>({signature:'b'.repeat(64),state,failures:state==='retry'?1:0,retryAt:state==='retry'?100000:0});
const raw=(output=10)=>({trajectory:{steps:[{type:'PLANNER_RESPONSE',metadata:{createdAt:'2026-10-29T00:00:00Z'}}],generatorMetadata:[{stepIndices:[0],chatModel:{modelDisplayName:'Fixture',usage:{responseId:'journal-fixture',inputTokens:0,outputTokens:output,cacheReadTokens:0,cacheWriteTokens:0},chatStartMetadata:{createdAt:'2026-10-29T00:00:00Z'}}}]}});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function fixture(t){const dir=await mkdtemp(join(tmpdir(),'ag-usage-journal-'));t.after(()=>rm(dir,{recursive:true,force:true}));return new UsageLedger(dir);}
async function settle(usage){const deadline=Date.now()+10000;while(usage.pending||usage.continuation){if(Date.now()>deadline)throw Error('Import did not settle');await wait(2);}}

test('a thousand-history import saves checkpoint once per slice rather than once per conversation',async t=>{
 const ledger=await fixture(t),saved=ledger.saveBackfillState.bind(ledger);let writes=0,bytes=0;
 ledger.ingest=async()=>{};
 ledger.saveBackfillState=async(scope,host,entries,...options)=>{writes++;bytes+=Buffer.byteLength(JSON.stringify(entries));return saved(scope,host,entries,...options);};
 const store={identity:account,epoch:1,listConversations:async()=>Array.from({length:1000},(_,n)=>({id:id(n),status:'DONE',modifiedAt:'2026-10-29T00:00:00Z'})),client:{trajectory:async()=>raw()}};
 const usage=new DesktopUsage(store,ledger,{host:'app',sliceMs:Infinity,maxPassMs:Infinity,maxCandidatesPerSlice:25,continueDelay:0,discoverLocal:async()=>({conversations:[],errors:0})});t.after(()=>usage.dispose());
 await usage.sync(true);await settle(usage);assert.equal(writes,40);assert.ok(bytes<8*1024*1024,`Checkpoint writes amplified to ${bytes} bytes`);assert.equal(Object.keys(await ledger.backfillState(account,'app')).length,1000);
});

test('checkpoint writes cap entries, strip unknown fields and retain active and retry checkpoints',async t=>{
 const ledger=await fixture(t),entries=Object.fromEntries(Array.from({length:5000},(_,n)=>[hash(n),{...row(n===0?'retry':'complete'),private:'not-a-checkpoint-field'}]));
 await ledger.saveBackfillState(account,'app',entries,{preferred:[hash(4999)]});
 const state=await ledger.backfillState(account,'app'),file=join(ledger.directory,account,'backfill-v1.json');
 assert.equal(Object.keys(state).length,4096);assert.ok(state[hash(0)],'Retry backoff survives compaction');assert.ok(state[hash(4999)],'The current pass has checkpoint priority');assert.equal(state[hash(0)].private,undefined);assert.ok((await stat(file)).size<=8*1024*1024);
});

test('bounded legacy checkpoint files retain useful entries during schema-compatible compaction',async t=>{
 const ledger=await fixture(t),entries=Object.fromEntries(Array.from({length:5000},(_,n)=>[hash(n),row(n===0?'retry':'complete')]));
 await mkdir(join(ledger.directory,account),{recursive:true});await writeFile(join(ledger.directory,account,'backfill-v1.json'),JSON.stringify({schema:1,account,host:'app',entries}));
 const state=await ledger.backfillState(account,'app',{preferred:[hash(4999)]});assert.equal(Object.keys(state).length,4096);assert.ok(state[hash(0)]);assert.ok(state[hash(4999)]);assert.equal(state.checkpointPartial,true);
});

test('oversized legacy checkpoints stay recoverable while bounded rebuilding reports partial',async t=>{
 const ledger=await fixture(t),directory=join(ledger.directory,account),file=join(directory,'backfill-v1.json');
 await mkdir(directory,{recursive:true});const original=JSON.stringify({schema:1,account,host:'app',entries:{[hash('old')]:row()},legacyPadding:'x'.repeat(8*1024*1024)});await writeFile(file,original);
 const state=await ledger.backfillState(account,'app');assert.equal(state.checkpointPartial,true);assert.equal(state.checkpointRecovery,'oversized');assert.equal((await stat(file)).size,Buffer.byteLength(original),'Reading a large checkpoint does not alter it');
 const store={identity:account,epoch:1,listConversations:async()=>[{id:id(1),status:'DONE',modifiedAt:'2026-10-29T00:00:00Z'}],client:{trajectory:async()=>raw()}};
 const usage=new DesktopUsage(store,ledger,{host:'app',discoverLocal:async()=>({conversations:[],errors:0})});t.after(()=>usage.dispose());await usage.sync(true);
 assert.equal(usage.status,'partial','The migration cannot claim it read the oversized legacy checkpoints');
 const names=await readdir(directory),backups=names.filter(name=>/^backfill-v1\.oversized-.*\.json$/.test(name));assert.equal(backups.length,1);assert.equal(await readFile(join(directory,backups[0]),'utf8'),original);assert.ok((await stat(file)).size<8*1024*1024);assert.equal((await ledger.summary(account)).totalTokens,10);
 await usage.sync(true);assert.equal((await readdir(directory)).filter(name=>/^backfill-v1\.oversized-.*\.json$/.test(name)).length,1,'A rebuilt bounded checkpoint is not backed up on every pass');assert.equal(usage.status,'ready');
});

test('summary does not stamp an old scan with a concurrently ingested revision',async t=>{
 const ledger=await fixture(t);await ledger.ingest(account,id(1),raw(10));
 const read=ledger.readSummaryRecord.bind(ledger);let release,started;const scanning=new Promise(resolve=>{started=resolve;});let hold=true;
 ledger.readSummaryRecord=async file=>{const value=await read(file);if(hold){hold=false;started();await new Promise(resolve=>{release=resolve;});}return value;};
 const pending=ledger.summary(account);await scanning;await ledger.ingest(account,id(1),raw(20));release();const stale=await pending;assert.equal(stale.totalTokens,10);assert.equal((await ledger.summary(account)).totalTokens,20);assert.equal(ledger.cache.value.totalTokens,20);
});

test('queued usage and checkpoint writes respect revoked ownership before executing',async t=>{
 const ledger=await fixture(t);let release,owned=true;ledger.queue=new Promise(resolve=>{release=resolve;});
 const store={identity:account,epoch:1,client:{}},usage=new DesktopUsage(store,ledger,{owns:()=>owned});
 const ingest=usage.ingest(account,id(1),raw(30)),checkpoint=ledger.saveBackfillState(account,'app',{[hash(1)]:row()},{isCurrent:()=>owned});owned=false;usage.dispose();release();await Promise.all([ingest,checkpoint]);
 assert.equal((await ledger.summary(account)).totalTokens,0);await assert.rejects(stat(join(ledger.directory,account,'backfill-v1.json')),error=>error.code==='ENOENT');
});

test('revocation after writing a temporary file prevents publishing usage and checkpoint files',async t=>{
 for(const kind of ['usage','checkpoint','usage-write-error','checkpoint-write-error'])await t.test(kind,async t=>{
  const ledger=await fixture(t);let owned=true;const write=ledger.writeRecord.bind(ledger);ledger.writeRecord=async(...args)=>{await write(...args);owned=false;if(kind.endsWith('write-error'))throw Error('The revoked writer failed');};
  if(kind.startsWith('usage'))await ledger.ingest(account,id(1),raw(),{isCurrent:()=>owned});else await ledger.saveBackfillState(account,'app',{[hash(1)]:row()},{isCurrent:()=>owned});
  assert.deepEqual(await readdir(join(ledger.directory,account)),[]);assert.equal(ledger.revision,0);
 });
});

test('signature-less retry backoff survives collector restart and resets for a changed revision',async t=>{
 const ledger=await fixture(t);let clock=100000,calls=0,modifiedAt='2026-10-29T00:00:00Z';const store={identity:account,epoch:1,listConversations:async()=>[{id:id(1),status:'DONE',modifiedAt}],client:{trajectory:async()=>{calls++;throw Error('unavailable');}}};
 const options={host:'app',now:()=>clock,discoverLocal:async()=>({conversations:[],errors:0})};const first=new DesktopUsage(store,ledger,options);t.after(()=>first.dispose());await first.sync();first.dispose();clock+=30001;
 const restarted=new DesktopUsage(store,new UsageLedger(ledger.directory),options);t.after(()=>restarted.dispose());await restarted.sync();const entry=Object.values(await restarted.ledger.backfillState(account,'app'))[0];assert.equal(calls,2);assert.equal(entry.failures,2);assert.equal(entry.retryAt,clock+60000);assert.equal(restarted.confirmedMissingConversations,1);
 modifiedAt='2026-10-29T00:00:01Z';await restarted.sync();const changed=Object.values(await restarted.ledger.backfillState(account,'app'))[0];assert.equal(changed.failures,1);assert.equal(changed.retryAt,clock+30000);
});

test('a collector without a journal keeps same-revision failures in memory',async t=>{
 const ledger=await fixture(t);let modifiedAt='2026-10-29T00:00:00Z';const store={identity:account,epoch:1,listConversations:async()=>[{id:id(1),status:'DONE',modifiedAt}],client:{trajectory:async()=>{throw Error('unavailable');}}};
 const usage=new DesktopUsage(store,ledger,{discoverLocal:async()=>({conversations:[],errors:0})});t.after(()=>usage.dispose());await usage.sync();await usage.sync();assert.equal(usage.confirmedMissingConversations,1);modifiedAt='2026-10-29T00:00:01Z';await usage.sync();assert.equal(usage.confirmedMissingConversations,0);
});

test('an asynchronous owns callback cannot grant collection ownership',async t=>{
 const ledger=await fixture(t);let calls=0;const store={identity:account,epoch:1,listConversations:async()=>{calls++;return [];},client:{}};
 const usage=new DesktopUsage(store,ledger,{owns:async()=>true});t.after(()=>usage.dispose());await usage.sync(true);await usage.ingest(account,id(1),raw());assert.equal(calls,0);assert.equal((await ledger.summary(account)).totalTokens,0);
});
