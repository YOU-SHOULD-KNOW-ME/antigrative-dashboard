import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm,readFile,writeFile,mkdir,open,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as wait} from 'node:timers/promises';
import {UsageLedger,DesktopUsage,usageRecords} from '../usage.mjs';
import {MetricsStore} from '../store.mjs';
import {trajectoryMetrics} from '../metrics.mjs';
import {budgetError} from '../collection-state.mjs';
const scope='a'.repeat(64),id='11111111-1111-1111-1111-111111111111',other='22222222-2222-2222-2222-222222222222';
const hash=s=>createHash('sha256').update(s).digest('hex');
const row=(key,output=100)=>({id:hash(key),at:Date.parse('2026-10-30T01:00:00Z'),model:'Fixture',uncached:100,cacheRead:400,cacheWrite:0,output,partial:false,timeBasis:'request-start'});
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'pulse-usage-disk-'));t.after(()=>rm(root,{recursive:true,force:true}));const ledger=new UsageLedger(join(root,'ledger'));await mkdir(join(ledger.directory,scope),{recursive:true});return {root,ledger};}
function job(file,rows){const db=new DatabaseSync(file);db.exec('CREATE TABLE usage(id TEXT PRIMARY KEY,j TEXT)');const put=db.prepare('INSERT INTO usage VALUES(?,?)');for(const r of rows)put.run(r.id,JSON.stringify(r));db.close();}
async function summary(ledger){for(let i=0;i<100;i++){const result=await ledger.summary(scope,Date.parse('2026-10-30T03:00:00Z'));if(!ledger.diskSummaryPending)return result;await ledger.diskSummaryPending;}throw Error('Summary did not settle');}
async function until(check,ms=5000){const end=Date.now()+ms;while(!await check()){if(Date.now()>end)throw Error('Live usage did not settle');await wait(10);}}
test('disk ledger merges exact rows, preserves old JSON, deduplicates mixed files and caches summary',async t=>{
 const {root,ledger}=await fixture(t),old=row('old'),same=row('same');
 const original=JSON.stringify({schema:1,account:scope,records:[old,same]});await writeFile(ledger.file(scope,id),original);
 const file=join(root,'job.sqlite');job(file,[{...same,output:200},row('new')]);
 await ledger.ingestDisk(scope,id,file);assert.equal(await readFile(ledger.file(scope,id),'utf8'),original);
 await writeFile(ledger.file(scope,other),JSON.stringify({schema:1,account:scope,records:[row('new'),row('fourth')]}));
 const result=await summary(ledger);assert.equal(result.requests,4);assert.equal(result.totalTokens,2500);assert.equal(result.unreadableFiles,0);
 assert.equal(await ledger.summary(scope,Date.parse('2026-10-30T03:00:00Z')),result);
 await ledger.ingestDiskRows(scope,id,{records:[{...same,output:null,at:null}]});const updated=await summary(ledger);assert.equal(updated.totalTokens,2500);assert.equal(updated.unknownRequests,0);
});
test('cancelled disk import does not replace a prior complete ledger',async t=>{
 const {root,ledger}=await fixture(t),file=join(root,'job.sqlite');job(file,[row('a')]);await ledger.ingestDisk(scope,id,file);const target=ledger.file(scope,id).replace(/\.json$/,'.sqlite'),before=await readFile(target);
 await ledger.ingestDisk(scope,id,file,{isCurrent:()=>false});assert.deepEqual(await readFile(target),before);
 const oldJob=ledger.diskJob.bind(ledger);let current=true;ledger.diskJob=async(...args)=>{const value=await oldJob(...args);current=false;return value;};
 await ledger.ingestDisk(scope,id,file,{isCurrent:()=>current});assert.deepEqual(await readFile(target),before);
});
test('front-end summary does not wait for a disk import and mixed invalid JSON cannot leak partial rows',async t=>{
 const {root,ledger}=await fixture(t),file=join(root,'job.sqlite');job(file,[row('a')]);await ledger.ingestDisk(scope,id,file);const before=await summary(ledger);
 let release;const pending=new Promise(r=>release=r),original=ledger.diskJob.bind(ledger);ledger.diskJob=async(...args)=>{await pending;return original(...args);};
 const write=ledger.ingestDisk(scope,id,file);const response=await Promise.race([ledger.summary(scope,Date.parse('2026-10-30T03:00:00Z')),wait(200).then(()=>{throw Error('Foreground blocked');})]);assert.deepEqual(response,{...before,summaryStale:true});release();await write;
 await writeFile(ledger.file(scope,other),JSON.stringify({schema:1,account:'wrong',records:[row('must-not-count')]}));
 const result=await summary(ledger);assert.equal(result.requests,1);assert.equal(result.unreadableFiles,1);
});

test('legacy JSON above the old 16MiB cap imports and summarizes without a whole-file parse',{timeout:120000},async t=>{
 const {root,ledger}=await fixture(t),count=60000,file=ledger.file(scope,id),handle=await open(file,'w');
 try{await handle.write('{"schema":1,"account":"'+scope+'","records":[');let chunk='';for(let i=0;i<count;i++){const value={...row('large-'+i),model:'Model '+'X'.repeat(100)};chunk+=(i?',':'')+JSON.stringify(value);if(i%128===127){await handle.write(chunk);chunk='';}}if(chunk)await handle.write(chunk);await handle.write(']}');}finally{await handle.close();}
 assert.ok((await stat(file)).size>16*1024*1024);const jobFile=join(root,'empty-job.sqlite');job(jobFile,[]);
 await ledger.ingestDisk(scope,id,jobFile);const result=await summary(ledger);assert.equal(result.requests,count);assert.equal(result.totalTokens,count*600);assert.equal(result.unreadableFiles,0);
});

