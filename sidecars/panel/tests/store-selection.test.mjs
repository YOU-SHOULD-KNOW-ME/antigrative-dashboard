import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as yieldNow} from 'node:timers/promises';
import {MetricsStore} from '../store.mjs';

const parent='11111111-1111-1111-1111-111111111111';
const child='22222222-2222-2222-2222-222222222222';
const sample=(id,output,cached,used)=>({trajectory:{cascadeId:id,steps:[],generatorMetadata:[{
  chatModel:{modelDisplayName:'Fixture',streamingDuration:'2s',
    chatStartMetadata:{contextWindowMetadata:{estimatedTokensUsed:used,maxContextTokens:100000}},
    usage:{inputTokens:400,cacheReadTokens:cached,outputTokens:output,responseOutputTokens:output,apiProvider:'API_PROVIDER_GOOGLE_GEMINI'}},
}]}});
const samples={[parent]:sample(parent,100,600,44000),[child]:sample(child,180,100,12000)};

function fixture(t,{trajectory}={}){
  const state={lists:0,reads:[],historyReads:0,saved:new Map()};
  const store=new MetricsStore({
    discover:async()=>({pid:1}),
    call:async method=>{
      if(method==='GetUserStatus')return {userStatus:{email:'fixture@example.test'}};
      if(method==='RetrieveUserQuotaSummary')return {};
      assert.equal(method,'GetAllCascadeTrajectories');state.lists++;
      return {trajectorySummaries:{[parent]:{lastModifiedTime:'2026-10-30T01:00:00Z'}}};
    },
    trajectory:async id=>{state.reads.push(id);return trajectory?trajectory(id):samples[id];},
  },{transcripts:null,history:{
    load:async(scope,id)=>{state.historyReads++;return state.saved.get(id)||null;},
    save:async(scope,id,metrics)=>{const saved={savedAt:'2026-10-30T02:00:00Z',metrics};state.saved.set(id,saved);return saved;},
  }});
  t.after(()=>store.dispose());return {store,state};
}

test('default panel selection still chooses the latest conversation for omitted, undefined, null and empty IDs',async t=>{
  for(const input of [undefined,{}, {conversationId:undefined},{conversationId:null},{conversationId:''}]){
    const {store,state}=fixture(t);
    const result=await store.snapshot(input);
    assert.equal(result.speed.conversationId,parent);
    assert.equal(result.speed.tps,50);
    assert.equal(state.lists,1);
    assert.deepEqual(state.reads,[parent]);
  }
});

test('unresolved inline selection returns quota only even when a recent conversation is cached',async t=>{
  for(const input of [{},{conversationId:undefined},{conversationId:null},{conversationId:''}]){
    const {store,state}=fixture(t);
    await store.snapshot(); // A panel already populated the shared recent-chat cache.
    state.lists=0;state.reads.length=0;state.historyReads=0;
    const result=await store.snapshot({...input,selectLatest:false,force:true});
    assert.equal(result.connection,'live');assert.equal(result.speed,null);
    assert.deepEqual(result.groups,store.quota);
    assert.equal(state.lists,0);assert.deepEqual(state.reads,[]);assert.equal(state.historyReads,0);
  }
});

test('inline explicit child selection bypasses recent-parent enumeration and keeps its own metrics',async t=>{
  const {store,state}=fixture(t);
  const result=await store.snapshot({conversationId:child,selectLatest:false});
  assert.equal(result.speed.conversationId,child);assert.equal(result.speed.tps,90);
  assert.equal(result.speed.context.usedFraction,.12);assert.equal(result.speed.cache.hitRate,.2);
  assert.equal(state.lists,0);assert.deepEqual(state.reads,[child]);
});

test('late parent results cannot overwrite child snapshots or make an unresolved composer borrow its data',async t=>{
  const pending=new Map();
  const {store,state}=fixture(t,{trajectory:id=>new Promise(resolve=>pending.set(id,()=>resolve(samples[id])))});
  const parentRequest=store.snapshot({conversationId:parent,selectLatest:false});
  const childRequest=store.snapshot({conversationId:child,selectLatest:false});
  for(let turn=0;pending.size<2&&turn<100;turn++)await yieldNow();
  assert.equal(pending.size,2);
  const unknown=await store.snapshot({conversationId:null,selectLatest:false});assert.equal(unknown.speed,null);
  pending.get(child)();const childResult=await childRequest;
  assert.equal(childResult.speed.conversationId,child);assert.equal(childResult.speed.tps,90);
  pending.get(parent)();const parentResult=await parentRequest;
  assert.equal(parentResult.speed.conversationId,parent);assert.equal(parentResult.speed.tps,50);
  const cachedChild=await store.snapshot({conversationId:child,selectLatest:false});
  assert.equal(cachedChild.speed.conversationId,child);assert.equal(cachedChild.speed.context.usedFraction,.12);
  assert.equal((await store.snapshot({conversationId:null,selectLatest:false})).speed,null);
  assert.deepEqual(state.reads,[parent,child]);assert.equal(state.lists,0);
  assert.equal(state.saved.get(parent).metrics.conversationId,parent);assert.equal(state.saved.get(child).metrics.conversationId,child);
});
