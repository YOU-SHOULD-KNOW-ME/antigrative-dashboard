import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join,resolve,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {DelegatedUsage} from '../delegated-usage.mjs';
import {taskRecords} from '../task-usage.mjs';
import {MetricsStore} from '../store.mjs';
import {SessionHistory} from '../history.mjs';
import {UsageLedger} from '../usage.mjs';
import {trajectoryMetrics} from '../metrics.mjs';

const parent='11111111-1111-1111-1111-111111111111',child='22222222-2222-2222-2222-222222222222';
const sibling='33333333-3333-3333-3333-333333333333',nested='44444444-4444-4444-4444-444444444444';
const account=createHash('sha256').update('delegation-fixture@example.test').digest('hex');
const secondAccount=createHash('sha256').update('other-delegation-fixture@example.test').digest('hex');
const unitTokens=155;
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
async function bounded(promise,message='Fixture operation did not finish'){
 let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),2000);})]);}finally{clearTimeout(timer);}
}
function raw(id,{children=[],legacy=null,requests=1,responseIds=null,input=100,read=20,write=5,output=30,duration='2s',context=1000}={}){
 const steps=[{type:'USER_INPUT'}],generatorMetadata=[];
 for(let i=0;i<requests;i++){
  const stepIndices=[steps.length];
  steps.push({type:'PLANNER_RESPONSE',metadata:{createdAt:'2026-10-24T08:00:00Z'},plannerResponse:{response:'1',toolCalls:[]}});
  generatorMetadata.push({stepIndices,chatModel:{modelDisplayName:'Fixture model',streamingDuration:duration,timeToFirstToken:'1s',
   usage:{apiProvider:'API_PROVIDER_GOOGLE_GEMINI',responseId:responseIds?.[i]||`${id}:request:${i}`,inputTokens:input,cacheReadTokens:read,cacheWriteTokens:write,outputTokens:output,responseOutputTokens:output},
   chatStartMetadata:{createdAt:'2026-10-24T08:00:00Z',contextWindowMetadata:{estimatedTokensUsed:context,maxContextTokens:10000}}}});
 }
 if(children.length||legacy)steps.push({type:'CORTEX_STEP_TYPE_INVOKE_SUBAGENT',invokeSubagent:{...(legacy?{conversationId:legacy}:{}),results:children.map(conversationId=>({conversationId}))}});
 return {trajectory:{cascadeId:id,steps,generatorMetadata},numTotalSteps:steps.length,numTotalGeneratorMetadata:generatorMetadata.length,status:'CASCADE_RUN_STATUS_IDLE'};
}
function collector(t,{data=new Map([[child,raw(child)]]),summaries={},options={}}={}){
 const state={clock:100000,owns:true,data,calls:[],sources:[],updates:[],handle:null};
 const client={reader:{summaries},trajectory:async(id,settings)=>{state.calls.push({id,settings});if(state.handle)return state.handle(id,settings);if(!state.data.has(id))throw Error('Fixture child missing');return state.data.get(id);}};
 const tracker=new DelegatedUsage(client,{now:()=>state.clock,owns:()=>state.owns,
  onSource:async(scope,id,value)=>{state.sources.push({scope,id,value});},
  onUpdate:async(scope,id,value,ids)=>{state.updates.push({scope,id,value,ids});},...options});
 t.after(()=>tracker.dispose());
 return {state,client,tracker,result:()=>tracker.tasks.get(parent)?.result};
}
const memoryHistory=()=>({load:async()=>null,save:async()=>null});