test('backfill reuses only a revision-matching background result that was fully ingested',async t=>{
 const {ledger}=await fixture(t);let calls=0;const summary={id,stepCount:10,modifiedAt:'rev-one',status:'DONE'};
 const entry={backgroundUsageComplete:true,backgroundRevision:JSON.stringify([10,'rev-one','DONE',null]),data:{delegatedConversations:[]}};
 const store={identity:scope,epoch:1,sessions:new Map([[id,entry]]),listConversations:async()=>[summary],client:{trajectory:async()=>{calls++;throw Error('Expected ordinary collector remains bounded');}}};
 const tracker=new DesktopUsage(store,ledger);t.after(()=>tracker.dispose());await tracker.sync(true);assert.equal(calls,0);assert.equal(tracker.status,'ready');
 entry.backgroundUsageComplete=false;await tracker.sync(true);assert.equal(calls,1);assert.equal(tracker.status,'partial');
 entry.backgroundUsageComplete=true;summary.modifiedAt='rev-two';await tracker.sync(true);assert.equal(calls,2);assert.equal(tracker.status,'partial');
});

// A compacted conversation can become small enough to use the normal reader
// again after its long-history ledger has migrated to SQLite. The next ordinary
// polls must not rebuild the full ledger or invalidate its summary.
test('post-restart ordinary polling does not rewrite an unchanged SQLite ledger and later records are added',async t=>{
 const {ledger}=await fixture(t);
 const generator=key=>({chatModel:{modelDisplayName:'Fixture',usage:{messageId:key,inputTokens:100,cacheReadTokens:400,outputTokens:100,responseOutputTokens:100,apiProvider:'API_PROVIDER_GOOGLE_GEMINI'},chatStartMetadata:{createdAt:'2026-10-30T01:00:00Z'}}});
 const raw={trajectory:{cascadeId:id,steps:[],generatorMetadata:[generator('one')]}};
 await ledger.ingestDiskRows(scope,id,{records:usageRecords(raw,id)});
 const file=ledger.file(scope,id).replace(/\.json$/,'.sqlite'),before=await readFile(file);
 // A fresh UsageLedger deliberately starts with no in-memory signatures.
 const restarted=new UsageLedger(ledger.directory);let mergeWorkers=0;const diskJob=restarted.diskJob.bind(restarted);
 restarted.diskJob=(input,options)=>{if(input.action==='merge')mergeWorkers++;return diskJob(input,options);};
 await restarted.ingest(scope,id,raw);assert.equal(mergeWorkers,1,'the first post-restart poll validates existing rows');
 assert.equal(restarted.revision,0,'a verified unchanged ledger is not republished');assert.deepEqual(await readFile(file),before);
 const initial=await summary(restarted);assert.equal(initial.requests,1);assert.equal(initial.totalTokens,600);
 for(let i=0;i<4;i++)await restarted.ingest(scope,id,raw);
 assert.equal(mergeWorkers,1,'subsequent identical polls use the verified bounded signature');
 assert.equal(restarted.revision,0);assert.equal(await restarted.summary(scope,Date.parse('2026-10-30T03:00:00Z')),initial,'summary cache remains valid');
 const updated={trajectory:{...raw.trajectory,generatorMetadata:[...raw.trajectory.generatorMetadata,generator('two')]}};
 await restarted.ingest(scope,id,updated);assert.equal(mergeWorkers,2);assert.equal(restarted.revision,1);
 const final=await summary(restarted);assert.equal(final.requests,2);assert.equal(final.totalTokens,1200);
});

// A large SQLite migration must not hold up another conversation's ordinary
// JSON write. Writes to the same logical ledger still queue in submission order.
test('large disk import leaves another conversation responsive and same-ledger writes serialized',async t=>{
 const {root,ledger}=await fixture(t),file=join(root,'long-job.sqlite');job(file,[row('background')]);
 let release,started;const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;});
 const diskJob=ledger.diskJob.bind(ledger);ledger.diskJob=async(input,options)=>{if(input.action==='merge'&&input.jobDb===file){started();await gate;}return diskJob(input,options);};
 const raw=key=>({trajectory:{steps:[],generatorMetadata:[{chatModel:{modelDisplayName:'Fixture',usage:{messageId:key,inputTokens:100,cacheReadTokens:400,outputTokens:100,apiProvider:'API_PROVIDER_GOOGLE_GEMINI'},chatStartMetadata:{createdAt:'2026-10-30T01:00:00Z'}}}]}});
 const background=ledger.ingestDisk(scope,id,file);await entered;
 const small=ledger.ingest(scope,other,raw('other')),same=ledger.ingest(scope,id,raw('same'));
 try{
  assert.equal(await Promise.race([small.then(()=>true),wait(1500).then(()=>false)]),true,'unrelated conversation must not wait for long import');
  assert.equal(await Promise.race([same.then(()=>true),wait(100).then(()=>false)]),false,'same-ledger write must wait for its migration');
  assert.equal(await Promise.race([ledger.queue.then(()=>true),wait(100).then(()=>false)]),false,'public queue includes the outstanding long write');
 }finally{release();}
 await Promise.all([background,small,same]);await ledger.queue;
 const result=await summary(ledger);assert.equal(result.requests,3);assert.equal(result.totalTokens,1800);
 assert.equal(ledger._files.size,0);assert.equal(ledger._writes.size,0);assert.equal(ledger.diskWrites,0);
});

test('same-ledger queued write respects revoked ownership during disk migration',async t=>{
 const {root,ledger}=await fixture(t),file=join(root,'cancel-job.sqlite');job(file,[row('background')]);
 let release,started,owned=true;const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;});
 const diskJob=ledger.diskJob.bind(ledger);ledger.diskJob=async(input,options)=>{if(input.action==='merge'&&input.jobDb===file){started();await gate;}return diskJob(input,options);};
 const background=ledger.ingestDisk(scope,id,file);await entered;
 const raw={trajectory:{steps:[],generatorMetadata:[{chatModel:{usage:{messageId:'revoked',inputTokens:10,outputTokens:10}}}]}};
 const stale=ledger.ingest(scope,id,raw,{isCurrent:()=>owned});owned=false;release();await Promise.all([background,stale]);
 const result=await summary(ledger);assert.equal(result.requests,1);assert.equal(result.totalTokens,600);
});

test('per-ledger write queue is bounded and releases entries after completion',async t=>{
 const {ledger}=await fixture(t);let release;ledger.queue=new Promise(resolve=>{release=resolve;});
 const pending=Array.from({length:32},(_,i)=>ledger.enqueue('fixture-'+i,()=>i));
 await assert.rejects(ledger.enqueue('overflow',()=>null),/queue is full/);
 assert.equal(ledger._files.size,32);release();await Promise.all(pending);await ledger.queue;
 assert.equal(ledger._files.size,0);assert.equal(ledger._writes.size,0);
});

