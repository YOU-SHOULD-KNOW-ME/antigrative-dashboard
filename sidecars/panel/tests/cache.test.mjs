import test from 'node:test';
import assert from 'node:assert/strict';
import {requestCacheMetrics,trajectoryMetrics} from '../metrics.mjs';
const request=(id,usage)=>({chatModel:{usage:{messageId:id,...usage},streamingDuration:'2s'}});

test('DSH-style totals include input and output while hit rate only uses input',()=>{
  const usage={apiProvider:'API_PROVIDER_GOOGLE_GEMINI',inputTokens:'13461223',cacheReadTokens:'614457984',outputTokens:'725982'};
  const result=trajectoryMetrics({trajectory:{generatorMetadata:[request('a',usage)]}}).cache;
  assert.equal(result.totalTokens,628645189);
  assert.equal(result.uncachedTokens,13461223);
  assert.equal(result.cachedTokens,614457984);
  assert.equal(result.outputTokens,725982);
  assert.equal(Math.round(result.hitRate*100),98);
});
test('the local Antigravity interface separates cache reads from uncached input for Gemini/OpenAI',()=>{
  for(const apiProvider of ['API_PROVIDER_GOOGLE_GEMINI','API_PROVIDER_OPENAI']){
    const result=requestCacheMetrics({apiProvider,inputTokens:'250',cacheReadTokens:'750'});
    assert.deepEqual(result,{inputTokens:1000,cachedTokens:750,cacheWriteTokens:0,uncachedTokens:250});
  }
});
test('Anthropic uncached input excludes cache reads and writes; writes are not hits',()=>{
  const result=requestCacheMetrics({apiProvider:'API_PROVIDER_ANTHROPIC',inputTokens:'100',cacheReadTokens:'500',cacheWriteTokens:'400'});
  assert.deepEqual(result,{inputTokens:1000,cachedTokens:500,cacheWriteTokens:400,uncachedTokens:100});
});
test('session cache rate is token-weighted, requests are deduplicated and unsupported data is flagged',()=>{
  const a=request('a',{apiProvider:'API_PROVIDER_OPENAI',inputTokens:'100',cacheReadTokens:'900',outputTokens:'10'});
  const b=request('b',{apiProvider:'API_PROVIDER_GOOGLE_GEMINI',inputTokens:'8900',cacheReadTokens:'100',outputTokens:'20'});
  const unknown=request('c',{inputTokens:'50',cacheReadTokens:'40'});
  const cache=trajectoryMetrics({trajectory:{generatorMetadata:[a,a,b,unknown]}}).cache;
  assert.equal(cache.hitRate,.1);assert.equal(cache.totalTokens,10030);
  assert.equal(cache.measuredRequests,2);assert.equal(cache.missingRequests,1);assert.equal(cache.complete,false);
});
test('protobuf-omitted zero cache is zero; absent input, invalid provider and unsafe counts stay unavailable',()=>{
  const cache=trajectoryMetrics({trajectory:{generatorMetadata:[request('a',{apiProvider:'API_PROVIDER_OPENAI',inputTokens:'100',outputTokens:'5'})]}}).cache;
  assert.equal(cache.hitRate,0);assert.equal(cache.totalTokens,105);
  assert.equal(requestCacheMetrics({apiProvider:'API_PROVIDER_OPENAI',cacheReadTokens:'10'}),null);
  assert.equal(requestCacheMetrics({apiProvider:'UNKNOWN',inputTokens:'100'}),null);
  assert.equal(requestCacheMetrics({apiProvider:'API_PROVIDER_OPENAI',inputTokens:String(Number.MAX_SAFE_INTEGER),cacheReadTokens:'1'}),null);
  assert.equal(trajectoryMetrics({trajectory:{}}).cache.hitRate,null);
});