test('a time-bounded pass resumes unread children before rechecking earlier children',async t=>{
 const {state,tracker,result}=collector(t,{data:new Map([[child,raw(child)],[sibling,raw(sibling)],[nested,raw(nested)]])});
 state.handle=async id=>{state.clock+=20000;return state.data.get(id);};
 const root=raw(parent,{children:[child,sibling,nested]});tracker.request(account,parent,root);await tracker.idle();
 assert.deepEqual(state.calls.map(c=>c.id),[child,sibling]);assert.equal(result().state,'partial');
 state.clock+=5001;tracker.request(account,parent,root);await tracker.idle();
 assert.equal(state.calls[2].id,nested,'The previously unread descendant must not starve');
 assert.equal(result().loadedSubagents,3);
});
function storeFixture(t,{history=memoryHistory(),data=new Map([[parent,raw(parent,{children:[child]})],[child,raw(child)]]),summaries={},onTrajectory=null}={}){
 const state={data,pid:1,email:'delegation-fixture@example.test',owns:true,calls:[],sources:[],handle:null};
 const client={reader:{summaries},discover:async()=>({pid:state.pid}),resetTrajectories(){},
  call:async method=>method==='GetUserStatus'?{userStatus:{email:state.email}}:method==='GetAllCascadeTrajectories'?{trajectorySummaries:client.reader.summaries}:{response:{groups:[]}},
  trajectory:async(id,settings)=>{state.calls.push({id,settings});if(state.handle)return state.handle(id,settings);if(!state.data.has(id))throw Error('Fixture conversation missing');return state.data.get(id);}};
 const store=new MetricsStore(client,{history,transcripts:null,owns:()=>state.owns,onTrajectory:async(scope,id,value)=>{
  state.sources.push({scope,id,value});if(onTrajectory)await onTrajectory(scope,id,value);
 }});
 t.after(()=>store.dispose());return {state,client,store};
}
async function temporary(t){
 const directory=await mkdtemp(join(tmpdir(),'ag-delegated-test-'));
 t.after(async()=>{const checked=resolve(directory);assert.equal(dirname(checked),resolve(tmpdir()));assert.ok(basename(checked).startsWith('ag-delegated-test-'));await rm(checked,{recursive:true,force:true});});
 return directory;
}

test('parent snapshot resolves while child waits; task updates never replace parent speed or context',{timeout:5000},async t=>{
 const fixture=storeFixture(t),gate=deferred(),started=deferred();
 const own=fixture.state.data.get(parent),childValue=raw(child,{output:800,duration:'1s',context:9000});
 t.after(()=>gate.resolve(childValue));
 fixture.state.handle=async id=>{if(id===child){started.resolve();return gate.promise;}return own;};
 const pending=fixture.store.snapshot({conversationId:parent});await bounded(started.promise);
 const snapshot=await bounded(pending,'Parent snapshot waited for the child');
 assert.equal(snapshot.connection,'live');assert.equal(snapshot.speed.taskUsage.state,'loading');
 assert.equal(snapshot.speed.taskUsage.tokens.totalTokens,unitTokens);assert.equal(snapshot.speed.taskUsage.loadedSubagents,0);
 assert.deepEqual(fixture.state.sources.map(s=>s.id),[parent]);
 const expected=trajectoryMetrics(own);
 gate.resolve(childValue);await bounded(fixture.store.delegated.idle());
 const actual=fixture.store.sessions.get(parent).data;
 assert.equal(actual.taskUsage.tokens.totalTokens,unitTokens+925);assert.equal(actual.taskUsage.state,'ready');
 for(const key of ['tps','latestTps','streamingSeconds','modelSeconds','toolSeconds','requests','rounds','steps'])assert.equal(actual[key],expected[key],key);
 assert.deepEqual(actual.context,expected.context);assert.deepEqual(actual.counts,expected.counts);assert.deepEqual(actual.tokens,expected.tokens);
 assert.deepEqual(fixture.state.sources.map(s=>s.id),[parent,child]);
 for(const source of fixture.state.sources)assert.equal(source.value.trajectory.cascadeId,source.id,'Each source is forwarded under its own identity');
});