// An async disk existence check must not allow a later, richer import to overtake
// an earlier normal observation of the same request.
test('normal write reserves its conversation slot before checking disk existence',async t=>{
 const {root,ledger}=await fixture(t);let release,started,first=true;const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;});
 const exists=ledger.diskExists.bind(ledger);ledger.diskExists=async(...args)=>{if(first){first=false;started();await gate;}return exists(...args);};
 const raw={trajectory:{steps:[],generatorMetadata:[{chatModel:{modelDisplayName:'Fixture',usage:{messageId:'same-order',inputTokens:100,cacheReadTokens:400,outputTokens:100,apiProvider:'API_PROVIDER_GOOGLE_GEMINI'},chatStartMetadata:{createdAt:'2026-10-30T01:00:00Z'}}}]}};
 const old=usageRecords(raw,id)[0],newer={...old,output:200},file=join(root,'ordering-job.sqlite');job(file,[newer]);
 const early=ledger.ingest(scope,id,raw);await entered;const later=ledger.ingestDisk(scope,id,file);
 try{assert.equal(await Promise.race([later.then(()=>true),wait(150).then(()=>false)]),false,'later import must wait for earlier same-conversation write');}finally{release();}
 await Promise.all([early,later]);const result=await summary(ledger);assert.equal(result.requests,1);assert.equal(result.totalTokens,700,'later observation must be retained');
});

// Exercise the actual foreground store while a different conversation's disk
// worker is held. The API must return its metrics without waiting for that job.
test('foreground MetricsStore snapshot remains responsive during another conversation disk import',async t=>{
 const {root,ledger}=await fixture(t),file=join(root,'foreground-job.sqlite');job(file,[row('background')]);
 let release,started;const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;});
 const diskJob=ledger.diskJob.bind(ledger);ledger.diskJob=async(input,options)=>{if(input.action==='merge'&&input.jobDb===file){started();await gate;}return diskJob(input,options);};
 const raw={trajectory:{cascadeId:other,steps:[],generatorMetadata:[{chatModel:{modelDisplayName:'Fixture',streamingDuration:'2s',usage:{messageId:'foreground',inputTokens:100,cacheReadTokens:400,outputTokens:100,responseOutputTokens:100,apiProvider:'API_PROVIDER_GOOGLE_GEMINI'},chatStartMetadata:{createdAt:'2026-10-30T01:00:00Z',contextWindowMetadata:{estimatedTokensUsed:12,maxContextTokens:100}}}}]}};
 const client={discover:async()=>({pid:1}),trajectory:async()=>raw};
 const store=new MetricsStore(client,{history:{load:async()=>null,save:async()=>({savedAt:'2026-10-30T01:00:00Z'})},transcripts:null,onTrajectory:(account,conversation,value)=>ledger.ingest(account,conversation,value)});
 store.identity=scope;store.serverPid=1;store.refreshQuota=async()=>{store.quota=[];};t.after(()=>store.dispose());
 const background=ledger.ingestDisk(scope,id,file);await entered;
 try{const snapshot=await Promise.race([store.snapshot({conversationId:other,force:true}),wait(1500).then(()=>{throw Error('Foreground snapshot waited for unrelated background import');})]);assert.equal(snapshot.speed.tps,50);assert.equal(snapshot.speed.context.usedFraction,.12);}
 finally{release();}
 await background;await ledger.queue;const total=await summary(ledger);assert.equal(total.requests,2);assert.equal(total.totalTokens,1200);
});

test('continuous writes display a stale syncing summary without repeated scans and converge after idle',async t=>{
 const {ledger}=await fixture(t),now=Date.now();await ledger.ingestDiskRows(scope,id,{records:[row('baseline')]});
 let initial=await ledger.summary(scope,now);if(ledger.diskSummaryPending){await ledger.diskSummaryPending;initial=await ledger.summary(scope,now);}
 assert.equal(initial.totalTokens,600);assert.equal(initial.requests,1);
 const store={identity:scope,epoch:1,client:{}},tracker=new DesktopUsage(store,ledger);tracker.scope=scope;tracker.scopeEpoch=1;tracker.status='ready';t.after(()=>tracker.dispose());
 let release,started,scans=0;const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;});
 const diskJob=ledger.diskJob.bind(ledger);ledger.diskJob=async(input,options)=>{
  const value=await diskJob(input,options);
  if(input.action==='summary'){scans++;started();await gate;}
  return value;
 };
 const raw=names=>({trajectory:{steps:[],generatorMetadata:names.map(name=>({chatModel:{modelDisplayName:'Fixture',usage:{messageId:name,inputTokens:100,cacheReadTokens:400,outputTokens:100,apiProvider:'API_PROVIDER_GOOGLE_GEMINI'},chatStartMetadata:{createdAt:'2026-10-30T01:00:00Z'}}}))}});
 const names=['one'];await ledger.ingest(scope,other,raw(names));
 let view=await tracker.snapshot({sync:false});assert.equal(view.totalTokens,600);assert.equal(view.summaryStale,true);assert.equal(view.syncing,true);assert.equal(view.status,'syncing');
 await entered;
 try{
  for(const next of ['two','three','four']){names.push(next);await ledger.ingest(scope,other,raw(names));view=await tracker.snapshot({sync:false});assert.equal(view.summaryStale,true);assert.equal(view.syncing,true);}
  const tomorrow=await ledger.summary(scope,now+86400000);assert.equal(tomorrow.todayTokens,null,'a previous-day result cannot be reused for a different day');
  const different=await ledger.summary('b'.repeat(64),now);assert.equal(different.accountKey,'b'.repeat(64));assert.equal(different.totalTokens,0,'cached usage must never cross account scopes');
 }finally{release();}
 await ledger.diskSummaryPending;
 view=await tracker.snapshot({sync:false});assert.equal(view.totalTokens,1200,'completed older scan is a marked interim result');assert.equal(view.summaryStale,true);assert.equal(view.syncing,true);
 for(let i=0;i<5;i++)await tracker.snapshot({sync:false});assert.equal(scans,1,'write churn must not trigger immediate full scans');
 assert.ok(ledger.diskSummaryRetry.at>Date.now());ledger.diskSummaryRetry.at=0;
 await tracker.snapshot({sync:false});await ledger.diskSummaryPending;
 view=await tracker.snapshot({sync:false});assert.equal(view.totalTokens,3000);assert.equal(view.requests,5);assert.equal(view.summaryStale,undefined);assert.equal(view.syncing,false);assert.equal(view.status,'ready');assert.equal(scans,2);
});

