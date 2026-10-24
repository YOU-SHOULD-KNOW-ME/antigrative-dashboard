import test from 'node:test';
import assert from 'node:assert/strict';
import {TrajectoryJson} from '../trajectory-json.mjs';
import {conversationId,normalizeConversationId,delegatedIds} from '../delegation.mjs';
const parent='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',child='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const nested='cccccccc-cccc-cccc-cccc-cccccccccccc',other='dddddddd-dddd-dddd-dddd-dddddddddddd';
const project=(value,size=1,options)=>{
 const text=typeof value==='string'?value:JSON.stringify(value),parser=new TrajectoryJson(options);
 for(let i=0;i<text.length;i+=size)parser.write(text.slice(i,i+size));
 return parser.end();
};

test('conversation identities require exact GUID shape and normalize only case',()=>{
 assert.equal(normalizeConversationId(parent.toUpperCase()),parent);assert.equal(conversationId.test(parent),true);
 for(const value of [null,undefined,0,true,{},[],parent+' ',parent.slice(1),'a'.repeat(36),'-'.repeat(36),'PRIVATE '+parent])assert.equal(normalizeConversationId(value),null);
});

test('modern and legacy invocation projections retain child IDs without prompts or result bodies',()=>{
 const input={steps:[{type:'CORTEX_STEP_TYPE_INVOKE_SUBAGENT',invokeSubagent:{conversationId:child.toUpperCase(),prompt:'PRIVATE legacy prompt',subagentName:'PRIVATE name',
  subagents:[{initialPrompt:'PRIVATE task',typeName:'PRIVATE name'}],results:[{conversationId:nested.toUpperCase(),logAbsoluteUri:'PRIVATE path',workspaceUris:['PRIVATE workspace'],result:'PRIVATE answer'}]}}]};
 const expected={steps:[{type:'CORTEX_STEP_TYPE_INVOKE_SUBAGENT',invokeSubagent:{conversationId:child,results:[{conversationId:nested}]}}]};
 assert.deepEqual(project(input),expected);assert.deepEqual(project(input,79),expected);
 assert.deepEqual(project({trajectory:input}).trajectory,expected);assert.ok(!JSON.stringify(project(input)).includes('PRIVATE'));
});

test('summary map permits only GUID keys and the explicit title, revision and relation fields',()=>{
 const value={summary:'Existing list title',stepCount:12,lastModifiedTime:'2026-10-24T08:00:00Z',status:'CASCADE_RUN_STATUS_IDLE',lastUserInputStepIndex:3,
  hasActiveChildren:true,hasRunningSubagents:true,notFullyIdle:true,
  trajectoryMetadata:{parentConversationId:parent.toUpperCase(),rootConversationId:parent,nestingDepth:1,subagentSpec:{initialPrompt:'PRIVATE task'},workspaceUris:['PRIVATE path']},
  waitingSteps:[{text:'PRIVATE message'}],latestNotifyUserStep:{response:'PRIVATE answer'},latestTaskBoundaryStep:{summary:'PRIVATE step'},
  forkParentConversationId:other,battleModeInfo:{childrenConversationIds:[other]},annotations:{title:'PRIVATE annotation'}};
 const expected={summary:value.summary,stepCount:12,lastModifiedTime:value.lastModifiedTime,status:value.status,lastUserInputStepIndex:3,
  hasActiveChildren:true,hasRunningSubagents:true,notFullyIdle:true,trajectoryMetadata:{parentConversationId:parent,rootConversationId:parent,nestingDepth:1}};
 const input={trajectorySummaries:{[child.toUpperCase()]:value,invalid:{summary:'PRIVATE invalid'},constructor:{summary:'PRIVATE constructor'},['__proto__']:{summary:'PRIVATE prototype'}}};
 assert.deepEqual(project(input),{trajectorySummaries:{[child]:expected}});
 assert.ok(!JSON.stringify(project(input)).includes('PRIVATE'));assert.equal(Object.getPrototypeOf(project(input).trajectorySummaries),Object.prototype);
});

test('invalid IDs and malformed hierarchy types cannot retain arbitrary text',()=>{
 const values=['PRIVATE',parent+' ',null,0,true,{conversationId:child},[child],'x'.repeat(100000)];
 for(const value of values){
  const result=project({steps:[{invokeSubagent:{conversationId:value,results:[{conversationId:value}]}}],trajectorySummaries:{[child]:{trajectoryMetadata:{parentConversationId:value,rootConversationId:value}}}},1024);
  assert.deepEqual(result,{steps:[{invokeSubagent:{results:[{}]}}],trajectorySummaries:{[child]:{trajectoryMetadata:{}}}});
 }
 assert.deepEqual(project({steps:[{invokeSubagent:'PRIVATE'},{invokeSubagent:[]},{invokeSubagent:{results:'PRIVATE'}}],trajectorySummaries:{[child]:'PRIVATE',[nested]:{trajectoryMetadata:'PRIVATE'}}}),
  {steps:[{},{},{invokeSubagent:{}}],trajectorySummaries:{[nested]:{}}});
 assert.deepEqual(project({trajectorySummaries:[{summary:'PRIVATE'}]}),{});
});