test('collector discovers modern invocation and metadata-only parent/root children',{timeout:5000},async t=>{
 const fixture=collector(t,{data:new Map([[child,raw(child)],[sibling,raw(sibling)],[nested,raw(nested)]]),summaries:{
  [sibling]:{stepCount:2,trajectoryMetadata:{parentConversationId:parent}},
  [nested]:{stepCount:2,trajectoryMetadata:{parentConversationId:sibling,rootConversationId:parent}},
 }});
 fixture.tracker.request(account,parent,raw(parent,{children:[child]}));await bounded(fixture.tracker.idle());
 assert.deepEqual(fixture.state.calls.map(c=>c.id).sort(),[child,sibling,nested].sort());
 assert.equal(fixture.result().tokens.totalTokens,unitTokens*4);assert.equal(fixture.result().subagents,3);assert.equal(fixture.result().complete,true);
});

test('nested shared children and cyclic links are visited once without self-accounting',{timeout:5000},async t=>{
 const fixture=collector(t,{data:new Map([[child,raw(child,{children:[nested]})],[sibling,raw(sibling,{children:[nested]})],[nested,raw(nested,{children:[parent,child]})]])});
 fixture.tracker.request(account,parent,raw(parent,{children:[child,sibling]}));await bounded(fixture.tracker.idle());
 assert.deepEqual(fixture.state.calls.map(c=>c.id),[child,sibling,nested]);assert.deepEqual(fixture.state.sources.map(s=>s.id),[child,sibling,nested]);
 assert.equal(fixture.result().subagents,3);assert.equal(fixture.result().loadedSubagents,3);assert.equal(fixture.result().tokens.totalTokens,unitTokens*4);
});

test('a growing child is refreshed even when the idle parent raw object is unchanged',{timeout:5000},async t=>{
 const fixture=collector(t),own=raw(parent,{children:[child]});
 fixture.tracker.request(account,parent,own);await bounded(fixture.tracker.idle());assert.equal(fixture.result().tokens.totalTokens,unitTokens*2);
 fixture.state.data.set(child,raw(child,{requests:2}));fixture.state.clock+=5001;
 fixture.tracker.request(account,parent,own);await bounded(fixture.tracker.idle());
 assert.equal(fixture.state.calls.length,2);assert.equal(fixture.result().tokens.totalTokens,unitTokens*3);assert.equal(fixture.result().state,'ready');
 assert.equal(fixture.state.calls[1].settings.force,false);
});

test('persisted known children missing from summaries use EOF reads with an empty summary',{timeout:5000},async t=>{
 const fixture=collector(t);fixture.tracker.request(account,parent,raw(parent),{knownIds:[child]});await bounded(fixture.tracker.idle());
 assert.equal(fixture.state.calls.length,1);assert.deepEqual(fixture.state.calls[0].settings.summary,{});
 assert.equal(typeof fixture.state.calls[0].settings.isCurrent,'function');assert.equal(fixture.result().tokens.totalTokens,unitTokens*2);
});

test('failed child refresh keeps known rows partial, backs off and honors force retry',{timeout:5000},async t=>{
 const fixture=collector(t,{options:{refreshMs:10}}),own=raw(parent,{children:[child]});let fail=false;
 fixture.state.handle=async()=>{if(fail)throw Error('Fixture unavailable');return fixture.state.data.get(child);};
 fixture.tracker.request(account,parent,own);await bounded(fixture.tracker.idle());
 fail=true;fixture.state.clock+=11;fixture.tracker.request(account,parent,own);await bounded(fixture.tracker.idle());
 assert.equal(fixture.result().tokens.totalTokens,unitTokens*2);assert.equal(fixture.result().state,'partial');assert.equal(fixture.result().complete,false);
 assert.equal(fixture.result().tokens.complete,false);assert.equal(fixture.result().cache.complete,false);
 fixture.state.clock+=11;fixture.tracker.request(account,parent,own);await bounded(fixture.tracker.idle());assert.equal(fixture.state.calls.length,2,'Backoff avoids another child fetch');
 fail=false;fixture.state.data.set(child,raw(child,{requests:2}));fixture.tracker.request(account,parent,own,{force:true});await bounded(fixture.tracker.idle());
 assert.equal(fixture.state.calls.length,3);assert.equal(fixture.state.calls[2].settings.force,true);assert.equal(fixture.result().state,'ready');assert.equal(fixture.result().tokens.totalTokens,unitTokens*3);
});