test('desktop disk import honors caller cancellation even if account and epoch stay unchanged',async t=>{
 const {root,ledger}=await fixture(t),file=join(root,'cancel-current-job.sqlite');job(file,[row('old')]);await ledger.ingestDisk(scope,id,file);
 const target=ledger.file(scope,id).replace(/\.json$/,'.sqlite'),before=await readFile(target),newer=join(root,'cancel-new-job.sqlite');job(newer,[row('new')]);
 const store={identity:scope,epoch:1,client:{}},tracker=new DesktopUsage(store,ledger);t.after(()=>tracker.dispose());
 let release,started,current=true;const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;});
 const diskJob=ledger.diskJob.bind(ledger);ledger.diskJob=async(...args)=>{const result=await diskJob(...args);started();await gate;return result;};
 const pending=tracker.ingestDisk(scope,id,newer,{isCurrent:()=>current});await entered;current=false;release();await pending;
 assert.equal(store.identity,scope);assert.equal(store.epoch,1);assert.deepEqual(await readFile(target),before,'late worker output must not replace the previous ledger');
 const result=await summary(ledger);assert.equal(result.requests,1);assert.equal(result.totalTokens,600);
});

const liveRaw=(conversation,names)=>({trajectory:{cascadeId:conversation,steps:[],generatorMetadata:names.map(name=>({chatModel:{modelDisplayName:'Fixture',streamingDuration:'2s',usage:{messageId:name,inputTokens:100,cacheReadTokens:400,outputTokens:100,responseOutputTokens:100,apiProvider:'API_PROVIDER_GOOGLE_GEMINI'},chatStartMetadata:{createdAt:'2026-10-30T01:00:00Z',contextWindowMetadata:{estimatedTokensUsed:12,maxContextTokens:100}}}}))}});

test('foreground SQLite metrics return while another SQLite import runs, then live rows are persisted',async t=>{
 const {root,ledger}=await fixture(t),file=join(root,'live-long.sqlite');job(file,[row('background')]);
 await ledger.ingestDiskRows(scope,other,{records:usageRecords(liveRaw(other,['seed']),other)});
 let release,started;const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;});
 const run=ledger.runDiskJob.bind(ledger);ledger.runDiskJob=async(input,options)=>{if(input.action==='merge'&&input.jobDb===file){started();await gate;}return run(input,options);};
 const client={discover:async()=>({pid:1}),trajectory:async()=>liveRaw(other,['seed','new'])};
 const store=new MetricsStore(client,{history:{load:async()=>null,save:async()=>({savedAt:'2026-10-30T01:00:00Z'})},transcripts:null});store.identity=scope;store.serverPid=1;store.refreshQuota=async()=>{store.quota=[];};
 const tracker=new DesktopUsage(store,ledger,{livePollMs:10,liveRetryMs:20});store.onTrajectory=(account,conversation,raw)=>tracker.ingestLive(account,conversation,raw);t.after(()=>{tracker.dispose();store.dispose();});
 const background=ledger.ingestDisk(scope,id,file);await entered;
 try{const result=await Promise.race([store.snapshot({conversationId:other,force:true}),wait(1500).then(()=>{throw Error('SQLite foreground waited for the unrelated import');})]);assert.equal(result.speed.tps,50);assert.ok(tracker.liveStates.size>0);}
 finally{release();}
 await background;await until(()=>tracker.liveStates.size===0&&tracker.liveRows===0);await ledger.queue;
 const result=await summary(ledger);assert.equal(result.requests,3);assert.equal(result.totalTokens,1800);
});

test('live polling coalesces bounded numeric rows with sparse fields and keeps no raw conversation',async t=>{
 const {root,ledger}=await fixture(t),file=join(root,'live-coalesce.sqlite');job(file,[row('background')]);
 let release,started;const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;});
 const run=ledger.runDiskJob.bind(ledger);ledger.runDiskJob=async(input,options)=>{if(input.action==='merge'&&input.jobDb===file){started();await gate;}return run(input,options);};
 const background=ledger.ingestDisk(scope,id,file);await entered;
 const store=new MetricsStore({reader:{}},{transcripts:null});store.identity=scope;const tracker=new DesktopUsage(store,ledger,{livePollMs:10,liveRetryMs:20});t.after(()=>{tracker.dispose();store.dispose();});
 const first=liveRaw(other,['same']);first.trajectory.steps=[{secret:'SECRET CHAT CONTENT'}];first.trajectory.generatorMetadata[0].chatModel.usage.outputTokens=null;
 const later=liveRaw(other,['same']);Object.assign(later.trajectory.generatorMetadata[0].chatModel.usage,{inputTokens:null,cacheReadTokens:null,outputTokens:100});
 try{
  assert.deepEqual(tracker.ingestLive(scope,other,first),{deferred:true});
  for(let i=0;i<100;i++)assert.deepEqual(tracker.ingestLive(scope,other,later),{deferred:true});
  assert.ok(tracker.liveRows<=2);assert.ok(tracker.liveBytes<tracker.liveMaxBytes);
  const projected=[...tracker.liveStates.values()].flatMap(state=>[...state.pending.flatMap(group=>[...group.rows.values()]),...(state.batch?[...state.batch.rows.values()]:[])]);
  assert.equal(JSON.stringify(projected).includes('SECRET CHAT CONTENT'),false);
 }finally{release();}
 await background;await until(()=>tracker.liveStates.size===0);const value=await summary(ledger);assert.equal(value.requests,2);assert.equal(value.totalTokens,1200);
});

