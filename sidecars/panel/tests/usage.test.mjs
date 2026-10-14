import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {UsageLedger,DesktopUsage,usageRecords,dateKey,hourKey} from '../usage.mjs';
import {MetricsStore} from '../store.mjs';
const scope=s=>createHash('sha256').update(s).digest('hex'),account=scope('account A');
const id='11111111-1111-1111-1111-111111111111',other='22222222-2222-2222-2222-222222222222';
const raw=(options={})=>({trajectory:{steps:[{type:'CORTEX_STEP_TYPE_PLANNER_RESPONSE',metadata:{createdAt:'2026-10-10T16:05:00Z',...options.metadata}}],generatorMetadata:[{stepIndices:[0],chatModel:{modelDisplayName:options.model||'Gemini 3.8',...(options.start?{chatStartMetadata:{createdAt:options.start}}:{}),usage:{apiProvider:'API_PROVIDER_GOOGLE_GEMINI',responseId:'private-request-id',inputTokens:'100',cacheReadTokens:'900',cacheWriteTokens:'20',outputTokens:'80',thinkingOutputTokens:'30',...options.usage}}}]}});
async function fixture(t){const dir=await mkdtemp(join(tmpdir(),'ag-usage-'));t.after(()=>rm(dir,{recursive:true,force:true}));return new UsageLedger(dir);}
test('usage survives restart, upserts, and deduplicates across conversations',async t=>{
 const ledger=await fixture(t);await Promise.all([ledger.ingest(account,id,raw()),ledger.ingest(account,id,raw())]);
 await ledger.ingest(account,other,raw());let summary=await new UsageLedger(ledger.directory).summary(account,Date.parse('2026-10-11T02:00:00Z'));
 assert.equal(summary.totalTokens,1100);assert.equal(summary.requests,1);assert.equal(summary.todayTokens,1100);
 await ledger.ingest(account,id,raw({usage:{outputTokens:100}}));summary=await ledger.summary(account);assert.equal(summary.totalTokens,1120);
 await ledger.ingest(account,id,{trajectory:{generatorMetadata:[]}});assert.equal((await ledger.summary(account)).totalTokens,1120);
 const content=await readFile(ledger.file(account,id),'utf8');assert.equal(content.includes('private-request-id'),false);assert.equal(content.includes(id),false);
 assert.equal((await ledger.summary(scope('other'))).totalTokens,0);assert.throws(()=>ledger.file(account,'../escape'));
});
test('request time wins, planner-created is fallback, and unknown dates stay out of today',async t=>{
 assert.equal(dateKey(Date.parse('2026-10-10T16:05:00Z')),'2026-10-11');
 assert.equal(usageRecords(raw(),id)[0].timeBasis,'planner-created');
 const start=usageRecords(raw({start:'2026-10-10T15:59:59Z'}),id)[0];assert.equal(dateKey(start.at),'2026-10-10');assert.equal(start.timeBasis,'request-start');
 const ledger=await fixture(t);await ledger.ingest(account,id,raw({metadata:{createdAt:undefined}}));
 const summary=await ledger.summary(account,Date.parse('2026-10-11T02:00:00Z'));assert.equal(summary.unknownTokens,1100);assert.equal(summary.unknownRequests,1);assert.equal(summary.todayTokens,0);assert.equal(summary.totalTokens,1100);
 await ledger.ingest(account,id,raw());assert.equal((await ledger.summary(account)).unknownRequests,0);
});
test('thinking is included once, anomalous TPS is irrelevant, partial fields do not destroy known counts',async t=>{
 const r=usageRecords(raw(),id)[0];assert.equal(r.output,80);assert.equal(r.uncached+r.cacheRead+r.cacheWrite+r.output,1100);
 const ledger=await fixture(t);await ledger.ingest(account,id,raw());await ledger.ingest(account,id,raw({usage:{outputTokens:'invalid'}}));
 const summary=await ledger.summary(account);assert.equal(summary.totalTokens,1100);assert.equal(summary.partialRequests,1);
 const invalid=raw({usage:{inputTokens:'bad',cacheReadTokens:'bad',outputTokens:'50'}});assert.equal(usageRecords(invalid,id)[0].partial,true);
});
test('weekly/monthly buckets use the configured calendar, unreadable records are reported',async t=>{
 const ledger=await fixture(t);await ledger.ingest(account,id,raw({start:'2026-09-30T16:00:00Z'}));
 await ledger.ingest(account,other,raw({usage:{responseId:'request-two'},start:'2026-10-11T00:00:00Z'}));
 let summary=await ledger.summary(account,Date.parse('2026-10-11T08:00:00Z'));assert.equal(summary.monthTokens,2200);assert.equal(summary.weekTokens,1100);
 await writeFile(ledger.file(account,other),'{broken');summary=await new UsageLedger(ledger.directory).summary(account);assert.equal(summary.unreadableFiles,1);
});
test('backfill refreshes changed trajectories and isolates an account change in flight',async t=>{
 const ledger=await fixture(t);let calls=0,release;const store={identity:account,epoch:1,listConversations:async()=>[{id,modifiedAt:'one',status:'DONE'}],client:{trajectory:async()=>{calls++;return raw();}}};
 const tracker=new DesktopUsage(store,ledger);await tracker.sync();await tracker.sync();assert.equal(calls,1);assert.equal((await tracker.snapshot()).totalTokens,1100);
 store.listConversations=async()=>[{id:other,modifiedAt:'two',status:'DONE'}];store.client.trajectory=()=>new Promise(r=>{release=r;});
 const pending=tracker.sync();await new Promise(r=>setImmediate(r));store.identity=scope('B');store.epoch++;release(raw());await pending;
 assert.equal((await ledger.summary(store.identity)).totalTokens,0);
});
test('MetricsStore forwards authenticated raw records and preserves live speed on ledger failure',async()=>{
 const history={load:async()=>null,save:async()=>null};let scopeSeen=null;
 const client={discover:async()=>({pid:1}),call:async name=>name==='GetUserStatus'?{userStatus:{email:'fixture@example.test'}}:{},trajectory:async()=>raw()};
 const store=new MetricsStore(client,{history,onTrajectory:async s=>{scopeSeen=s;throw Error('disk unavailable');}});const result=await store.snapshot({conversationId:id});
 assert.equal(scopeSeen,scope('fixture@example.test'));assert.equal(store.usagePersistenceError,true);assert.equal(result.speed.counts.input,100);
 store.onTrajectory=async()=>{};await store.snapshot({conversationId:id,force:true});assert.equal(store.usagePersistenceError,false);
});
test('IDE usage keeps a separate ledger and source across collector restarts',async t=>{
 const desktop=await fixture(t),ide=new UsageLedger(join(desktop.directory,'ide'),{source:'ide-local'});
 const store={identity:account,epoch:1,listConversations:async()=>[{id,modifiedAt:'one',status:'DONE'}],client:{trajectory:async()=>raw()}};
 const tracker=new DesktopUsage(store,ide);await tracker.sync();assert.equal((await tracker.snapshot()).source,'ide-local');assert.equal((await tracker.snapshot()).totalTokens,1100);
 assert.equal((await desktop.summary(account)).totalTokens,0);
 const restarted=new DesktopUsage(store,new UsageLedger(ide.directory,{source:'ide-local'}));await restarted.sync();assert.equal((await restarted.snapshot()).totalTokens,1100);assert.equal((await restarted.snapshot()).requests,1);
});

test('hourKey and hourly aggregation correctly bucket usage by timeZone',async t=>{
 assert.equal(hourKey(Date.parse('2026-10-10T16:05:00Z'),'Asia/Shanghai'),0);
 assert.equal(hourKey(Date.parse('2026-10-10T06:30:00Z'),'Asia/Shanghai'),14);

 const ledger=await fixture(t);
 await ledger.ingest(account,id,raw({start:'2026-10-14T06:30:00Z'}));
 await ledger.ingest(account,other,raw({usage:{responseId:'req-2'},start:'2026-10-14T07:15:00Z'}));
 const summary=await ledger.summary(account,Date.parse('2026-10-14T10:00:00Z'));
 const day=summary.days.find(d=>d.date==='2026-10-14');
 assert.ok(day);
 assert.ok(day.hours);
 assert.equal(day.hours[14].requests,1);
 assert.equal(day.hours[14].total,1100);
 assert.equal(day.hours[15].requests,1);
 assert.equal(day.hours[15].total,1100);
 assert.equal(day.hours[10],undefined);
});