test('shorter child observations preserve cumulative rows and stay partial until coverage recovers',{timeout:5000},async t=>{
 const fixture=collector(t,{data:new Map([[child,raw(child,{requests:2})]])}),own=raw(parent,{children:[child]});
 fixture.tracker.request(account,parent,own);await bounded(fixture.tracker.idle());
 fixture.state.data.set(child,raw(child));fixture.tracker.request(account,parent,own,{force:true});await bounded(fixture.tracker.idle());
 assert.equal(fixture.result().tokens.totalTokens,unitTokens*3);assert.equal(fixture.result().state,'partial');assert.equal(fixture.result().complete,false);
 fixture.state.data.set(child,raw(child,{requests:2}));fixture.tracker.request(account,parent,own,{force:true});await bounded(fixture.tracker.idle());
 assert.equal(fixture.result().tokens.totalTokens,unitTokens*3);assert.equal(fixture.result().state,'ready');assert.equal(fixture.result().complete,true);
});

test('temporary incomplete root and child snapshots retain coherent request caches until both recover',{timeout:5000},async t=>{
 const own=raw(parent,{children:[child]}),initialChild=raw(child,{requests:2});
 const fixture=collector(t,{data:new Map([[child,initialChild]])});
 fixture.tracker.request(account,parent,own);await bounded(fixture.tracker.idle());
 const ownRows=taskRecords(own,parent),childRows=taskRecords(initialChild,child);
 assert.equal(fixture.result().tokens.totalTokens,unitTokens*3);assert.equal(fixture.result().complete,true);
 const incompleteOwn=raw(parent,{children:[child],output:31});
 incompleteOwn.trajectory.generatorMetadata[0].chatModel.usage.inputTokens='invalid';
 const incompleteChild=raw(child);
 incompleteChild.trajectory.generatorMetadata[0].chatModel.usage.outputTokens='invalid';
 fixture.state.data.set(child,incompleteChild);fixture.tracker.request(account,parent,incompleteOwn,{force:true});await bounded(fixture.tracker.idle());
 const cached=fixture.tracker.tasks.get(parent);
 assert.deepEqual(cached.sources.get(parent).rows,ownRows,'The partial root cannot create a synthetic mixed-counter request');
 assert.deepEqual(cached.sources.get(child).rows,childRows,'The partial child cannot erase a field or a missing earlier request');
 assert.equal(fixture.result().ownTokens,unitTokens);assert.equal(fixture.result().subagentTokens,unitTokens*2);
 assert.equal(fixture.result().tokens.measuredRequests,3);assert.equal(fixture.result().state,'partial');assert.equal(fixture.result().complete,false);
 assert.equal(fixture.result().tokens.complete,false);assert.equal(fixture.result().cache.complete,false);
 const recoveredOwn=raw(parent,{children:[child],input:110,output:35});
 fixture.tracker.request(account,parent,recoveredOwn,{force:true});await bounded(fixture.tracker.idle());
 assert.equal(fixture.result().ownTokens,170);assert.equal(fixture.result().subagentTokens,unitTokens*2);assert.equal(fixture.result().state,'partial','Root recovery cannot conceal the still-incomplete child');
 fixture.state.data.set(child,raw(child,{requests:3}));fixture.tracker.request(account,parent,recoveredOwn,{force:true});await bounded(fixture.tracker.idle());
 assert.equal(fixture.result().ownTokens,170);assert.equal(fixture.result().subagentTokens,unitTokens*3);assert.equal(fixture.result().tokens.totalTokens,635);
 assert.equal(fixture.result().tokens.measuredRequests,4);assert.equal(fixture.result().state,'ready');assert.equal(fixture.result().complete,true);
 assert.equal(fixture.result().tokens.complete,true);assert.equal(fixture.result().cache.complete,true);
});