test('failed live writes retry and a successful unrelated background import cannot clear their error',async t=>{
 const {root,ledger}=await fixture(t),file=join(root,'live-other.sqlite');job(file,[row('background')]);
 const store=new MetricsStore({reader:{}},{history:{save:async()=>({savedAt:'2026-10-30T01:00:00Z'})},transcripts:null});store.identity=scope;const tracker=new DesktopUsage(store,ledger,{livePollMs:10,liveRetryMs:30});store.onBackgroundResult=(...args)=>tracker.ingestDisk(...args);t.after(()=>{tracker.dispose();store.dispose();});
 const original=ledger.ingestRows.bind(ledger);let fail=true,attempts=0;ledger.ingestRows=(...args)=>{attempts++;return fail?Promise.reject(Error('synthetic disk failure')):original(...args);};
 tracker.ingestLive(scope,id,liveRaw(id,['live']));await until(()=>store.usagePersistenceError===true);assert.equal(store.usagePersistenceFailures.has('live'),true);
 const entry={data:null};store.sessions.set(other,entry);const raw=liveRaw(other,['unused']);
 await store.acceptBackground(scope,other,{metrics:trajectoryMetrics(raw),delegatedIds:[]},{database:file,revision:'fixture',isCurrent:()=>true});
 assert.equal(entry.backgroundUsageComplete,true);assert.equal(store.usagePersistenceError,true);assert.equal(store.usagePersistenceFailures.has('live'),true);
 fail=false;await until(()=>!store.usagePersistenceError&&tracker.liveStates.size===0);assert.ok(attempts>=2);
 const value=await summary(ledger);assert.equal(value.requests,2);assert.equal(value.totalTokens,1200);
});

test('scope change cancels deferred live SQLite data without publishing it',async t=>{
 const {root,ledger}=await fixture(t),file=join(root,'live-scope.sqlite');job(file,[row('background')]);
 await ledger.ingestDiskRows(scope,other,{records:usageRecords(liveRaw(other,['seed']),other)});
 const target=ledger.file(scope,other).replace(/\.json$/,'.sqlite'),before=await readFile(target);
 let release,started;const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;});
 const run=ledger.runDiskJob.bind(ledger);ledger.runDiskJob=async(input,options)=>{if(input.action==='merge'&&input.jobDb===file){started();await gate;}return run(input,options);};
 const store=new MetricsStore({reader:{}},{transcripts:null});store.identity=scope;const tracker=new DesktopUsage(store,ledger,{livePollMs:10});t.after(()=>{tracker.dispose();store.dispose();});
 const background=ledger.ingestDisk(scope,id,file);await entered;tracker.ingestLive(scope,other,liveRaw(other,['seed','late']));
 store.identity='b'.repeat(64);store.epoch++;tracker.refreshLiveScope();release();await background;await wait(50);await ledger.queue;
 assert.deepEqual(await readFile(target),before);assert.equal(tracker.liveStates.size,0);assert.equal(tracker.liveRows,0);
});

test('live overflow is visible, retries only its conversation and never starts a full history scan',async t=>{
 const {root,ledger}=await fixture(t),file=join(root,'live-overflow.sqlite');job(file,[row('background')]);
 let release,started,fullScans=0;const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;});
 const run=ledger.runDiskJob.bind(ledger);ledger.runDiskJob=async(input,options)=>{if(input.action==='merge'&&input.jobDb===file){started();await gate;}return run(input,options);};
 const store=new MetricsStore({reader:{},trajectory:async()=>liveRaw(other,['one','two'])},{transcripts:null});store.identity=scope;store.listConversations=async()=>{fullScans++;return [];};
 const tracker=new DesktopUsage(store,ledger,{liveMaxRows:1,livePollMs:10,liveRetryMs:20});t.after(()=>{tracker.dispose();store.dispose();});
 const background=ledger.ingestDisk(scope,id,file);await entered;tracker.ingestLive(scope,other,liveRaw(other,['one']));
 await until(()=>tracker.liveStates.get(scope+':'+other)?.batch);tracker.ingestLive(scope,other,liveRaw(other,['two']));
 assert.equal(store.usagePersistenceError,true);assert.ok(tracker.liveRows<=1);assert.equal(fullScans,0);
 tracker.liveMaxRows=3;release();await background;await until(()=>tracker.liveStates.size===0&&!store.usagePersistenceError);assert.equal(fullScans,0);
 const value=await summary(ledger);assert.equal(value.requests,3);assert.equal(value.totalTokens,1800);
});

test('exhausting live recovery IDs stays visible without automatically scanning all histories',async t=>{
 const {root,ledger}=await fixture(t),file=join(root,'live-exhausted.sqlite');job(file,[row('background')]);
 let release,started,fullScans=0;const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;});
 const run=ledger.runDiskJob.bind(ledger);ledger.runDiskJob=async(input,options)=>{if(input.action==='merge'&&input.jobDb===file){started();await gate;}return run(input,options);};
 const store=new MetricsStore({reader:{},trajectory:async conversation=>liveRaw(conversation,['recovered-'+conversation])},{transcripts:null});store.identity=scope;store.listConversations=async()=>{fullScans++;return [];};
 const tracker=new DesktopUsage(store,ledger,{liveMaxConversations:1,liveMaxRecoveries:1,livePollMs:10,liveRecoveryPollMs:10,liveRetryMs:20});t.after(()=>{tracker.dispose();store.dispose();});
 const third='33333333-3333-3333-3333-333333333333',fourth='44444444-4444-4444-4444-444444444444';
 const background=ledger.ingestDisk(scope,id,file);await entered;
 tracker.ingestLive(scope,other,liveRaw(other,['first']));tracker.ingestLive(scope,third,liveRaw(third,['second']));tracker.ingestLive(scope,fourth,liveRaw(fourth,['third']));
 assert.equal(tracker.liveStates.size,1);assert.equal(tracker.liveRecoveries.size,1);assert.equal(tracker.liveUnknownOverflow,true);assert.equal(store.usagePersistenceError,true);
 release();await background;await until(()=>tracker.liveStates.size===0&&tracker.liveRecoveries.size===0);assert.equal(fullScans,0);assert.equal(store.usagePersistenceError,true,'untracked overflow cannot be reported as recovered');
});

