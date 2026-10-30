import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtemp,readdir,rm,readFile,writeFile} from 'node:fs/promises';
import {EventEmitter} from 'node:events';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {BackgroundStatistics} from '../background-statistics.mjs';
import {AntigravityClient} from '../client.mjs';
const id='11111111-1111-1111-1111-111111111111',scope='a'.repeat(64);
const generator={stepIndices:[0],chatModel:{modelDisplayName:'Fixture',usage:{messageId:'one',apiProvider:'API_PROVIDER_GOOGLE_GEMINI',inputTokens:100,cacheReadTokens:300,outputTokens:100,responseOutputTokens:100},streamingDuration:'2s',chatStartMetadata:{contextWindowMetadata:{estimatedTokensUsed:500,maxContextTokens:1000}}}};
async function waitFor(fn,timeout=30000){const started=Date.now();while(!fn()){if(Date.now()-started>timeout)throw Error('Background fixture timed out');await sleep(20);}}
async function fixture(t,{count=2,bad=false,duplicate=false,summaryExtra=()=>({}),stepDelegates=[],generatorPages=null}={}){
 const dir=await mkdtemp(join(tmpdir(),'ag-background-test-'));let completed=null,owned=true,stepCalls=0,quotaCalls=0,summaryCalls=0;
 const type='RUN_COMMAND_'+'x'.repeat(600);
 const server=createServer(async(req,res)=>{let text='';for await(const c of req)text+=c;const body=JSON.parse(text);const method=req.url.split('/').at(-1);res.setHeader('Content-Type','application/json');
 if(method==='GetAllCascadeTrajectories'){summaryCalls++;res.end(JSON.stringify({trajectorySummaries:{[id]:{stepCount:count,lastModifiedTime:'2026-10-30T00:00:00Z',status:'IDLE'},...summaryExtra(summaryCalls)}}));return;}
 if(method==='RetrieveUserQuotaSummary'){quotaCalls++;res.end('{"groups":[]}');return;}
 if(method==='GetCascadeTrajectoryGeneratorMetadata'){res.end(JSON.stringify({generatorMetadata:generatorPages?generatorPages(body.generatorMetadataOffset):duplicate?[generator]:body.generatorMetadataOffset?[]:[generator]}));return;}
 stepCalls++;
 if(bad){res.end('{"steps":[{"type":"RUN_COMMAND"}],"ignored":[1,]}');return;}
 res.write('{"steps":[');for(let i=body.stepOffset;i<count;i++){const record=JSON.stringify({type,metadata:{createdAt:new Date(1700000000000+i).toISOString()},...(i===0&&stepDelegates.length?{invokeSubagent:{conversationId:stepDelegates[0],results:stepDelegates.slice(1).map(conversationId=>({conversationId}))}}:{})});if(!res.write((i>body.stepOffset?',':'')+record))await once(res,'drain');}res.end(']}');
 });server.listen(0,'127.0.0.1');await once(server,'listening');
 const endpoint={pid:1,port:server.address().port,csrf:'fixture'};
 const manager=new BackgroundStatistics({directory:dir,owns:()=>owned,onComplete:async(s,c,result,options)=>{assert.equal(s,scope);assert.equal(c,id);assert.equal(options.isCurrent(),true);completed=result;}});
 t.after(async()=>{manager.dispose();server.closeAllConnections();server.close();await waitFor(()=>manager.active===null);await rm(dir,{recursive:true,force:true});});
 return {dir,manager,endpoint,get completed(){return completed;},get stepCalls(){return stepCalls;},get quotaCalls(){return quotaCalls;},cancel(){owned=false;manager.reset();}};
}
test('real worker finishes a projected page above 8 MiB while foreground quota requests remain usable',async t=>{
 const f=await fixture(t,{count:18000});assert.ok(18000*600>8*1024*1024);
 assert.equal(f.manager.request(scope,id,f.endpoint),true);assert.equal(f.manager.state(id).state,'processing');
 const client=new AntigravityClient();client.discover=async()=>f.endpoint;
 await waitFor(()=>f.stepCalls>0);
 for(let i=0;i<4;i++)assert.deepEqual(await client.call('RetrieveUserQuotaSummary',{},false),{groups:[]});
 assert.equal(f.quotaCalls,4);
 await waitFor(()=>f.completed!==null,60000);assert.equal(f.completed.metrics.steps,18000);assert.equal(f.completed.metrics.tps,50);assert.equal(f.completed.metrics.cache.hitRate,.75);assert.equal(f.completed.metrics.context.usedFraction,.5);
 await waitFor(()=>f.manager.active===null);assert.deepEqual(await readdir(f.dir),[],'Temporary statistics and credentials must not remain');assert.equal(f.manager.state(id),null);
});
test('scope cancellation prevents publication and removes scratch files',async t=>{
 const f=await fixture(t,{count:18000});f.manager.request(scope,id,f.endpoint);await waitFor(()=>f.stepCalls>0);f.cancel();await waitFor(()=>f.manager.active===null);assert.equal(f.completed,null);assert.deepEqual(await readdir(f.dir),[]);
});
test('malformed page tails never publish consumed prefixes',async t=>{
 const f=await fixture(t,{bad:true});f.manager.request(scope,id,f.endpoint);await waitFor(()=>f.manager.state(id)?.state==='limited',30000);assert.equal(f.completed,null);await waitFor(()=>f.manager.active===null);assert.deepEqual(await readdir(f.dir),[]);
});
test('repeated pages do not publish fabricated full results',async t=>{
 const f=await fixture(t,{count:5,duplicate:true});f.manager.request(scope,id,f.endpoint);await waitFor(()=>f.manager.state(id)?.state==='limited',30000);assert.equal(f.completed,null);assert.ok(f.stepCalls<=5);await waitFor(()=>f.manager.active===null);assert.deepEqual(await readdir(f.dir),[]);
});

