import test from 'node:test';
import assert from 'node:assert/strict';
import {budgetError,collectionFailure} from '../collection-state.mjs';
import {TrajectoryJson} from '../trajectory-json.mjs';
import {TrajectoryReader} from '../trajectory-reader.mjs';
import {MetricsStore} from '../store.mjs';
const id='11111111-1111-1111-1111-111111111111';
function fixture(){
 const state={now:Date.now(),steps:[{type:'X'.repeat(200)}],reads:0,modified:'a',endpoint:{pid:1,port:2,csrf:'fake'},fail:null};
 const client={now:()=>state.now,discover:async()=>state.endpoint,call:async(method,body)=>{
  if(method==='GetAllCascadeTrajectories')return {trajectorySummaries:{[id]:{stepCount:state.steps.length,lastModifiedTime:state.modified,status:'RUNNING'}}};
  state.reads++;if(state.fail)throw state.fail;
  return method==='GetCascadeTrajectorySteps'?{steps:state.steps.slice(body.stepOffset)}:{generatorMetadata:[]};
 }};const reader=new TrajectoryReader(client,{budgetBytes:100});return {state,reader};
}
test('real parser carries safe retained-field and scalar-character limits, never raw text',()=>{
 const parser=new TrajectoryJson({maxRetainedBytes:100});
 assert.throws(()=>parser.write(JSON.stringify({steps:[{type:'PRIVATE'}]})),error=>{const value=collectionFailure(error);assert.equal(value.kind,'retained-fields');assert.equal(value.limitBytes,100);assert.ok(value.observedBytes>100);assert.equal(value.complete,false);assert.ok(!JSON.stringify(value).includes('PRIVATE'));return true;});
 const scalar=new TrajectoryJson();assert.throws(()=>scalar.write(JSON.stringify({steps:[{type:'X'.repeat(17000)}]})),error=>{const value=collectionFailure(error);assert.equal(value.kind,'field');assert.equal(value.unit,'characters');assert.equal(value.limit,16384);assert.equal(value.limitBytes,undefined);return true;});
 assert.equal(collectionFailure(new Error('会话统计数据超过采集上限')),null,'No string matching');
});
test('cold over-budget reads are throttled, unchanged retries back off, changed histories recover',async()=>{
 const {state,reader}=fixture();
 await assert.rejects(reader.read(id),e=>collectionFailure(e)?.kind==='projected-json');assert.equal(state.reads,1);assert.equal(reader.entries.size,0);
 for(let i=0;i<9;i++){state.now+=1000;state.modified='change-'+i;await assert.rejects(reader.read(id,{force:true}));}
 assert.equal(state.reads,1,'Manual clicks cannot bypass 10s cooldown');
 state.now+=1000;await assert.rejects(reader.read(id,{force:true}));assert.equal(state.reads,2);
 state.now+=20000;await assert.rejects(reader.read(id));assert.equal(state.reads,2);
 state.now+=10000;state.steps=[{type:'X'}];state.modified='compacted';const result=await reader.read(id);assert.equal(result.numTotalSteps,1);assert.equal(reader.failures.size,0);
});
test('unchanged failure backs off to five minutes and failure metadata is bounded/reset',async()=>{
 const {state,reader}=fixture();
 for(let i=0;i<7;i++){await assert.rejects(reader.read(id));const failure=reader.failures.get(id);assert.equal(failure.retryAt-failure.at,Math.min(300000,30000*2**Math.min(i,4)));state.now=failure.retryAt;}
 for(let i=0;i<260;i++)await assert.rejects(reader.read('synthetic-'+i,{summary:{stepCount:1,lastModifiedTime:'a'}}));
 assert.ok(reader.failures.size<=256);reader.reset();assert.equal(reader.failures.size,0);
});
test('failed refresh preserves last complete cache and stale scopes cannot publish failure state',async()=>{
 const {state,reader}=fixture();state.steps=[{type:'X'}];const original=await reader.read(id);
 state.steps=[{type:'X'.repeat(200)}];state.modified='b';state.now+=30000;
 await assert.rejects(reader.read(id,{force:true}));assert.equal(reader.entries.get(id).data,original);
 reader.reset();let owned=true;state.fail=budgetError('retained-fields',200,100);
 const originalCall=reader.client.call;reader.client.call=async(...args)=>{if(args[0]==='GetCascadeTrajectorySteps'){owned=false;throw state.fail;}return originalCall(...args);};
 await assert.rejects(reader.read(id,{isCurrent:()=>owned}));assert.equal(reader.failures.size,0);
});
test('store exposes limits with saved metrics, fresh limits without data, and clears state on recovery',async t=>{
 let fail=false,quotaReads=0;const saved=[];
 const raw={trajectory:{cascadeId:id,generatorMetadata:[{chatModel:{streamingDuration:'2s',usage:{inputTokens:100,responseOutputTokens:100,outputTokens:100},chatStartMetadata:{contextWindowMetadata:{estimatedTokensUsed:100,maxContextTokens:1000}}}}]}};
 const client={discover:async()=>({pid:1}),call:async method=>{if(method==='GetUserStatus')return {userStatus:{email:'test@example.test'}};quotaReads++;return {};},trajectory:async()=>{if(fail)throw budgetError('retained-fields',9000000,8388608);return raw;}};
 const store=new MetricsStore(client,{transcripts:null,history:{load:async()=>null,save:async(scope,id,metrics)=>{saved.push(metrics);return {savedAt:'2026-10-30T00:00:00Z'};}}});t.after(()=>store.dispose());
 const first=await store.snapshot({conversationId:id});assert.equal(first.collection,null);fail=true;
 const old=await store.snapshot({conversationId:id,force:true});assert.equal(old.speed.tps,first.speed.tps);assert.equal(old.collection.freshness,'saved');assert.equal(old.collection.kind,'retained-fields');assert.equal(saved.length,1);assert.ok(quotaReads>=2);
 store.sessions.clear();const missing=await store.snapshot({conversationId:id,force:true});assert.equal(missing.speed,null);assert.equal(missing.collection.freshness,'unavailable');assert.equal(missing.connection,'live');
 fail=false;const fresh=await store.snapshot({conversationId:id,force:true});assert.equal(fresh.collection,null);assert.ok(fresh.speed);
});

test('budget rejection during summary parsing also backs off and endpoint replacement clears failure state',async()=>{
 const {state,reader}=fixture();let summaries=0;
 reader.client.call=async()=>{summaries++;throw budgetError('retained-fields',200,100);};
 await assert.rejects(reader.read(id));assert.equal(summaries,1);
 state.now+=12000;await assert.rejects(reader.read(id));assert.equal(summaries,1);
 state.endpoint={...state.endpoint,pid:2};await assert.rejects(reader.read(id));assert.equal(summaries,2);
});

test('a previous budget failure cannot take an idle cache shortcut and hide a failed revision',async()=>{
 const {state,reader}=fixture();reader.idleRecheckMs=600000;
 state.steps=[{type:'X'}];const summary={stepCount:1,status:'DONE',lastModifiedTime:'stable'};
 await reader.read(id,{summary});state.steps=[{type:'X'.repeat(200)}];
 await assert.rejects(reader.read(id,{summary,force:true}));state.now+=30000;
 const before=state.reads;await assert.rejects(reader.read(id,{summary}));assert.ok(state.reads>before);
});