test('an oversized live projection uses only its background collector; failure and cancellation stay visible',async t=>{
 const {root,ledger}=await fixture(t),file=join(root,'live-oversized.sqlite'),third='33333333-3333-3333-3333-333333333333';
 const raw=liveRaw(id,['one','two']);job(file,usageRecords(raw,id));let reads=0,requests=0,mode='fail',status=null;
 const store=new MetricsStore({reader:{},trajectory:async()=>{reads++;return raw;}},{history:{save:async()=>({savedAt:'2026-10-30T01:00:00Z'})},transcripts:null});store.identity=scope;
 const tracker=new DesktopUsage(store,ledger,{liveMaxRows:1,livePollMs:10,liveRetryMs:25,liveBackgroundPollMs:10,liveBackgroundRetryMs:100});t.after(()=>{tracker.dispose();store.dispose();});
 store.onBackgroundResult=(...args)=>tracker.ingestDisk(...args);const entry={data:null};store.sessions.set(id,entry);
 store.background={state:()=>status,request:(account,conversation,endpoint,{isCurrent})=>{
  requests++;status={state:'processing'};
  setTimeout(async()=>{if(mode==='fail'){status={state:'limited'};return;}try{await store.acceptBackground(scope,id,{metrics:trajectoryMetrics(raw),delegatedIds:[]},{database:file,revision:'fixture',isCurrent});status=null;}catch{status={state:'limited'};}},5);
  return true;
 },dispose(){}};
 const ingest=ledger.ingestRows.bind(ledger);let otherFails=true;ledger.ingestRows=(account,conversation,...args)=>conversation===third&&otherFails?Promise.reject(Error('other failure')):ingest(account,conversation,...args);
 tracker.ingestLive(scope,third,liveRaw(third,['unrelated']));await until(()=>tracker.liveStates.get(scope+':'+third)?.failed);
 tracker.ingestLive(scope,id,raw);await until(()=>status?.state==='limited');assert.equal(store.usagePersistenceError,true);assert.equal(reads,0);assert.equal(requests,1);
 // A cancelled result from the same conversation must not count as committed.
 await tracker.ingestDisk(scope,id,file,{isCurrent:()=>false});assert.equal(tracker.liveStates.get(scope+':'+id).backgroundCommitted,false);assert.equal(store.usagePersistenceError,true);
 mode='success';await until(()=>entry.backgroundUsageComplete===true);await until(()=>!tracker.liveStates.has(scope+':'+id));
 assert.equal(store.usagePersistenceError,true,'the unrelated failed live write must remain visible');assert.equal(reads,0);assert.ok(requests>=2);
 otherFails=false;await until(()=>!store.usagePersistenceError);const value=await summary(ledger);assert.equal(value.requests,3);assert.equal(value.totalTokens,1800);
});

test('oversized live data without a background collector stops rereading and stays visibly incomplete',async t=>{
 const {ledger}=await fixture(t);let reads=0,fullScans=0;const store=new MetricsStore({reader:{},trajectory:async()=>{reads++;return liveRaw(id,['one','two']);}},{transcripts:null});store.identity=scope;store.listConversations=async()=>{fullScans++;return [];};
 const tracker=new DesktopUsage(store,ledger,{liveMaxRows:1,livePollMs:10,liveRetryMs:20});t.after(()=>{tracker.dispose();store.dispose();});
 const raw=liveRaw(id,['one','two']);tracker.ingestLive(scope,id,raw);await until(()=>tracker.liveStates.get(scope+':'+id)?.halted);
 for(let i=0;i<5;i++)tracker.ingestLive(scope,id,raw);await wait(100);
 assert.equal(reads,0);assert.equal(fullScans,0);assert.equal(store.usagePersistenceError,true);
});

test('usage snapshot never waits for a slow JSON write and checkpoint writes do not trigger syncing',async t=>{
 const {ledger}=await fixture(t),store=new MetricsStore({reader:{}},{transcripts:null});store.identity=scope;
 const tracker=new DesktopUsage(store,ledger,{livePollMs:10});tracker.scope=scope;tracker.scopeEpoch=store.epoch;tracker.status='ready';t.after(()=>{tracker.dispose();store.dispose();});
 await ledger.ingest(scope,id,liveRaw(id,['one']));let view=await tracker.snapshot({sync:false});assert.equal(view.totalTokens,600);
 let release,started;const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;});const writeRecord=ledger.writeRecord.bind(ledger);
 ledger.writeRecord=async(file,content)=>{if(file.includes('.json.')){started();await gate;}return writeRecord(file,content);};
 const writing=ledger.ingest(scope,id,liveRaw(id,['one','two']));await entered;
 try{
  view=await Promise.race([tracker.snapshot({sync:false}),wait(1500).then(()=>{throw Error('Usage snapshot waited for JSON');})]);assert.equal(view.totalTokens,600);assert.equal(view.summaryStale,true);assert.equal(view.syncing,true);
  const tomorrow=await ledger.summary(scope,Date.now()+86400000);assert.equal(tomorrow.todayTokens,null);assert.equal(tomorrow.summaryStale,true);
  const foreign=await ledger.summary('b'.repeat(64));assert.equal(foreign.accountKey,'b'.repeat(64));assert.equal(foreign.totalTokens,0);
  ledger.cache=null;view=await tracker.snapshot({sync:false});assert.equal(view.totalTokens,null);assert.equal(view.summaryStale,true);
 }finally{release();}
 await writing;view=await tracker.snapshot({sync:false});assert.equal(view.totalTokens,1200);assert.equal(view.summaryStale,undefined);assert.equal(view.syncing,false);
 let releaseCheckpoint,checkpointStarted;const checkpointGate=new Promise(resolve=>{releaseCheckpoint=resolve;}),checkpointEntered=new Promise(resolve=>{checkpointStarted=resolve;});
 ledger.writeRecord=async(file,content)=>{if(file.includes('backfill-v1.json.')){checkpointStarted();await checkpointGate;}return writeRecord(file,content);};
 const checkpoint=ledger.saveBackfillState(scope,'app',{});await checkpointEntered;
 try{view=await Promise.race([tracker.snapshot({sync:false}),wait(1500).then(()=>{throw Error('Usage snapshot waited for checkpoint');})]);assert.equal(view.totalTokens,1200);assert.equal(view.syncing,false);}finally{releaseCheckpoint();}
 await checkpoint;
});

