import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {aggregateTaskUsage,mergeTaskRecords,safeTaskUsage,taskRecords} from '../task-usage.mjs';
import {trajectoryMetrics} from '../metrics.mjs';
import {usageRecords} from '../usage.mjs';

const parent='11111111-1111-1111-1111-111111111111',child='22222222-2222-2222-2222-222222222222';
const provider='API_PROVIDER_GOOGLE_GEMINI';
const generator=(id,usage={})=>({chatModel:{usage:{responseId:id,apiProvider:provider,...usage}}});
const raw=(...generators)=>({trajectory:{steps:[],generatorMetadata:generators}});
const records=(id,...generators)=>taskRecords(raw(...generators),id);
const opts={subagents:1,loadedSubagents:1,state:'ready'};

test('issue 20: parent 980101 plus delegated 191749 produces task total 1171850',()=>{
  const own=records(parent,generator('parent',{inputTokens:700000,cacheReadTokens:200000,outputTokens:80101}));
  const delegated=records(child,generator('child',{inputTokens:90000,cacheReadTokens:80000,cacheWriteTokens:10000,outputTokens:11749}));
  const result=aggregateTaskUsage(own,[delegated],opts);
  assert.equal(result.ownTokens,980101);assert.equal(result.subagentTokens,191749);assert.equal(result.tokens.totalTokens,1171850);
  assert.equal(result.tokens.inputTokens,1080000);assert.equal(result.tokens.outputTokens,91850);
  assert.equal(result.cache.hitRate,280000/1080000);assert.equal(result.complete,true);assert.equal(result.state,'ready');
  assert.deepEqual(safeTaskUsage(result),result);
  for(const key of ['tps','context','steps','counts','modelSeconds','streamingSeconds','transcriptStats'])assert.equal(Object.hasOwn(result,key),false);
});

test('shared children and repeated requests count once, while parent identity keeps contribution ownership',()=>{
  const own=records(parent,generator('same',{inputTokens:100,outputTokens:10}));
  const shared=records(child,generator('same',{inputTokens:100,outputTokens:20}),generator('child-only',{inputTokens:200,outputTokens:30}));
  const result=aggregateTaskUsage([...own,...own],[shared,shared],{subagents:1,loadedSubagents:1,state:'ready'});
  assert.equal(result.tokens.totalTokens,350);assert.equal(result.ownTokens,120);assert.equal(result.subagentTokens,230);
  assert.equal(result.tokens.measuredRequests,2);assert.equal(result.cache.measuredRequests,2);
  assert.deepEqual(safeTaskUsage(result),result);
});

test('duplicate observations prefer whole richer rows rather than combining conflicting request counters',()=>{
  const own=records(parent,generator('same',{inputTokens:100,cacheReadTokens:'invalid',outputTokens:10}),generator('same',{inputTokens:70,cacheReadTokens:5,outputTokens:20}));
  assert.equal(own.length,1);assert.equal(own[0].inputTokens,70);
  const result=aggregateTaskUsage(own,[],{subagents:0,loadedSubagents:0,state:'ready'});
  assert.equal(result.tokens.totalTokens,95);assert.equal(result.ownTokens,95);assert.equal(result.subagentTokens,0);
});

test('source merges retain whole high-water rows when a later snapshot loses fields, requests or tokens',()=>{
  const previous=records(parent,generator('first',{inputTokens:100,cacheReadTokens:20,outputTokens:10}),generator('second',{inputTokens:200,outputTokens:30}));
  for(const usage of [{outputTokens:30},{inputTokens:100,outputTokens:10},{inputTokens:100,cacheReadTokens:20,outputTokens:5},
    {inputTokens:200,cacheReadTokens:'invalid',outputTokens:100}]){
    const next=records(parent,generator('first',usage));
    const result=mergeTaskRecords(previous,next);
    assert.equal(result.restored,true);assert.deepEqual(result.rows,previous);
    assert.equal(aggregateTaskUsage(result.rows).tokens.totalTokens,360);
  }
  assert.deepEqual(mergeTaskRecords(previous,[]),{rows:previous,restored:true});
  assert.deepEqual(mergeTaskRecords(previous,previous),{rows:previous,restored:false});
});

