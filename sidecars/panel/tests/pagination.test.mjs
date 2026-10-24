import test from 'node:test';
import assert from 'node:assert/strict';
import { AntigravityClient } from '../client.mjs';
const id='test-id',summary=(n,status='CASCADE_RUN_STATUS_IDLE',modified='v1')=>({stepCount:n,status,lastModifiedTime:modified});
function fixture(){
 let now=0;const client=new AntigravityClient({now:()=>now});
 const state={steps:[{type:'USER_INPUT',i:0},{type:'PLANNER_RESPONSE',i:1},{type:'USER_INPUT',i:2},{type:'PLANNER_RESPONSE',i:3}],generators:[{i:0,stepIndices:[1]},{i:1,stepIndices:[3]}],summary:summary(4),calls:[],endpoint:{pid:42,port:1234,csrf:'fixture'}};
 client.discover=async()=>state.endpoint;
 client.call=async(method,body={})=>{
  state.calls.push([method,body]);
  if(method==='GetAllCascadeTrajectories')return {trajectorySummaries:{[id]:state.summary}};
  if(method==='GetCascadeTrajectorySteps'){assert.equal(body.trajectoryVerbosity,3);return {steps:state.steps.slice(body.stepOffset,body.stepOffset+1)};}
  assert.equal(method,'GetCascadeTrajectoryGeneratorMetadata','Never request a whole trajectory');
  assert.equal(body.includeMessages,false);assert.equal(Object.hasOwn(body,'trajectoryVerbosity'),false);
  return {generatorMetadata:state.generators.slice(body.generatorMetadataOffset,body.generatorMetadataOffset+1)};
 };
 return {client,state,tick:()=>now+=2000};
}
test('cold acquisition uses summary/step/metadata RPCs and the empty terminal metadata page',async()=>{
 const {client,state}=fixture();const r=await client.trajectory(id);
 assert.deepEqual(r.trajectory.steps.map(s=>s.i),[0,1,2,3]);assert.deepEqual(r.trajectory.generatorMetadata.map(g=>g.i),[0,1]);assert.equal(r.numTotalGeneratorMetadata,2);
 assert.deepEqual(state.calls.filter(([m])=>m==='GetCascadeTrajectoryGeneratorMetadata').map(([,b])=>b.generatorMetadataOffset),[0,1,2]);
});
test('unchanged settled conversations skip downloads; new turns revalidate the preceding mutable tail',async()=>{
 const {client,state,tick}=fixture();await client.trajectory(id);state.calls=[];await client.trajectory(id);assert.equal(state.calls.length,0);
 tick();await client.trajectory(id);assert.deepEqual(state.calls.map(([m])=>m),['GetAllCascadeTrajectories']);
 state.steps.push({type:'USER_INPUT',i:4},{type:'PLANNER_RESPONSE',i:5});state.generators.push({i:2,stepIndices:[5]});state.summary=summary(6,'CASCADE_RUN_STATUS_IDLE','v2');tick();state.calls=[];
 const r=await client.trajectory(id);assert.deepEqual(r.trajectory.generatorMetadata.map(g=>g.i),[0,1,2]);
 assert.equal(state.calls.find(([m])=>m==='GetCascadeTrajectorySteps')[1].stepOffset,3);
 assert.equal(state.calls.find(([m])=>m==='GetCascadeTrajectoryGeneratorMetadata')[1].generatorMetadataOffset,1);
});
test('busy same-length updates replace mutable metadata without duplicating requests',async()=>{
 const {client,state}=fixture();state.summary=summary(4,'CASCADE_RUN_STATUS_RUNNING');await client.trajectory(id);
 state.generators[1]={i:1,stepIndices:[3],chatModel:{usage:{outputTokens:200},chatStartMetadata:{contextWindowMetadata:{estimatedTokensUsed:500}}}};state.calls=[];
 const r=await client.trajectory(id);assert.equal(r.trajectory.generatorMetadata.length,2);assert.equal(r.trajectory.generatorMetadata[1].chatModel.usage.outputTokens,200);
 assert.equal(state.calls.find(([m])=>m==='GetCascadeTrajectoryGeneratorMetadata')[1].generatorMetadataOffset,1);
});
test('rewinds and settled edits invalidate prefixes; explicit refresh reloads metadata',async()=>{
 const {client,state,tick}=fixture();await client.trajectory(id);state.steps=state.steps.slice(0,2);state.generators=state.generators.slice(0,1);state.summary=summary(2,'CASCADE_RUN_STATUS_IDLE','v2');tick();state.calls=[];
 let r=await client.trajectory(id);assert.equal(r.trajectory.steps.length,2);assert.equal(state.calls.find(([m])=>m==='GetCascadeTrajectorySteps')[1].stepOffset,0);
 state.summary=summary(2,'CASCADE_RUN_STATUS_IDLE','v3');tick();state.calls=[];r=await client.trajectory(id);assert.equal(state.calls.find(([m])=>m==='GetCascadeTrajectoryGeneratorMetadata')[1].generatorMetadataOffset,0);
 state.calls=[];await client.trajectory(id,{force:true});assert.ok(state.calls.some(([m])=>m==='GetCascadeTrajectorySteps'));
});
test('incomplete pages never replace the last complete cached revision',async()=>{
 const {client,state,tick}=fixture();const saved=await client.trajectory(id);state.summary=summary(10,'CASCADE_RUN_STATUS_IDLE','v2');tick();
 await assert.rejects(client.trajectory(id),/分页/);assert.equal(client.reader.entries.get(id).data,saved);
});
test('provided historical summaries skip enumeration; missing counts use an empty terminal step page',async()=>{
 const {client,state}=fixture();delete state.summary.stepCount;const r=await client.trajectory(id,{summary:state.summary});
 assert.equal(r.trajectory.steps.length,4);assert.ok(!state.calls.some(([m])=>m==='GetAllCascadeTrajectories'));
 assert.equal(state.calls.filter(([m])=>m==='GetCascadeTrajectorySteps').at(-1)[1].stepOffset,4);
});
test('concurrent reads coalesce; account reset and endpoint replacement invalidate prefixes',async()=>{
 const {client,state}=fixture();const [a,b]=await Promise.all([client.trajectory(id),client.trajectory(id)]);assert.equal(a,b);
 assert.equal(state.calls.filter(([m])=>m==='GetAllCascadeTrajectories').length,1);
 state.calls=[];client.resetTrajectories();await client.trajectory(id);assert.ok(state.calls.some(([m])=>m==='GetCascadeTrajectorySteps'));
 state.calls=[];state.endpoint={...state.endpoint,pid:43};await client.trajectory(id);assert.ok(state.calls.some(([m])=>m==='GetCascadeTrajectorySteps'));
});
test('unknown metadata associations are re-read rather than skipping unseen records',async()=>{
 const {client,state}=fixture();state.summary=summary(4,'CASCADE_RUN_STATUS_RUNNING');state.generators[0]={i:0};await client.trajectory(id);state.calls=[];
 await client.trajectory(id);assert.equal(state.calls.find(([m])=>m==='GetCascadeTrajectoryGeneratorMetadata')[1].generatorMetadataOffset,0);
});
test('long running turns re-read only the latest model and any earlier unfinished tools',async()=>{
 const {client,state}=fixture();state.steps=[{type:'USER_INPUT'},{type:'PLANNER_RESPONSE'},{type:'RUN_COMMAND',metadata:{startedAt:'2026-10-13T01:00:00Z'}},{type:'PLANNER_RESPONSE'},{type:'PLANNER_RESPONSE'}];
 state.generators=[{stepIndices:[1]},{stepIndices:[3]},{stepIndices:[4]}];state.summary=summary(5,'CASCADE_RUN_STATUS_RUNNING');await client.trajectory(id);state.calls=[];
 await client.trajectory(id);assert.equal(state.calls.find(([m])=>m==='GetCascadeTrajectorySteps')[1].stepOffset,2);assert.equal(state.calls.find(([m])=>m==='GetCascadeTrajectoryGeneratorMetadata')[1].generatorMetadataOffset,2);
 state.steps[2].metadata.completedAt='2026-10-13T01:00:05Z';await client.trajectory(id);state.calls=[];await client.trajectory(id);
 assert.equal(state.calls.find(([m])=>m==='GetCascadeTrajectorySteps')[1].stepOffset,4);
});
test('host growth during acquisition fails instead of caching mismatched steps',async()=>{
 const {client,state}=fixture();state.generators.push({stepIndices:[5]});await assert.rejects(client.trajectory(id),/仍在更新/);assert.equal(client.reader.entries.size,0);
});
test('idle caches periodically revalidate the tail even if summary timestamps did not change',async()=>{
 const {client,state,tick}=fixture();await client.trajectory(id);for(let i=0;i<5;i++)tick();state.generators[1]={i:1,stepIndices:[3],chatModel:{usage:{outputTokens:345}}};state.calls=[];
 const r=await client.trajectory(id);assert.equal(r.trajectory.generatorMetadata[1].chatModel.usage.outputTokens,345);assert.equal(state.calls.find(([m])=>m==='GetCascadeTrajectorySteps')[1].stepOffset,3);
});