test('independent source guards isolate cancelled rows within the same account and conversation',async t=>{
 const {root,ledger}=await fixture(t),file=join(root,'guard-sources.sqlite');job(file,[row('background')]);
 let release,started;const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;});const run=ledger.runDiskJob.bind(ledger);
 ledger.runDiskJob=async(input,options)=>{if(input.action==='merge'&&input.jobDb===file){started();await gate;}return run(input,options);};
 const store=new MetricsStore({reader:{}},{transcripts:null});store.identity=scope;const tracker=new DesktopUsage(store,ledger,{livePollMs:10});t.after(()=>{tracker.dispose();store.dispose();});
 const background=ledger.ingestDisk(scope,id,file);await entered;let first=true,second=true;const sourceA={},sourceB={};
 tracker.ingestLive(scope,other,liveRaw(other,['old']),{isCurrent:()=>first,guardKey:sourceA});
 tracker.ingestLive(scope,other,liveRaw(other,['valid']),{isCurrent:()=>second,guardKey:sourceB});
 first=false;release();await background;await until(()=>tracker.liveStates.size===0);const value=await summary(ledger);assert.equal(value.requests,2);assert.equal(value.totalTokens,1200);assert.equal(tracker.liveGroups,0);
 // A guard invalidated while the wrapper awaited ownership must not enqueue.
 tracker.ingestLive(scope,other,liveRaw(other,['late']),{isCurrent:()=>false,guardKey:sourceA});assert.equal(tracker.liveStates.size,0);second=false;
});

test('a newer foreground failure survives an earlier successful live write until newer data persists',async t=>{
 const {ledger}=await fixture(t),store=new MetricsStore({reader:{}},{transcripts:null});store.identity=scope;const tracker=new DesktopUsage(store,ledger,{livePollMs:10});t.after(()=>{tracker.dispose();store.dispose();});
 let release,started;const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;});const writeRecord=ledger.writeRecord.bind(ledger);
 ledger.writeRecord=async(...args)=>{started();await gate;return writeRecord(...args);};
 store.setUsagePersistenceError('foreground:'+id,true);tracker.ingestLive(scope,id,liveRaw(id,['old']));await entered;
 store.setUsagePersistenceError('foreground:'+id,true);release();await until(()=>tracker.liveStates.size===0);assert.equal(store.usagePersistenceError,true,'older success must not clear a newer failure');
 ledger.writeRecord=writeRecord;tracker.ingestLive(scope,id,liveRaw(id,['old','new']));await until(()=>tracker.liveStates.size===0);assert.equal(store.usagePersistenceError,false);
});

test('recovery completes during ongoing live polling and preserves observation order',async t=>{
 const {root,ledger}=await fixture(t),file=join(root,'active-recovery.sqlite');job(file,[row('background')]);
 let releaseDisk,diskStarted;const diskGate=new Promise(resolve=>{releaseDisk=resolve;}),diskEntered=new Promise(resolve=>{diskStarted=resolve;});const run=ledger.runDiskJob.bind(ledger);
 ledger.runDiskJob=async(input,options)=>{if(input.action==='merge'&&input.jobDb===file){diskStarted();await diskGate;}return run(input,options);};
 let releaseRead,readStarted,reads=0;const readGate=new Promise(resolve=>{releaseRead=resolve;}),readEntered=new Promise(resolve=>{readStarted=resolve;});
 const store=new MetricsStore({reader:{},trajectory:async()=>{reads++;readStarted();await readGate;return liveRaw(other,['one','two']);}},{transcripts:null});store.identity=scope;
 const tracker=new DesktopUsage(store,ledger,{liveMaxRows:1,livePollMs:10,liveRetryMs:20});t.after(()=>{tracker.dispose();store.dispose();});const background=ledger.ingestDisk(scope,id,file);await diskEntered;
 tracker.ingestLive(scope,other,liveRaw(other,['one']));await until(()=>tracker.liveStates.get(scope+':'+other)?.batch);tracker.ingestLive(scope,other,liveRaw(other,['two']));assert.equal(store.usagePersistenceError,true);
 tracker.liveMaxRows=8;releaseDisk();await background;await readEntered;
 const latest=liveRaw(other,['two']);Object.assign(latest.trajectory.generatorMetadata[0].chatModel.usage,{outputTokens:200,responseOutputTokens:200});
 for(let i=0;i<20;i++)tracker.ingestLive(scope,other,latest);releaseRead();await until(()=>tracker.liveStates.size===0);assert.equal(reads,1);assert.equal(store.usagePersistenceError,false);
 const value=await summary(ledger);assert.equal(value.requests,3);assert.equal(value.totalTokens,1900);
});

test('live recovery sends reader budget failures to the single-session background collector',async t=>{
 const {root,ledger}=await fixture(t),block=join(root,'budget-block.sqlite'),complete=join(root,'budget-complete.sqlite');job(block,[row('background')]);const raw=liveRaw(other,['one','two']);job(complete,usageRecords(raw,other));
 let release,started;const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;});const run=ledger.runDiskJob.bind(ledger);
 ledger.runDiskJob=async(input,options)=>{if(input.action==='merge'&&input.jobDb===block){started();await gate;}return run(input,options);};
 let reads=0,requests=0,status=null;const store=new MetricsStore({reader:{},trajectory:async()=>{reads++;throw budgetError('projected-json',9,8);}},{history:{save:async()=>({savedAt:'2026-10-30T01:00:00Z'})},transcripts:null});store.identity=scope;
 const tracker=new DesktopUsage(store,ledger,{liveMaxRows:1,livePollMs:10,liveRetryMs:20,liveBackgroundPollMs:10});t.after(()=>{tracker.dispose();store.dispose();});store.onBackgroundResult=(...args)=>tracker.ingestDisk(...args);store.sessions.set(other,{data:null});
 store.background={state:()=>status,request:(account,conversation,endpoint,{isCurrent})=>{requests++;status={state:'processing'};setTimeout(async()=>{await store.acceptBackground(scope,other,{metrics:trajectoryMetrics(raw),delegatedIds:[]},{database:complete,revision:'fixture',isCurrent});status=null;},5);return true;},dispose(){}};
 const background=ledger.ingestDisk(scope,id,block);await entered;tracker.ingestLive(scope,other,liveRaw(other,['one']));await until(()=>tracker.liveStates.get(scope+':'+other)?.batch);tracker.ingestLive(scope,other,liveRaw(other,['two']));release();await background;
 await until(()=>tracker.liveStates.size===0);assert.equal(reads,1);assert.equal(requests,1);assert.equal(store.usagePersistenceError,false);const value=await summary(ledger);assert.equal(value.requests,3);
});

