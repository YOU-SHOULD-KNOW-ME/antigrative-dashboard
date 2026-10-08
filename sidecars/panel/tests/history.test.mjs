import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { SessionHistory } from '../history.mjs';
import { MetricsStore } from '../store.mjs';
import { trajectoryMetrics } from '../metrics.mjs';
import { serverFromDiscovery } from '../client.mjs';

const id='11111111-1111-1111-1111-111111111111', other='22222222-2222-2222-2222-222222222222';
const scope=email=>createHash('sha256').update(email).digest('hex');
const raw=(n=1)=>({trajectory:{cascadeId:id,generatorMetadata:Array.from({length:n},(_,i)=>({chatModel:{usage:{messageId:String(i),inputTokens:'1000',outputTokens:'100',responseOutputTokens:'100',apiProvider:'API_PROVIDER_GOOGLE_GEMINI'},streamingDuration:'2s'}})),steps:[]}});
async function fixture(t) {
  const dir=await mkdtemp(join(tmpdir(),'ag-history-')); t.after(()=>rm(dir,{recursive:true,force:true}));
  return {dir,history:new SessionHistory(dir)};
}
const client=(trajectory=async()=>raw())=>({discover:async()=>({pid:1}),trajectory,call:async method=>method==='GetUserStatus'?{userStatus:{email:'a@example.test'}}:method==='GetAllCascadeTrajectories'?{trajectorySummaries:{[id]:{summary:'private title'}}}:{response:{groups:[]}}});

test('restart restores per-conversation TPS and valid zero cache; records contain no prompts or credentials',async t=>{
  const {dir,history}=await fixture(t);
  const store=new MetricsStore(client(),{history}); const first=await store.snapshot({conversationId:id});
  assert.equal(first.speed.tps,50);assert.equal(first.speed.cache.hitRate,0);
  const record=await readFile(history.file(scope('a@example.test'),id),'utf8');
  for(const secret of ['private title','a@example.test','csrf','context','prompt']) assert.equal(record.includes(secret),false);
  const restarted=new MetricsStore(client(async()=>{throw new Error('trajectory unavailable');}),{history:new SessionHistory(dir)});
  const restored=await restarted.snapshot({conversationId:id});
  assert.equal(restored.speed.tps,50);assert.equal(restored.speed.cache.hitRate,0);assert.equal(restored.speed.restoredFromHistory,true);assert.ok(restored.speed.savedAt);
  assert.equal((await restarted.snapshot({conversationId:other})).speed,null);
});
test('empty or regressing backend results cannot overwrite useful history; newer requests update it',async t=>{
  const {history}=await fixture(t);let n=2;
  const store=new MetricsStore(client(async()=>raw(n)),{history});await store.snapshot({conversationId:id});
  n=0;assert.equal((await store.snapshot({conversationId:id,force:true})).speed.requests,2);
  n=1;assert.equal((await store.snapshot({conversationId:id,force:true})).speed.requests,2);
  n=3;const updated=await store.snapshot({conversationId:id,force:true});assert.equal(updated.speed.requests,3);assert.equal(updated.speed.restoredFromHistory,false);
  assert.equal((await history.load(scope('a@example.test'),id)).metrics.requests,3);
});
test('account isolation, malformed files, invalid paths and unknown schemas fail closed',async t=>{
  const {history}=await fixture(t);const a=scope('a');await history.save(a,id,trajectoryMetrics(raw()));
  assert.equal(await history.load(scope('b'),id),null);assert.throws(()=>history.file(a,'../escape'));
  await writeFile(history.file(a,id),'{broken');assert.equal(await history.load(a,id),null);
  await writeFile(history.file(a,id),JSON.stringify({schema:2,account:a,conversationId:id,savedAt:new Date().toISOString(),metrics:trajectoryMetrics(raw())}));assert.equal(await history.load(a,id),null);
});
test('concurrent saves are atomic and cannot regress counts',async t=>{
  const {dir,history}=await fixture(t);const a=scope('a');
  await Promise.all([history.save(a,id,trajectoryMetrics(raw(3))),history.save(a,id,trajectoryMetrics(raw(1)))]);
  assert.equal((await history.load(a,id)).metrics.requests,3);
  assert.deepEqual(await readdir(join(dir,a)),[id+'.json']);
});
test('quota or conversation-list failure does not block live conversation statistics',async t=>{
  const {history}=await fixture(t);const c=client();const call=c.call;c.call=async name=>{if(name!=='GetUserStatus')throw new Error('quota/list unavailable');return call(name);};
  const result=await new MetricsStore(c,{history}).snapshot({conversationId:id});assert.equal(result.speed.tps,50);assert.ok(result.error);
});
test('failed disk write keeps live metrics and surfaces a persistence warning',async()=>{
  const history={load:async()=>null,save:async()=>{throw new Error('disk full');}};
  const result=await new MetricsStore(client(),{history}).snapshot({conversationId:id});assert.equal(result.speed.tps,50);assert.ok(result.persistenceError);
});
test('parallel session requests merge; an account switch rejects an in-flight old result',async t=>{
  const {history}=await fixture(t);let finish,calls=0;
  const c=client(()=>{calls++;return new Promise(resolve=>{finish=resolve;});});const store=new MetricsStore(c,{history});await store.refreshQuota(true);
  const p=store.session(id),q=store.session(id);while(!finish)await new Promise(resolve=>setImmediate(resolve));
  store.identity=scope('b');store.sessions.clear();finish(raw());
  const results=await Promise.allSettled([p,q]);assert.equal(calls,1);assert.ok(results.every(r=>r.status==='rejected'));assert.equal(await history.load(scope('b'),id),null);
});
test('current standalone token is paired only with HTTP ports owned by that process',()=>{
  const log='listening on random port at 1234 for HTTP\nlistening on random port at 9999 for HTTP\n';
  const rows=[{ProcessId:10,CommandLine:'language_server.exe --standalone --csrf_token="current-test"',Ports:[1234,5000]},{ProcessId:11,CommandLine:'language_server.exe --csrf_token=sidecar-test',Ports:[9999]}];
  assert.deepEqual(serverFromDiscovery(log,rows),{pid:10,port:1234,csrf:'current-test'});
  assert.throws(()=>serverFromDiscovery(log,[{...rows[0],Ports:[5000]}]));
  assert.throws(()=>serverFromDiscovery(log,[rows[0],{...rows[0],ProcessId:12}]));
});
