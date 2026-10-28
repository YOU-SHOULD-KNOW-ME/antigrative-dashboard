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
 await usage.snapshot({sync:true});await wait(10);assert.equal(calls,1);
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
 const ledger=await fixture(t),ids=Array.from({length:100},(_,i)=>id(i));let calls=0;
 const store={identity:account,epoch:1,listConversations:async()=>ids.map(conversationId=>({id:conversationId,status:'DONE',modifiedAt:'2026-10-29T00:00:00Z'})),client:{trajectory:async()=>{calls++;return raw;}}};
 const usage=new DesktopUsage(store,ledger,{host:'app',sliceMs:0,maxCandidatesPerSlice:5,continueDelay:1,discoverLocal:async()=>({conversations:[],errors:0})});t.after(()=>usage.dispose());
 await usage.sync(true);assert.ok(usage.continuation||calls===100);
 const deadline=Date.now()+3000;while(usage.pending||usage.continuation){if(Date.now()>deadline)throw Error('full refresh did not resume');await wait(2);}
 assert.equal(calls,100);assert.equal(usage.status,'ready');
});