test('field-limited recovery remains visible without repeated reads',async t=>{
 const {root,ledger}=await fixture(t),block=join(root,'field-block.sqlite');job(block,[row('background')]);
 let release,started,reads=0;const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;});const run=ledger.runDiskJob.bind(ledger);
 ledger.runDiskJob=async(input,options)=>{if(input.action==='merge'&&input.jobDb===block){started();await gate;}return run(input,options);};
 const store=new MetricsStore({reader:{},trajectory:async()=>{reads++;throw budgetError('field',9,8);}},{transcripts:null});store.identity=scope;const tracker=new DesktopUsage(store,ledger,{liveMaxRows:1,livePollMs:10,liveRetryMs:20});t.after(()=>{tracker.dispose();store.dispose();});
 const background=ledger.ingestDisk(scope,id,block);await entered;tracker.ingestLive(scope,other,liveRaw(other,['one']));await until(()=>tracker.liveStates.get(scope+':'+other)?.batch);tracker.ingestLive(scope,other,liveRaw(other,['two']));release();await background;
 await until(()=>tracker.liveStates.get(scope+':'+other)?.halted);await wait(100);assert.equal(reads,1);assert.equal(store.usagePersistenceError,true);
});

test('same-account reconnect during asynchronous ownership check drops late source data',async t=>{
 const {ledger}=await fixture(t),client={reader:{},trajectory:async()=>liveRaw(id,['old'])},store=new MetricsStore(client,{history:{load:async()=>null,save:async()=>null},transcripts:null});store.identity=scope;
 const tracker=new DesktopUsage(store,ledger,{livePollMs:10});t.after(()=>{tracker.dispose();store.dispose();});let release,started;
 const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;});
 store.onTrajectory=async(account,conversation,raw,options)=>{started();await gate;return tracker.ingestLive(account,conversation,raw,options);};
 const pending=store.session(id,true);await entered;store.epoch++;store.sessions.clear();release();await assert.rejects(pending);await wait(30);
 assert.equal(store.identity,scope);assert.equal(tracker.liveStates.size,0);assert.equal((await ledger.summary(scope)).totalTokens,0);
});

test('guard group capacity is bounded and excess observations use visible targeted recovery',async t=>{
 const {root,ledger}=await fixture(t),file=join(root,'group-cap.sqlite');job(file,[row('background')]);
 let release,started;const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;});const run=ledger.runDiskJob.bind(ledger);
 ledger.runDiskJob=async(input,options)=>{if(input.action==='merge'&&input.jobDb===file){started();await gate;}return run(input,options);};
 let reads=0;const store=new MetricsStore({reader:{},trajectory:async()=>{reads++;return liveRaw(other,['first','second']);}},{transcripts:null});store.identity=scope;
 const tracker=new DesktopUsage(store,ledger,{liveMaxGroups:1,livePollMs:10,liveRetryMs:20});t.after(()=>{tracker.dispose();store.dispose();});const background=ledger.ingestDisk(scope,id,file);await entered;
 tracker.ingestLive(scope,other,liveRaw(other,['first']),{isCurrent:()=>true,guardKey:{}});tracker.ingestLive(scope,other,liveRaw(other,['second']),{isCurrent:()=>true,guardKey:{}});
 assert.equal(tracker.liveGroups,1);assert.equal(store.usagePersistenceError,true);release();await background;await until(()=>tracker.liveStates.size===0);assert.equal(reads,1);assert.equal(store.usagePersistenceError,false);
 const value=await summary(ledger);assert.equal(value.requests,3);assert.equal(value.totalTokens,1800);
});

test('full recovery queue releases stale source guards and retains active sources',async t=>{
 const {root,ledger}=await fixture(t),file=join(root,'prune-recoveries.sqlite');job(file,[row('background')]);
 let release,started;const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;});const run=ledger.runDiskJob.bind(ledger);
 ledger.runDiskJob=async(input,options)=>{if(input.action==='merge'&&input.jobDb===file){started();await gate;}return run(input,options);};
 const third='33333333-3333-3333-3333-333333333333',fourth='44444444-4444-4444-4444-444444444444';
 const store=new MetricsStore({reader:{},trajectory:async conversation=>liveRaw(conversation,['recovered-'+conversation])},{transcripts:null});store.identity=scope;
 const tracker=new DesktopUsage(store,ledger,{liveMaxConversations:1,liveMaxRecoveries:1,livePollMs:10,liveRecoveryPollMs:10});t.after(()=>{tracker.dispose();store.dispose();});
 const background=ledger.ingestDisk(scope,id,file);await entered;tracker.ingestLive(scope,other,liveRaw(other,['active']));
 let a=true,b=true;const sourceA={},sourceB={},key=scope+':'+third;
 tracker.ingestLive(scope,third,liveRaw(third,['a']),{isCurrent:()=>a,guardKey:sourceA});tracker.ingestLive(scope,third,liveRaw(third,['b']),{isCurrent:()=>b,guardKey:sourceB});
 assert.equal(tracker.liveRecoveries.get(key).guards.size,2);a=false;
 await until(()=>tracker.liveRecoveries.get(key)?.guards.size===1);assert.equal(tracker.liveRecoveries.get(key).guards.has(sourceB),true,'active source remains queued');
 b=false;tracker.ingestLive(scope,fourth,liveRaw(fourth,['next']));assert.equal(tracker.liveRecoveries.has(key),false,'enqueue prunes empty IDs');assert.equal(tracker.liveRecoveries.has(scope+':'+fourth),true);assert.equal(tracker.liveUnknownOverflow,false);
 release();await background;await until(()=>tracker.liveStates.size===0&&tracker.liveRecoveries.size===0);assert.equal(store.usagePersistenceError,false);
 const value=await summary(ledger);assert.equal(value.requests,3);assert.equal(value.totalTokens,1800);
});