test('scope change discards pending child results and drains the new account task',{timeout:5000},async t=>{
 const fixture=collector(t),gate=deferred(),started=deferred(),oldValue=raw(child,{output:999}),newValue=raw(child,{output:7});
 t.after(()=>gate.resolve(oldValue));let reads=0;
 fixture.state.handle=async()=>{if(++reads===1){started.resolve();return gate.promise;}return newValue;};
 const own=raw(parent,{children:[child]});fixture.tracker.request(account,parent,own);await bounded(started.promise);
 fixture.tracker.request(secondAccount,parent,own);gate.resolve(oldValue);await bounded(fixture.tracker.idle());
 assert.deepEqual(fixture.state.sources.map(s=>s.scope),[secondAccount]);assert.equal(fixture.state.sources[0].value,newValue);
 assert.deepEqual(fixture.state.updates.map(s=>s.scope),[secondAccount]);assert.equal(fixture.result().tokens.totalTokens,unitTokens+132);
});

test('reset epoch and lost ownership reject a pending child before callbacks or cache writes',{timeout:5000},async t=>{
 for(const mode of ['reset','owner'])await t.test(mode,async sub=>{
  const fixture=collector(sub),gate=deferred(),started=deferred();sub.after(()=>gate.resolve(raw(child)));
  fixture.state.handle=async()=>{started.resolve();return gate.promise;};
  fixture.tracker.request(account,parent,raw(parent,{children:[child]}));await bounded(started.promise);
  if(mode==='reset')fixture.tracker.reset();else fixture.state.owns=false;
  gate.resolve(raw(child));await bounded(fixture.tracker.idle());
  assert.equal(fixture.state.sources.length,0);assert.equal(fixture.state.updates.length,0);
  if(mode==='reset'){assert.equal(fixture.tracker.tasks.size,0);assert.equal(fixture.tracker.bytes,0);}
  else assert.equal(fixture.tracker.tasks.get(parent).sources.has(child),false);
 });
});

test('store backend epoch change cannot attach an old child result to a replacement session',{timeout:5000},async t=>{
 const fixture=storeFixture(t),gate=deferred(),started=deferred(),oldValue=raw(child,{output:999}),newValue=raw(child,{output:7});
 t.after(()=>gate.resolve(oldValue));let childReads=0;
 fixture.state.handle=async id=>{if(id!==child)return fixture.state.data.get(id);if(++childReads===1){started.resolve();return gate.promise;}return newValue;};
 await bounded(fixture.store.snapshot({conversationId:parent}));await bounded(started.promise);
 const oldEpoch=fixture.store.epoch;fixture.state.pid++;
 await bounded(fixture.store.snapshot({conversationId:parent}));assert.ok(fixture.store.epoch>oldEpoch);
 gate.resolve(oldValue);await bounded(fixture.store.delegated.idle());
 const children=fixture.state.sources.filter(s=>s.id===child);assert.equal(children.length,1);assert.equal(children[0].value,newValue);
 assert.equal(fixture.store.sessions.get(parent).data.taskUsage.tokens.totalTokens,unitTokens+132);
});