const childA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',childB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',childC='cccccccc-cccc-4ccc-8ccc-cccccccccccc',unrelated='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
test('summary-only child and root relationships merge with step links without duplicates',async t=>{
 const f=await fixture(t,{summaryExtra:()=>({[childA.toUpperCase()]:{trajectoryMetadata:{parentConversationId:id}},[childB]:{trajectoryMetadata:{rootConversationId:id}},[unrelated]:{trajectoryMetadata:{parentConversationId:childA}}}),stepDelegates:[childB,childC]});
 f.manager.request(scope,id,f.endpoint);await waitFor(()=>f.completed!==null);
 assert.deepEqual(new Set(f.completed.delegatedIds),new Set([childA,childB,childC]));assert.equal(f.completed.delegatedTruncated,false);
});
test('a changed summary-only relationship restarts acquisition rather than publishing a mixed revision',async t=>{
 const f=await fixture(t,{summaryExtra:n=>({[n===1?childA:childB]:{trajectoryMetadata:{parentConversationId:id}}})});
 f.manager.request(scope,id,f.endpoint);await waitFor(()=>f.completed!==null);
 assert.deepEqual(f.completed.delegatedIds,[childB]);assert.ok(f.stepCalls>=2,'Changed relationships require a fresh page pass');
});
test('a relationship change during reduction rejects the incomplete result',async t=>{
 const f=await fixture(t,{summaryExtra:n=>({[n<3?childA:childB]:{trajectoryMetadata:{parentConversationId:id}}})});
 f.manager.request(scope,id,f.endpoint);await waitFor(()=>f.manager.state(id)?.state==='limited');assert.equal(f.completed,null);
});
test('more than 128 summary descendants are explicitly marked partial',async t=>{
 const relationships=Object.fromEntries(Array.from({length:130},(_,i)=>[(i+1).toString(16).padStart(8,'0')+'-0000-4000-8000-000000000000',{trajectoryMetadata:{rootConversationId:id}}]));
 const f=await fixture(t,{summaryExtra:()=>relationships});f.manager.request(scope,id,f.endpoint);await waitFor(()=>f.completed!==null);
 assert.equal(f.completed.delegatedIds.length,128);assert.equal(f.completed.delegatedTruncated,true);
});

test('non-adjacent repeated metadata pages cannot publish incomplete statistics',async t=>{
 const record=messageId=>({...generator,chatModel:{...generator.chatModel,usage:{...generator.chatModel.usage,messageId}}});
 const f=await fixture(t,{generatorPages:offset=>offset===0?[record('a')]:offset===1?[record('b')]:offset===2?[record('a')]:[]});
 f.manager.request(scope,id,f.endpoint);await waitFor(()=>f.manager.state(id)?.state==='limited');assert.equal(f.completed,null);
});
test('distinct numeric identifier sequences are never mistaken for repeated pages',async t=>{
 const record=messageId=>({...generator,chatModel:{...generator.chatModel,usage:{...generator.chatModel.usage,messageId}}});
 const f=await fixture(t,{generatorPages:offset=>offset===0?[record(1),record(23)]:offset===2?[record(12),record(3)]:[]});
 f.manager.request(scope,id,f.endpoint);await waitFor(()=>f.completed!==null);assert.equal(f.completed.metrics.requests,4);
});