test('complete equal-or-greater source recovery replaces the retained snapshot and clears restored',()=>{
  const previous=records(parent,generator('first',{inputTokens:100,outputTokens:10}));
  const fresh=records(parent,generator('first',{inputTokens:100,outputTokens:20}),generator('second',{inputTokens:200,outputTokens:30}));
  const updated=mergeTaskRecords(previous,fresh);assert.equal(updated.restored,false);assert.deepEqual(updated.rows,fresh);
  assert.equal(aggregateTaskUsage(updated.rows).tokens.totalTokens,350);
  const partial=records(parent,generator('partial',{outputTokens:100}));
  const smallerComplete=records(parent,generator('partial',{inputTokens:10,outputTokens:20}));
  assert.deepEqual(mergeTaskRecords(partial,smallerComplete),{rows:partial,restored:true},'Completeness alone must not reduce recorded consumption');
  const largerComplete=records(parent,generator('partial',{inputTokens:10,outputTokens:110}));
  assert.deepEqual(mergeTaskRecords(partial,largerComplete),{rows:largerComplete,restored:false});
});

test('request hashes match ledger identity and preserve conversation-scoped fallback without exposing text',()=>{
  const start='2026-10-10T16:05:00Z';
  const value={trajectory:{steps:[{type:'PLANNER_RESPONSE',metadata:{createdAt:start},plannerResponse:{response:'PRIVATE TEXT'}}],generatorMetadata:[
    {...generator('private-response',{inputTokens:3,outputTokens:4}),stepIndices:[0]},
    {stepIndices:[0],chatModel:{usage:{apiProvider:provider,messageId:'private-message',inputTokens:5,outputTokens:6}}},
    {stepIndices:[0],chatModel:{usage:{apiProvider:provider,inputTokens:7,outputTokens:8},chatStartMetadata:{createdAt:'2026-10-10T16:00:00Z'}}},
  ]}};
  const measured=taskRecords(value,parent),ledger=usageRecords(value,parent);
  assert.deepEqual(measured.map(r=>r.id),ledger.map(r=>r.id));
  assert.notEqual(taskRecords(value,child)[2].id,measured[2].id);
  assert.equal(measured[0].id,createHash('sha256').update(`response:${provider}:private-response`).digest('hex'));
  const serialized=JSON.stringify(measured);
  for(const secret of ['PRIVATE','private-response','private-message',parent,child,start,'stepIndices'])assert.equal(serialized.includes(secret),false);
  for(const row of measured)assert.deepEqual(Object.keys(row).sort(),['id','apiProvider','inputTokens','cacheReadTokens','cacheWriteTokens','outputTokens'].sort());
});

test('message identity includes provider and missing request IDs use original generator indices',()=>{
  const value=raw({chatModel:{usage:{messageId:'shared',apiProvider:'API_PROVIDER_OPENAI',inputTokens:1,outputTokens:2}}},
    {chatModel:{usage:{messageId:'shared',apiProvider:'API_PROVIDER_ANTHROPIC',inputTokens:1,outputTokens:2}}},
    {chatModel:{usage:{inputTokens:1,outputTokens:2}}},{chatModel:{usage:{inputTokens:1,outputTokens:2}}});
  const rows=taskRecords(value,parent);assert.equal(new Set(rows.map(r=>r.id)).size,4);
  assert.deepEqual(rows.map(r=>r.id),usageRecords(value,parent).map(r=>r.id));
});

