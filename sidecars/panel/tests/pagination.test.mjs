import test from 'node:test';
import assert from 'node:assert/strict';
import { AntigravityClient } from '../client.mjs';

test('long conversations fetch every page with the distinct request schemas',async()=>{
  const client=new AntigravityClient();
  const calls=[];
  client.call=async(method,body)=>{
    calls.push([method,body]);
    if(method==='GetCascadeTrajectory')return {trajectory:{steps:[{i:0}],generatorMetadata:[{i:0}]},numTotalSteps:3,numTotalGeneratorMetadata:3};
    if(method==='GetCascadeTrajectorySteps'){
      assert.equal(body.trajectoryVerbosity,3);return {steps:[{i:body.stepOffset}]};
    }
    assert.equal(method,'GetCascadeTrajectoryGeneratorMetadata');
    assert.equal(Object.hasOwn(body,'trajectoryVerbosity'),false);
    return {generatorMetadata:[{i:body.generatorMetadataOffset}]};
  };
  const response=await client.trajectory('test-id');
  assert.deepEqual(response.trajectory.steps.map(s=>s.i),[0,1,2]);
  assert.deepEqual(response.trajectory.generatorMetadata.map(s=>s.i),[0,1,2]);
  assert.equal(calls.length,5);
});
test('an incomplete page fails explicitly rather than presenting a partial session rate',async()=>{
  const client=new AntigravityClient();
  client.call=async(method)=>method==='GetCascadeTrajectory'?{trajectory:{steps:[],generatorMetadata:[{}]},numTotalSteps:2,numTotalGeneratorMetadata:1}:{steps:[]};
  await assert.rejects(client.trajectory('test-id'),/分页/);
});