test('agent cap and retained-row memory budget stop collection with explicit partial coverage',{timeout:5000},async t=>{
 const capped=collector(t,{data:new Map([[child,raw(child)],[sibling,raw(sibling)],[nested,raw(nested)]]),options:{maxAgents:2}});
 capped.tracker.request(account,parent,raw(parent,{children:[child,sibling,nested]}));await bounded(capped.tracker.idle());
 assert.equal(capped.state.calls.length,2);assert.equal(capped.tracker.tasks.get(parent).children.size,2);assert.equal(capped.result().state,'partial');assert.equal(capped.result().complete,false);
 const own=raw(parent,{children:[child]}),budget=Buffer.byteLength(JSON.stringify(taskRecords(own,parent)))+Buffer.byteLength(JSON.stringify(taskRecords(raw(child),child)))-1;
 const limited=collector(t,{options:{budgetBytes:budget}});limited.tracker.request(account,parent,own);await bounded(limited.tracker.idle());
 assert.ok(limited.tracker.bytes<=budget);assert.equal(limited.result().loadedSubagents,0);assert.equal(limited.result().state,'partial');assert.equal(limited.state.sources.length,0);
 const impossible=collector(t,{options:{budgetBytes:1}});impossible.tracker.request(account,parent,own);await bounded(impossible.tracker.idle());
 assert.equal(impossible.tracker.bytes,0);assert.equal(impossible.result().complete,false);assert.equal(impossible.result().state,'partial');
});

test('task summaries survive history reload and remain visibly incomplete until child refresh succeeds',{timeout:5000},async t=>{
 const directory=await temporary(t),history=new SessionHistory(join(directory,'history'));
 const first=storeFixture(t,{history});await bounded(first.store.snapshot({conversationId:parent}));await bounded(first.store.delegated.idle());
 const saved=await history.load(account,parent);assert.equal(saved.metrics.taskUsage.tokens.totalTokens,unitTokens*2);assert.deepEqual(saved.metrics.delegatedConversations,[child]);
 first.store.dispose();
 const second=storeFixture(t,{history:new SessionHistory(history.directory),data:new Map([[parent,raw(parent)],[child,raw(child)]])});
 const gate=deferred(),started=deferred();t.after(()=>gate.resolve(raw(child)));
 second.state.handle=async id=>{if(id===child){started.resolve();return gate.promise;}return second.state.data.get(id);};
 const restored=await bounded(second.store.snapshot({conversationId:parent}));await bounded(started.promise);
 assert.equal(restored.speed.taskUsage.tokens.totalTokens,unitTokens*2);assert.ok(['loading','partial'].includes(restored.speed.taskUsage.state));assert.equal(restored.speed.taskUsage.complete,false);
 assert.equal(restored.speed.taskUsage.tokens.complete,false);assert.equal(restored.speed.taskUsage.cache.complete,false);
 assert.deepEqual(second.state.calls.find(c=>c.id===child).settings.summary,{});
 gate.reject(Error('Fixture child unavailable'));await bounded(second.store.delegated.idle());
 const partial=second.store.sessions.get(parent).data.taskUsage;assert.equal(partial.tokens.totalTokens,unitTokens*2);assert.equal(partial.state,'partial');assert.equal(partial.complete,false);
 const persisted=await second.store.history.load(account,parent);assert.equal(persisted.metrics.taskUsage.state,'partial');assert.equal(persisted.metrics.taskUsage.tokens.totalTokens,unitTokens*2);
 const text=await readFile(history.file(account,parent),'utf8');assert.equal(text.includes('request:'),false);assert.equal(text.includes('generatorMetadata'),false);
});

