import test from 'node:test';
import assert from 'node:assert/strict';
import {MetricsStore} from '../store.mjs';
import {DelegatedUsage} from '../delegated-usage.mjs';

const account='a'.repeat(64),id='11111111-1111-1111-1111-111111111111';
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const raw={trajectory:{steps:[],generatorMetadata:[{chatModel:{streamingDuration:'2s',usage:{messageId:'owner-test',inputTokens:10,outputTokens:10,responseOutputTokens:10}}}]}};

function fixture(t){
  const state={owned:true,reads:0,loads:0,saves:0,sources:0,calls:[],transcripts:0};
  const history={load:async()=>{state.loads++;return null;},save:async()=>{state.saves++;return null;}};
  const client={trajectory:async()=>{state.reads++;return raw;},call:async method=>{
    state.calls.push(method);
    return method==='GetUserStatus'?{userStatus:{email:'owner-fixture@example.test'}}:{trajectorySummaries:{[id]:{status:'DONE'}}};
  }};
  const store=new MetricsStore(client,{history,owns:()=>state.owned,onTrajectory:async()=>{state.sources++;},
    transcripts:{request(){state.transcripts++;},reset(){}}});
  store.identity=account;t.after(()=>store.dispose());return {state,store,client,history};
}

test('a retired owner cannot start a foreground trajectory or history load',async t=>{
  const {store,state}=fixture(t);state.owned=false;
  await assert.rejects(store.session(id),/ownership|重新连接/i);
  assert.equal(state.loads,0);assert.equal(state.reads,0);assert.equal(state.saves,0);
});

test('owner loss during a trajectory stops usage ingestion, transcript work and history writes',async t=>{
  const {store,state,client}=fixture(t),started=deferred(),result=deferred();
  client.trajectory=async()=>{started.resolve();return result.promise;};
  const pending=store.session(id);await started.promise;
  state.owned=false;result.resolve(raw);
  await assert.rejects(pending,/ownership|重新连接/i);
  assert.equal(state.sources,0);assert.equal(state.saves,0);assert.equal(state.transcripts,0);
  assert.equal(store.sessions.get(id)?.data,undefined);
});

test('owner loss during saved-history loading prevents the next trajectory request',async t=>{
  const {store,state,history}=fixture(t),started=deferred(),result=deferred();
  history.load=async()=>{started.resolve();return result.promise;};
  const pending=store.session(id);await started.promise;
  state.owned=false;result.resolve(null);
  await assert.rejects(pending,/ownership|重新连接/i);
  assert.equal(state.reads,0);assert.equal(state.sources,0);assert.equal(state.saves,0);
});

test('owner loss during account discovery prevents the next quota RPC and identity update',async t=>{
  const {store,state,client}=fixture(t),started=deferred(),result=deferred();
  client.call=async method=>{state.calls.push(method);started.resolve();return result.promise;};
  const pending=store.refreshQuota(true);await started.promise;
  state.owned=false;result.resolve({userStatus:{email:'different-account@example.test'}});
  await assert.rejects(pending,/ownership|重新连接/i);
  assert.deepEqual(state.calls,['GetUserStatus']);assert.equal(store.identity,account);assert.equal(store.quota,null);
});

test('owner loss during conversation discovery cannot replace the cached list',async t=>{
  const {store,state,client}=fixture(t),started=deferred(),result=deferred();
  client.call=async()=>{started.resolve();return result.promise;};
  const pending=store.listConversations(true);await started.promise;
  state.owned=false;result.resolve({trajectorySummaries:{[id]:{status:'DONE'}}});
  await assert.rejects(pending,/ownership|重新连接/i);
  assert.deepEqual(store.summaries,[]);assert.equal(store.summariesAt,0);
});

test('foreground history saves carry the current owner into the persistence queue',async t=>{
  const {store,state,history}=fixture(t),started=deferred(),result=deferred();
  history.save=async(scope,conversation,value,{isCurrent}={})=>{
    assert.equal(typeof isCurrent,'function');assert.equal(isCurrent(),true);started.resolve();
    await result.promise;if(isCurrent())state.saves++;return null;
  };
  const pending=store.session(id);await started.promise;
  state.owned=false;result.resolve();
  await assert.rejects(pending,/ownership|重新连接/i);
  assert.equal(state.saves,0);assert.equal(store.persistenceError,null);
});

test('delegated aggregate saves also carry a cancellation guard into persistence',async t=>{
  const {store,state,history}=fixture(t),started=deferred(),result=deferred();
  store.sessions.set(id,{data:{conversationId:id}});
  history.save=async(scope,conversation,value,{isCurrent}={})=>{
    assert.equal(typeof isCurrent,'function');assert.equal(isCurrent(),true);started.resolve();
    await result.promise;if(isCurrent())state.saves++;return null;
  };
  const pending=store.delegated.onUpdate(account,id,{state:'ready'},[]);await started.promise;
  state.owned=false;result.resolve();await pending;
  assert.equal(state.saves,0);assert.equal(store.persistenceError,null);
});

test('an accidentally asynchronous ownership predicate cannot authorize delegated reads',async t=>{
  let calls=0;
  const usage=new DelegatedUsage({trajectory:async()=>{calls++;return raw;}},{owns:async()=>true});
  t.after(()=>usage.dispose());
  usage.request(account,id,raw,{knownIds:['22222222-2222-2222-2222-222222222222']});
  await usage.idle();assert.equal(calls,0);assert.equal(usage.tasks.size,0);
});