test('summary-only child after 4,096 unrelated conversations remains discoverable',async t=>{
 const otherSummaries=Object.fromEntries(Array.from({length:4100},(_,i)=>[(i+1).toString(16).padStart(8,'0')+'-1111-4111-8111-111111111111',{}]));
 const f=await fixture(t,{summaryExtra:()=>({...otherSummaries,[childA]:{trajectoryMetadata:{parentConversationId:id}}})});
 f.manager.request(scope,id,f.endpoint);await waitFor(()=>f.completed!==null,30000);
 assert.deepEqual(f.completed.delegatedIds,[childA]);assert.equal(f.completed.delegatedTruncated,false);
});

for(const failure of ['watchdog','worker-error'])test(`late publication is invalidated before cleanup on ${failure}`,async t=>{
 const dir=await mkdtemp(join(tmpdir(),'ag-background-late-')),file=join(dir,'saved.json');await writeFile(file,'original');
 let clock=1000,guard,release,prevented=false;
 const gate=new Promise(resolve=>{release=resolve;});
 class FakeWorker extends EventEmitter{
  constructor(){super();setImmediate(()=>{this.emit('message',{type:'complete',result:{metrics:{}},revision:'fixture'});if(failure==='worker-error')setImmediate(()=>this.emit('error',Error('synthetic worker failure')));});}
  terminate(){return Promise.resolve(1);}
 }
 const manager=new BackgroundStatistics({directory:join(dir,'scratch'),now:()=>clock,owns:()=>true,workerFactory:()=>new FakeWorker(),onComplete:async(scope,cid,result,{isCurrent})=>{
  guard=isCurrent;await gate;if(isCurrent())await writeFile(file,'incorrect late result');else prevented=true;
 }});
 t.after(async()=>{release?.();manager.dispose();await waitFor(()=>manager.active===null);await rm(dir,{recursive:true,force:true});});
 manager.request(scope,id,{pid:1,port:1234,csrf:'fixture'});await waitFor(()=>typeof guard==='function');
 if(failure==='watchdog'){assert.equal(guard(),true);clock+=60*60*1000+1;}
 await waitFor(()=>manager.state(id)?.state==='limited',4000);
 assert.equal(guard(),false,'Publishing guard must already be invalid before worker cleanup');
 release();await waitFor(()=>prevented);await waitFor(()=>manager.active===null);
 assert.equal(await readFile(file,'utf8'),'original');assert.deepEqual(await readdir(join(dir,'scratch')),[]);
});

test('a synchronously throwing completion callback becomes a recoverable failure',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'ag-background-sync-error-'));
 let callbackCount=0;
 class FakeWorker extends EventEmitter{
  constructor(){super();setImmediate(()=>this.emit('message',{type:'complete',result:{metrics:{}},revision:'fixture'}));}
  terminate(){return Promise.resolve(1);}
 }
 const manager=new BackgroundStatistics({directory:dir,owns:()=>true,workerFactory:()=>new FakeWorker(),onComplete:()=>{callbackCount++;throw Error('synthetic synchronous failure');}});
 t.after(async()=>{manager.dispose();await waitFor(()=>manager.active===null);await rm(dir,{recursive:true,force:true});});
 manager.request(scope,id,{pid:1,port:1234,csrf:'fixture'});
 await waitFor(()=>manager.state(id)?.state==='limited');await waitFor(()=>manager.active===null);
 assert.equal(callbackCount,1);assert.equal(manager.state(id).reason,'background-unavailable');assert.deepEqual(await readdir(dir),[]);
});

test('a worker failure before the completion microtask skips the completion callback',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'ag-background-error-before-complete-'));
 let callbackCount=0;
 class FakeWorker extends EventEmitter{
  constructor(){super();setImmediate(()=>{this.emit('message',{type:'complete',result:{metrics:{}},revision:'fixture'});this.emit('error',Error('synthetic immediate failure'));});}
  terminate(){return Promise.resolve(1);}
 }
 const manager=new BackgroundStatistics({directory:dir,owns:()=>true,workerFactory:()=>new FakeWorker(),onComplete:()=>{callbackCount++;}});
 t.after(async()=>{manager.dispose();await waitFor(()=>manager.active===null);await rm(dir,{recursive:true,force:true});});
 manager.request(scope,id,{pid:1,port:1234,csrf:'fixture'});
 await waitFor(()=>manager.state(id)?.state==='limited');await waitFor(()=>manager.active===null);
 assert.equal(callbackCount,0);assert.deepEqual(await readdir(dir),[]);
});