test('zero, missing, malformed and unknown-provider fields retain trajectory token coverage semantics',()=>{
  const cases=[
    {inputTokens:'0',outputTokens:'200'},
    {outputTokens:'200'},
    {inputTokens:'100',cacheReadTokens:'invalid',outputTokens:'200'},
    {cacheReadTokens:'40',cacheWriteTokens:'5',outputTokens:'50'},
    {inputTokens:'123',outputTokens:'200',apiProvider:'UNKNOWN PRIVATE PROVIDER'},
    {inputTokens:'0',outputTokens:'0'},
  ];
  for(const [index,usage]of cases.entries()){
    const value=raw(generator('request-'+index,usage)),expected=trajectoryMetrics(value);
    const result=aggregateTaskUsage(taskRecords(value,parent),[],{subagents:0,loadedSubagents:0,state:'ready'});
    for(const [key,n]of Object.entries(expected.tokens))if(key!=='complete')assert.equal(result.tokens[key],n,`${index}:${key}`);
    assert.equal(result.tokens.complete,expected.tokens.complete);assert.equal(result.cache.hitRate,expected.cache.hitRate);
    assert.deepEqual(safeTaskUsage(result),result);
  }
  const missing=records(parent,generator('missing',{outputTokens:1}))[0],zero=records(parent,generator('zero',{inputTokens:0,outputTokens:1}))[0];
  assert.equal(missing.inputTokens,null);assert.equal(missing.cacheReadTokens,null);assert.equal(zero.inputTokens,0);assert.equal(zero.cacheReadTokens,0);
  for(const malformed of [true,false,[],[42],{},'', ' ', '1e3',Infinity,NaN,-1,1.5,Number.MAX_SAFE_INTEGER+1]){
    const row=records(parent,generator('bad',{inputTokens:malformed,outputTokens:malformed,cacheReadTokens:malformed,cacheWriteTokens:malformed}))[0];
    assert.equal(row.inputTokens,null);assert.equal(row.outputTokens,null);assert.equal(row.cacheReadTokens,null);assert.equal(row.cacheWriteTokens,null);
    const result=aggregateTaskUsage([row]);assert.equal(result.tokens.measuredRequests,0);assert.equal(result.complete,false);
  }
});

test('provider labels are allowlisted but unknown providers cannot leak through task rows',()=>{
  for(const value of ['API_PROVIDER_GOOGLE_GEMINI','GOOGLE_GEMINI','API_PROVIDER_OPENAI','OPENAI','API_PROVIDER_ANTHROPIC','ANTHROPIC']){
    const row=records(parent,generator('known',{apiProvider:value,inputTokens:1,outputTokens:1}))[0];
    assert.equal(row.apiProvider,value);assert.equal(aggregateTaskUsage([row]).cache.measuredRequests,1);
  }
  for(const value of ['PRIVATE_OPENAI_TOKEN',{},'x'.repeat(20000)]){
    const row=records(parent,generator('unknown',{apiProvider:value,inputTokens:1,outputTokens:1}))[0];
    assert.equal(row.apiProvider,'');assert.equal(aggregateTaskUsage([row]).cache.hitRate,null);
  }
});

test('malformed but present usage containers remain unmeasured requests instead of false completeness',()=>{
  for(const usage of [true,123,'PRIVATE malformed usage',[],[{prompt:'PRIVATE'}]]){
    const value=raw({chatModel:{usage}}),expected=trajectoryMetrics(value),rows=taskRecords(value,parent);
    assert.equal(rows.length,1);assert.equal(JSON.stringify(rows).includes('PRIVATE'),false);
    const result=aggregateTaskUsage(rows);
    assert.equal(result.tokens.measuredRequests,0);assert.equal(result.tokens.missingInputRequests,expected.tokens.missingInputRequests);
    assert.equal(result.tokens.missingOutputRequests,expected.tokens.missingOutputRequests);assert.equal(result.complete,false);assert.equal(result.state,'partial');
    assert.deepEqual(safeTaskUsage(result),result);
  }
});