test('subagent result IDs arriving behind newer requests are not frozen in the immutable prefix',async()=>{
 const {client,state}=fixture();
 state.steps=[{type:'USER_INPUT'},{type:'CORTEX_STEP_TYPE_INVOKE_SUBAGENT',metadata:{startedAt:'2026-10-24T01:00:00Z'},invokeSubagent:{}},{type:'PLANNER_RESPONSE'},{type:'PLANNER_RESPONSE'}];
 state.generators=[{stepIndices:[2]},{stepIndices:[3]}];state.summary=summary(4,'CASCADE_RUN_STATUS_RUNNING');
 await client.trajectory(id);state.calls=[];
 const child='22222222-2222-2222-2222-222222222222';state.steps[1]={...state.steps[1],invokeSubagent:{results:[{conversationId:child}]}};
 const next=await client.trajectory(id);
 assert.equal(state.calls.find(([name])=>name==='GetCascadeTrajectorySteps')[1].stepOffset,1);
 assert.equal(next.trajectory.steps[1].invokeSubagent.results[0].conversationId,child);
});
test('a planner created before its first metadata entry is revalidated when the request finishes',async()=>{
 const {client,state}=fixture();state.steps=[{type:'USER_INPUT'},{type:'PLANNER_RESPONSE'}];state.generators=[];state.summary=summary(2,'CASCADE_RUN_STATUS_RUNNING');await client.trajectory(id);
 state.steps[1]={type:'PLANNER_RESPONSE',plannerResponse:{toolCalls:[{}]}};state.generators=[{stepIndices:[1]}];state.calls=[];
 const r=await client.trajectory(id);assert.equal(r.trajectory.steps[1].plannerResponse.toolCalls.length,1);assert.equal(state.calls.find(([m])=>m==='GetCascadeTrajectorySteps')[1].stepOffset,1);
});
test('retained-statistics budget fails closed independently of discarded corpus size',async()=>{
 const {client}=fixture();client.reader.budgetBytes=20;await assert.rejects(client.trajectory(id),/内存预算/);assert.equal(client.reader.entries.size,0);assert.equal(client.reader.cachedBytes,0);
});
test('the shared LRU statistics budget evicts inactive prefixes without leaking old scope',async()=>{
 const {client,state}=fixture();await client.trajectory(id);const bytes=client.reader.cachedBytes;client.reader.budgetBytes=bytes+1;
 await client.trajectory('other-id',{summary:state.summary});assert.equal(client.reader.entries.size,1);assert.ok(client.reader.entries.has('other-id'));assert.ok(client.reader.cachedBytes<=client.reader.budgetBytes);
});
test('reset during an in-flight read rejects late old records and permits a fresh scope',async()=>{
 const {client,state}=fixture();const original=client.call.bind(client);let release,entered;
 const begun=new Promise(r=>entered=r),gate=new Promise(r=>release=r);let first=true;
 client.call=async(m,b)=>{if(m==='GetCascadeTrajectorySteps'&&first){first=false;entered();await gate;}return original(m,b);};
 const pending=client.trajectory(id);await begun;client.resetTrajectories();release();await assert.rejects(pending,/重新连接/);assert.equal(client.reader.entries.size,0);
 assert.equal((await client.trajectory(id)).trajectory.steps.length,state.steps.length);
});