test('summary dictionary support does not broaden wildcard projection for arbitrary objects',()=>{
 const options={projection:{root:{'*':{value:'scalar'}}}};
 assert.deepEqual(project({root:{[child]:{value:'PRIVATE'},anything:{value:'PRIVATE'}}},1,options),{root:{}});
 assert.deepEqual(project({root:[{value:'array projection'}]},1,options),{root:[{value:'array projection'}]});
});

test('large private metadata is skipped with the same retained statistics budget',()=>{
 const sample=text=>({trajectorySummaries:{[child]:{stepCount:1,trajectoryMetadata:{parentConversationId:parent,subagentSpec:{initialPrompt:text}},latestNotifyUserStep:{response:text}}},steps:[{invokeSubagent:{prompt:text,results:[{conversationId:child,result:text}]}}]});
 const retained=value=>{const parser=new TrajectoryJson();const text=JSON.stringify(value);for(let i=0;i<text.length;i+=4096)parser.write(text.slice(i,i+4096));return {value:parser.end(),bytes:parser.retained};};
 const small=retained(sample('PRIVATE')),large=retained(sample('PRIVATE'.repeat(300000)));
 assert.deepEqual(large,small);assert.ok(large.bytes<2048);
 assert.throws(()=>project(sample(''),1,{maxRetainedBytes:128}),/上限/);
});

test('malformed discarded summary values and excessive nesting still fail JSON validation',()=>{
 for(const raw of ['{"trajectorySummaries":{"invalid":{"private":"bad\\x"}}}',`{"trajectorySummaries":{"${child}":{"private":[1,]}}}`,`{"steps":[{"invokeSubagent":{"conversationId":"bad\\uZZZZ"}}]}`])assert.throws(()=>project(raw));
 assert.throws(()=>project('{"ignored":'+ '['.repeat(65)+'0'+']'.repeat(65)+'}'));
});

test('delegated IDs union real invocation, immediate-parent and root-subtree fields',()=>{
 const raw={trajectory:{steps:[{invokeSubagent:{conversationId:child.toUpperCase(),results:[{conversationId:child},{conversationId:nested}]}},{invokeSubagent:{results:[{conversationId:parent},{conversationId:'invalid'}]}}]}};
 const summaries={
  [child]:{trajectoryMetadata:{parentConversationId:parent.toUpperCase()}},
  [nested.toUpperCase()]:{trajectoryMetadata:{parentConversationId:child,rootConversationId:parent}},
  [other]:{trajectoryMetadata:{parentConversationId:parent}},
  [parent]:{trajectoryMetadata:{rootConversationId:parent}},
  invalid:{trajectoryMetadata:{parentConversationId:parent}},
 };
 const before=JSON.stringify({raw,summaries});assert.deepEqual(delegatedIds(parent.toUpperCase(),raw,summaries),[child,nested,other]);
 assert.equal(JSON.stringify({raw,summaries}),before);
 assert.deepEqual(delegatedIds(child,{},summaries),[nested]);
});

test('ordinary forks, unrelated roots and message text never imply delegation',()=>{
 const raw={steps:[{result:`conversationId=${child}`,metadata:{parentConversationId:parent},plannerResponse:{toolCalls:[{name:'invoke_subagent',arguments:JSON.stringify({conversationId:child})}]}}]};
 const summaries={
  [child]:{forkParentConversationId:parent,trajectoryMetadata:{parentConversationId:other,rootConversationId:other}},
  [nested]:{summary:parent,parentConversationId:parent,trajectoryMetadata:{forkParentConversationId:parent}},
 };
 assert.deepEqual(delegatedIds(parent,raw,summaries),[]);
});

test('discovery handles a direct step page and absent or malformed containers safely',()=>{
 assert.deepEqual(delegatedIds(parent,{steps:[{invokeSubagent:{conversationId:child}}]}),[child]);
 for(const id of [null,'invalid'])assert.deepEqual(delegatedIds(id,{steps:[{invokeSubagent:{conversationId:child}}]}),[]);
 for(const raw of [null,{}, {steps:{}}, {steps:[null,{invokeSubagent:child},{invokeSubagent:{results:{conversationId:child}}}]}])assert.deepEqual(delegatedIds(parent,raw,null),[]);
 assert.deepEqual(delegatedIds(parent,{},[{trajectoryMetadata:{parentConversationId:parent}}]),[]);
});
