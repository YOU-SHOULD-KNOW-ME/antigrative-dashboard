import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {TrajectoryJson} from '../trajectory-json.mjs';
import {AntigravityClient} from '../client.mjs';
const steps=[{type:'USER_INPUT',userInput:{text:'PRIVATE'}},{type:'PLANNER_RESPONSE',plannerResponse:{response:'PRIVATE',toolCalls:[{text:'PRIVATE'}]}}];
function parse(text,width=1){const rows=[];const parser=new TrajectoryJson({onRecord:(...row)=>rows.push(row)});for(let i=0;i<text.length;i+=width)parser.write(text.slice(i,i+width));return {rows,result:parser.end()};}
test('stream records match ordinary projection at all chunk boundaries and do not retain arrays',()=>{
 const raw=JSON.stringify({steps,generatorMetadata:[{stepIndices:[1],chatModel:{usage:{outputTokens:12},messages:['PRIVATE']}}]});
 const ordinary=new TrajectoryJson();ordinary.write(raw);const expected=ordinary.end();
 for(const size of [1,2,7,8192]){const {rows,result}=parse(raw,size);assert.deepEqual(rows.filter(r=>r[0]==='steps').map(r=>r[2]),expected.steps);assert.deepEqual(rows.filter(r=>r[0]==='generatorMetadata').map(r=>r[2]),expected.generatorMetadata);assert.deepEqual(result.recordCounts,{steps:2,generatorMetadata:1});assert.deepEqual(result.steps,[]);assert.ok(!JSON.stringify(rows).includes('PRIVATE'));}
});
test('streaming rejects duplicate streamed arrays, aliases, wrong record types and malformed discarded data',()=>{
 for(const text of ['{"steps":[],"steps":[]}','{"generatorMetadata":[],"generatorMetadatas":[]}','{"steps":[null]}','{"steps":[[]]}','{"steps":[{}],"ignored":[1,]}'])assert.throws(()=>parse(text));
 const value=parse('{"ignored":{"steps":[{"type":"FAKE"}]},"steps":[]}');assert.deepEqual(value.rows,[]);
});
test('record emission permits pages above the retained budget while bounding a single record',()=>{
 const parser=new TrajectoryJson({maxRetainedBytes:2048,onRecord:()=>{}});parser.write('{"steps":[');
 for(let i=0;i<40000;i++)parser.write((i?',':'')+JSON.stringify({type:'X'.repeat(250)}));
 parser.write(']}');assert.equal(parser.end().recordCounts.steps,40000);assert.ok(parser.retained<2048);
 assert.throws(()=>parse(JSON.stringify({steps:[{type:'X'.repeat(17000)}]})),/上限/);
});
async function httpFixture(t,body){
 const requests=[];const server=createServer(async(req,res)=>{let input='';for await(const c of req)input+=c;requests.push(JSON.parse(input));res.setHeader('Content-Type','application/json');res.end(body);});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});const client=new AntigravityClient();client.discover=async()=>({pid:1,port:server.address().port,csrf:'fake'});return {client,requests};
}
test('HTTP stream awaits each consumer, forces no messages, and emits page counts',async t=>{
 const records=Array.from({length:500},(_,i)=>({chatModel:{usage:{responseId:'r'+i,outputTokens:i},messages:['PRIVATE']}}));
 const {client,requests}=await httpFixture(t,JSON.stringify({generatorMetadata:records}));let active=0,peak=0,count=0;
 const result=await client.streamTrajectoryPage('GetCascadeTrajectoryGeneratorMetadata',{cascadeId:'test',includeMessages:true},{onRecord:async(kind,index,value)=>{active++;peak=Math.max(peak,active);assert.equal(index,count++);assert.equal(kind,'generatorMetadata');assert.equal(value.chatModel.messages,undefined);await new Promise(resolve=>setImmediate(resolve));active--;}});
 assert.equal(peak,1);assert.equal(count,500);assert.equal(result.recordCounts.generatorMetadata,500);assert.equal(requests[0].includeMessages,false);
});
test('cancelled HTTP stream stops before another record and rejects partial result',async t=>{
 const {client}=await httpFixture(t,JSON.stringify({steps:Array.from({length:1000},()=>({type:'RUN_COMMAND'}))}));let current=true,count=0;
 await assert.rejects(client.streamTrajectoryPage('GetCascadeTrajectorySteps',{}, {isCurrent:()=>current,onRecord:async()=>{count++;current=false;}}),/cancelled/);assert.equal(count,1);
});
test('trailing malformed JSON rejects an otherwise consumed page; callers must stage until completion',async t=>{
 const {client}=await httpFixture(t,'{"steps":[{"type":"USER_INPUT"}],"ignored":[1,]}');let count=0;
 await assert.rejects(client.streamTrajectoryPage('GetCascadeTrajectorySteps',{}, {onRecord:async()=>{count++;}}));assert.equal(count,1);
});

test('scope cancellation rejects even when a record consumer remains pending',async t=>{
 const {client}=await httpFixture(t,'{"steps":[{"type":"USER_INPUT"}]}');let current=true,entered=false;
 const promise=client.streamTrajectoryPage('GetCascadeTrajectorySteps',{}, {isCurrent:()=>current,onRecord:()=>{entered=true;setImmediate(()=>{current=false;});return new Promise(()=>{});}});
 await assert.rejects(promise,/cancelled/);assert.equal(entered,true);
});

test('background stream deadline is configurable only within 30 seconds to five minutes',async t=>{
 const {client}=await httpFixture(t,'{"steps":[]}');
 for(const wallMs of [0,29999,300001,Infinity,NaN,'300000',30000.5])await assert.rejects(client.streamTrajectoryPage('GetCascadeTrajectorySteps',{}, {wallMs,onRecord:()=>{}}),/deadline/);
 for(const wallMs of [undefined,30000,300000]){const result=await client.streamTrajectoryPage('GetCascadeTrajectorySteps',{}, {wallMs,onRecord:()=>{}});assert.equal(result.recordCounts.steps,0);}
});

test('explicit custom projection streams only root records and drops arbitrary private fields',()=>{
 const rows=[];const parser=new TrajectoryJson({projection:{schema:'scalar',records:{'*':{id:'scalar',at:'scalar',output:'scalar'}}},recordKeys:['records'],onRecord:(kind,index,value)=>rows.push({kind,index,value})});
 parser.write('{"schema":1,"ignored":{"records":[{"id":"bad"}]},"records":[{"id":"ok","output":3,"private":"SECRET"}]}');
 const result=parser.end();assert.equal(result.schema,1);assert.deepEqual(result.records,[]);assert.equal(result.recordCounts.records,1);assert.deepEqual(rows,[{kind:'records',index:0,value:{id:'ok',output:3}}]);
});
