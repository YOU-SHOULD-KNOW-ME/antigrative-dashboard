// Real collector, scheduler, worker, history and SQLite usage ingestion.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as sleep,setImmediate as yieldLoop} from 'node:timers/promises';
import {AntigravityClient} from '../client.mjs';
import {MetricsStore} from '../store.mjs';
import {SessionHistory} from '../history.mjs';
import {DesktopUsage,UsageLedger} from '../usage.mjs';
const big='11111111-1111-1111-1111-111111111111',small='22222222-2222-2222-2222-222222222222';
const generator=(id,i)=>({stepIndices:[i],chatModel:{modelDisplayName:'Fixture',streamingDuration:'2s',usage:{responseId:id+'-'+i,apiProvider:'API_PROVIDER_GOOGLE_GEMINI',inputTokens:100,cacheReadTokens:300,outputTokens:100,responseOutputTokens:100},chatStartMetadata:{createdAt:'2026-10-30T00:00:00Z',contextWindowMetadata:{estimatedTokensUsed:500,maxContextTokens:1000}}}});
async function until(check,timeout=45000){const start=Date.now();while(!await check()){if(Date.now()-start>timeout)throw Error('End-to-end background deadline');await sleep(30);}}
test('oversized conversation automatically completes without manual refresh while quota and normal conversation work',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'ag-background-e2e-'));const count=18000;let quotaCalls=0,bigReads=0,smallReads=0,closed=false;
 const server=createServer(async(req,res)=>{try{let input='';for await(const chunk of req)input+=chunk;const body=JSON.parse(input||'{}'),method=req.url.split('/').at(-1);res.setHeader('Content-Type','application/json');
  if(method==='GetUserStatus'){res.end(JSON.stringify({userStatus:{email:'fixture@example.test'}}));return;}
  if(method==='RetrieveUserQuotaSummary'){quotaCalls++;res.end(JSON.stringify({groups:[{displayName:'Gemini',buckets:[{bucketId:'gemini-5h',remainingFraction:.7}]}]}));return;}
  if(method==='GetAllCascadeTrajectories'){res.end(JSON.stringify({trajectorySummaries:Object.fromEntries([[big,count],[small,1]].map(([id,n])=>[id,{stepCount:n,lastModifiedTime:'2026-10-30T00:00:00Z',status:'IDLE'}]))}));return;}
  if(method==='GetCascadeTrajectoryGeneratorMetadata'){res.end(JSON.stringify({generatorMetadata:body.generatorMetadataOffset?[]:Array.from({length:body.cascadeId===big?2:1},(_,i)=>generator(body.cascadeId,i))}));return;}
  assert.equal(method,'GetCascadeTrajectorySteps');const n=body.cascadeId===big?count:1;if(n===count)bigReads++;else smallReads++;
  res.write('{"steps":[');for(let i=body.stepOffset;i<n;i++){if(res.destroyed||closed)return;const item={type:n===count?'RUN_COMMAND_'+('x'.repeat(600)):'PLANNER_RESPONSE',metadata:{createdAt:'2026-10-30T00:00:00Z'}};if(!res.write((i>body.stepOffset?',':'')+JSON.stringify(item)))await new Promise(resolve=>{const done=()=>{res.off('drain',done);res.off('close',done);resolve();};res.once('drain',done);res.once('close',done);});if(i%128===0)await yieldLoop();}res.end(']}');
 }catch(error){if(!res.destroyed)res.destroy(error);}});server.listen(0,'127.0.0.1');await once(server,'listening');
 const endpoint={pid:1,port:server.address().port,csrf:'fixture'},client=new AntigravityClient();client.server=endpoint;client.discover=async()=>endpoint;
 const history=new SessionHistory(join(dir,'history-v1')),ledger=new UsageLedger(join(dir,'usage-v1'));
 const store=new MetricsStore(client,{history,transcripts:null}),usage=new DesktopUsage(store,ledger,{owns:()=>true});
 store.onTrajectory=(scope,id,raw,options)=>usage.ingestLive(scope,id,raw,options);store.onBackgroundResult=(scope,id,db,options)=>usage.ingestDisk(scope,id,db,options);
 t.after(async()=>{usage.dispose();store.dispose();closed=true;server.closeAllConnections();server.close();await until(()=>store.background.active===null);await ledger.queue.catch(()=>{});while(ledger.diskSummaryPending)await ledger.diskSummaryPending;await rm(dir,{recursive:true,force:true});});
 const first=await store.snapshot({conversationId:big});assert.equal(first.collection.state,'processing');assert.equal(first.speed,null);assert.equal(first.connection,'live');
 const normal=await store.snapshot({conversationId:small});assert.equal(normal.speed.tps,50);assert.equal(normal.speed.conversationId,small);assert.equal(smallReads,1);
 let result,loops=0;await until(async()=>{loops++;result=await store.snapshot({conversationId:big});await store.refreshQuota(true);return result.collection===null&&result.speed?.steps===count;});
 assert.ok(loops>1);assert.ok(quotaCalls>2);assert.equal(result.speed.tps,50);assert.equal(result.speed.cache.hitRate,.75);assert.equal(result.speed.context.usedFraction,.5);assert.equal(result.speed.requests,2);
 const saved=await history.load(store.identity,big);assert.equal(saved.metrics.tps,50);assert.equal(saved.metrics.requests,2);
 await until(()=>store.background.active===null);assert.deepEqual(await readdir(join(dir,'collection-jobs')),[]);
 const files=await readdir(join(dir,'usage-v1',store.identity));assert.ok(files.some(f=>f.endsWith('.sqlite')),'Background rows are committed to disk ledger before scratch cleanup');
 let summary;await until(async()=>{summary=await ledger.summary(store.identity);return summary?.requests===3;});assert.equal(summary.totalTokens,1500);assert.equal(summary.unreadableFiles,0);
 const reads=bigReads;await store.snapshot({conversationId:big,force:true});assert.equal(bigReads,reads,'Stable completed revision does not re-read oversized trajectory');
 t.diagnostic(JSON.stringify({steps:count,normalConversationReads:smallReads,quotaCalls,foregroundPolls:loops,oversizedReads:bigReads,usageRequests:summary.requests,totalTokens:summary.totalTokens}));
});