test('arithmetic overflow stays unavailable instead of silently dropping the overflowing component',()=>{
  const cases=[
    [generator('a',{inputTokens:Number.MAX_SAFE_INTEGER,outputTokens:0}),generator('b',{inputTokens:1,outputTokens:30})],
    [generator('a',{inputTokens:Number.MAX_SAFE_INTEGER,cacheReadTokens:1,outputTokens:0})],
    [generator('a',{inputTokens:0,outputTokens:Number.MAX_SAFE_INTEGER}),generator('b',{inputTokens:0,outputTokens:1})],
    [generator('a',{inputTokens:Number.MAX_SAFE_INTEGER,outputTokens:1})],
  ];
  for(const generators of cases){
    const result=aggregateTaskUsage(records(parent,...generators));
    assert.equal(result.tokens.totalTokens,null);assert.equal(result.ownTokens,null);assert.equal(result.complete,false);
    for(const group of [result.tokens,result.cache])for(const [key,value]of Object.entries(group)){
      if(typeof value==='number'&&key!=='hitRate')assert.ok(Number.isSafeInteger(value),`${key} overflowed`);
    }
    assert.deepEqual(safeTaskUsage(result),result);
  }
  const result=aggregateTaskUsage(records(parent,generator('root',{inputTokens:Number.MAX_SAFE_INTEGER,outputTokens:0})),
    [records(child,generator('child',{inputTokens:1,outputTokens:0}))],opts);
  assert.equal(result.ownTokens,Number.MAX_SAFE_INTEGER);assert.equal(result.subagentTokens,1);assert.equal(result.tokens.totalTokens,null);
  assert.equal(result.cache.hitRate,null);assert.deepEqual(safeTaskUsage(result),result);
});

test('missing or loading descendants cannot advertise a complete task',()=>{
  const own=records(parent,generator('root',{inputTokens:10,outputTokens:20}));
  for(const state of ['ready','partial','loading','unavailable']){
    const result=aggregateTaskUsage(own,[],{subagents:1,loadedSubagents:0,state});
    assert.equal(result.tokens.totalTokens,30);assert.equal(result.complete,false);assert.equal(result.tokens.complete,false);assert.equal(result.cache.complete,false);
    assert.equal(result.state,state==='loading'?'loading':'partial');assert.deepEqual(safeTaskUsage(result),result);
  }
});

test('safe summaries whitelist only aggregates, reject malformed counts and downgrade false completeness',()=>{
  const value=aggregateTaskUsage(records(parent,generator('root',{inputTokens:10,outputTokens:20})),[],{subagents:0,loadedSubagents:0,state:'ready'});
  const privateValue={...value,records:[{id:'PRIVATE ID'}],conversationId:parent,prompt:'PRIVATE PROMPT',tokens:{...value.tokens,prompt:'PRIVATE'},cache:{...value.cache,provider:'PRIVATE'}};
  const safe=safeTaskUsage(privateValue);assert.deepEqual(safe,value);assert.equal(JSON.stringify(safe).includes('PRIVATE'),false);
  for(const n of [1.5,-1,Number.MAX_SAFE_INTEGER+1,'1',true]){
    assert.equal(safeTaskUsage({...value,subagents:n}),null);
    assert.equal(safeTaskUsage({...value,tokens:{...value.tokens,measuredRequests:n}}),null);
  }
  assert.equal(safeTaskUsage({...value,loadedSubagents:1}),null);
  assert.equal(safeTaskUsage({...value,state:'secret'}),null);
  assert.equal(safeTaskUsage({...value,tokens:{...value.tokens,totalTokens:9999}}),null);
  assert.equal(safeTaskUsage({...value,cache:{...value.cache,hitRate:.7}}),null);
  assert.equal(safeTaskUsage({...value,ownTokens:31}),null);
  assert.equal(safeTaskUsage({...value,tokens:{...value.tokens,outputRequests:4}}),null);
  assert.equal(safeTaskUsage({...value,state:'partial'}).complete,false);
  assert.equal(safeTaskUsage({...value,state:'unavailable'}).state,'partial');
  assert.equal(safeTaskUsage(null),null);assert.equal(safeTaskUsage([]),null);assert.equal(safeTaskUsage({}),null);
});