test('restart with every child present but incomplete lower rows retains the coherent saved aggregate',{timeout:5000},async t=>{
 const directory=await temporary(t),history=new SessionHistory(join(directory,'history'));
 const completeOwn=raw(parent,{children:[child],requests:2}),completeChild=raw(child,{requests:2});
 const first=storeFixture(t,{history,data:new Map([[parent,completeOwn],[child,completeChild]])});
 await bounded(first.store.snapshot({conversationId:parent}));await bounded(first.store.delegated.idle());
 const previous=(await history.load(account,parent)).metrics.taskUsage;assert.equal(previous.tokens.totalTokens,unitTokens*4);first.store.dispose();
 const incompleteChild=raw(child,{requests:2});
 for(const g of incompleteChild.trajectory.generatorMetadata){g.chatModel.usage.inputTokens='invalid';g.chatModel.usage.outputTokens='invalid';}
 const second=storeFixture(t,{history:new SessionHistory(history.directory),data:new Map([[parent,raw(parent,{children:[child]})],[child,incompleteChild]])});
 await bounded(second.store.snapshot({conversationId:parent}));await bounded(second.store.delegated.idle());
 const task=second.store.sessions.get(parent).data.taskUsage;
 assert.equal(task.loadedSubagents,task.subagents);assert.equal(task.subagents,1,'All known children were readable, so count completeness alone cannot protect totals');
 assert.equal(task.tokens.totalTokens,previous.tokens.totalTokens);assert.equal(task.ownTokens,previous.ownTokens);assert.equal(task.subagentTokens,previous.subagentTokens);
 for(const key of ['inputTokens','outputTokens','cachedTokens','cacheWriteTokens','uncachedTokens','totalTokens'])assert.equal(task.tokens[key],previous.tokens[key],key);
 assert.equal(task.state,'partial');assert.equal(task.complete,false);assert.equal(task.tokens.complete,false);assert.equal(task.cache.complete,false);
 const reloaded=(await second.store.history.load(account,parent)).metrics.taskUsage;assert.equal(reloaded.tokens.totalTokens,unitTokens*4);assert.equal(reloaded.state,'partial');
 second.state.data.set(parent,completeOwn);second.state.data.set(child,completeChild);
 await bounded(second.store.snapshot({conversationId:parent,force:true}));await bounded(second.store.delegated.idle());
 const recovered=second.store.sessions.get(parent).data.taskUsage;assert.equal(recovered.tokens.totalTokens,unitTokens*4);assert.equal(recovered.state,'ready');assert.equal(recovered.complete,true);
});

test('restart cannot freeze a larger current root behind a smaller saved task while its child is unavailable',{timeout:5000},async t=>{
 const directory=await temporary(t),history=new SessionHistory(join(directory,'history'));
 const initialOwn=raw(parent,{children:[child],input:70,read:0,write:0,output:30}),initialChild=raw(child,{input:70,read:0,write:0,output:30});
 const first=storeFixture(t,{history,data:new Map([[parent,initialOwn],[child,initialChild]])});
 await bounded(first.store.snapshot({conversationId:parent}));await bounded(first.store.delegated.idle());
 const saved=(await history.load(account,parent)).metrics.taskUsage;
 assert.equal(saved.ownTokens,100);assert.equal(saved.subagentTokens,100);assert.equal(saved.tokens.totalTokens,200);first.store.dispose();
 const currentOwn=raw(parent,{children:[child],input:470,read:0,write:0,output:30});
 const second=storeFixture(t,{history:new SessionHistory(history.directory),data:new Map([[parent,currentOwn],[child,initialChild]])});
 const gate=deferred(),started=deferred();t.after(()=>gate.resolve(initialChild));
 second.state.handle=async id=>{if(id===child){started.resolve();return gate.promise;}return currentOwn;};
 const snapshot=await bounded(second.store.snapshot({conversationId:parent}));await bounded(started.promise);
 const coherent=task=>{
  assert.ok(task.tokens.totalTokens>=500,'Current root alone already exceeds the old task total');
  assert.equal(task.ownTokens,500);assert.equal(task.tokens.totalTokens,task.ownTokens+task.subagentTokens);
  assert.equal(task.complete,false);assert.equal(task.tokens.complete,false);assert.equal(task.cache.complete,false);
 };
 coherent(snapshot.speed.taskUsage);assert.ok(['loading','partial'].includes(snapshot.speed.taskUsage.state));
 gate.reject(Error('Fixture child unavailable'));await bounded(second.store.delegated.idle());
 const partial=second.store.sessions.get(parent).data.taskUsage;coherent(partial);assert.equal(partial.state,'partial');
 const persisted=(await second.store.history.load(account,parent)).metrics.taskUsage;coherent(persisted);assert.equal(persisted.state,'partial');
});

test('a parent with no own usage or context persists and restores child-only task tokens',{timeout:5000},async t=>{
 const directory=await temporary(t),history=new SessionHistory(join(directory,'history'));
 const fixture=storeFixture(t,{history,data:new Map([[parent,raw(parent,{requests:0,children:[child]})],[child,raw(child)]])});
 await bounded(fixture.store.snapshot({conversationId:parent}));await bounded(fixture.store.delegated.idle());
 const current=fixture.store.sessions.get(parent).data;
 assert.equal(current.tps,null);assert.equal(current.context,null);assert.equal(current.requests,0);assert.equal(current.tokens.measuredRequests,0);
 assert.equal(current.taskUsage.ownTokens,0);assert.equal(current.taskUsage.subagentTokens,unitTokens);assert.equal(current.taskUsage.tokens.totalTokens,unitTokens);
 const saved=await history.load(account,parent);assert.ok(saved,'Child-only token consumption is useful history');
 assert.equal(saved.metrics.taskUsage.tokens.totalTokens,unitTokens);assert.equal(saved.metrics.context,null);assert.deepEqual(saved.metrics.delegatedConversations,[child]);
 fixture.store.dispose();
 const restarted=storeFixture(t,{history:new SessionHistory(history.directory)});restarted.state.handle=async()=>{throw Error('Fixture host statistics unavailable');};
 const offline=await bounded(restarted.store.snapshot({conversationId:parent}));
 assert.equal(offline.speed.restoredFromHistory,true);assert.equal(offline.speed.requests,0);assert.equal(offline.speed.tokens.measuredRequests,0);
 assert.equal(offline.speed.taskUsage.tokens.totalTokens,unitTokens);assert.equal(offline.speed.context,null);
});

test('individual source ingestion and opening a child never double the account usage ledger',{timeout:5000},async t=>{
 const directory=await temporary(t),ledger=new UsageLedger(join(directory,'ledger'));
 const own=raw(parent,{children:[child],responseIds:['shared-request']}),delegated=raw(child,{requests:2,responseIds:['shared-request','child-request']});
 const fixture=storeFixture(t,{history:new SessionHistory(join(directory,'history')),data:new Map([[parent,own],[child,delegated]]),onTrajectory:(scope,id,value)=>ledger.ingest(scope,id,value)});
 await bounded(fixture.store.snapshot({conversationId:parent}));await bounded(fixture.store.delegated.idle());
 let summary=await ledger.summary(account);assert.equal(summary.totalTokens,unitTokens*2);assert.equal(summary.requests,2);
 assert.equal(fixture.store.sessions.get(parent).data.taskUsage.tokens.totalTokens,unitTokens*2);
 assert.deepEqual(fixture.state.sources.map(s=>s.id),[parent,child]);assert.equal(fixture.state.sources[0].value,own);assert.equal(fixture.state.sources[1].value,delegated);
 const childSnapshot=await bounded(fixture.store.snapshot({conversationId:child,force:true}));await bounded(fixture.store.delegated.idle());
 assert.equal(childSnapshot.speed.conversationId,child);summary=await ledger.summary(account);assert.equal(summary.totalTokens,unitTokens*2);assert.equal(summary.requests,2);
 assert.deepEqual(fixture.state.sources.map(s=>s.id),[parent,child,child]);
 const rootFile=JSON.parse(await readFile(ledger.file(account,parent),'utf8')),childFile=JSON.parse(await readFile(ledger.file(account,child),'utf8'));
 assert.equal(rootFile.records.length,1);assert.equal(childFile.records.length,2);assert.equal((await ledger.summary(secondAccount)).totalTokens,0);
});
