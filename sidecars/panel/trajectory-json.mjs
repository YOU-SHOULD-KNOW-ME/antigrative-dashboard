// Incremental JSON projection for trajectory RPCs. Large prompts, tool results,
// images and executor payloads are validated and skipped, never buffered.
import {normalizeConversationId} from './delegation.mjs';
const scalar='scalar',nonempty='nonempty',presence='presence',calls='calls',guid='conversationId';
const usage=Object.fromEntries(['inputTokens','outputTokens','responseOutputTokens','thinkingOutputTokens','cacheReadTokens','cacheWriteTokens','apiProvider','responseId','messageId','model'].map(k=>[k,scalar]));
const duration={seconds:scalar,nanos:scalar};
const generators={'*':{stepIndices:{'*':scalar},chatModel:{usage,model:scalar,modelDisplayName:scalar,responseModel:scalar,
 streamingDuration:duration,timeToFirstToken:duration,retryInfos:{'*':{usage}},
 chatStartMetadata:{createdAt:scalar,contextWindowMetadata:{estimatedTokensUsed:scalar,maxContextTokens:scalar}}}}};
const subagentResult={conversationId:guid},subagentResults={'*':subagentResult};
const invokeSubagent={conversationId:guid,results:subagentResults};
const steps={'*':{type:scalar,metadata:{createdAt:scalar,startedAt:scalar,completedAt:scalar,toolCall:presence},
 plannerResponse:{response:nonempty,toolCalls:calls},invokeSubagent}};
const trajectoryMetadata={parentConversationId:guid,rootConversationId:guid,nestingDepth:scalar};
const summary={summary:scalar,stepCount:scalar,lastModifiedTime:scalar,status:scalar,lastUserInputStepIndex:scalar,
 hasActiveChildren:scalar,hasRunningSubagents:scalar,notFullyIdle:scalar,trajectoryMetadata};
// Only this dictionary may project dynamic object keys. Ordinary object schemas
// retain their exact-key allowlist; '*' remains an array selector everywhere else.
const summaryEntry=Symbol('summaryEntry'),summaries={[summaryEntry]:summary};
const objectOnly=new Set([subagentResult,invokeSubagent,trajectoryMetadata,summary,summaries]);
const arrayOnly=new Set([subagentResults]);
const structured=node=>objectOnly.has(node)||arrayOnly.has(node);
const stringAllowed=node=>node===scalar||typeof node==='object'&&!structured(node);
const schema={trajectory:{cascadeId:scalar,trajectoryId:scalar,steps,generatorMetadata:generators},steps,
 generatorMetadata:generators,generatorMetadatas:generators,status:scalar,numTotalSteps:scalar,numTotalGeneratorMetadata:scalar,
 trajectorySummaries:summaries};
const DROP=Symbol('discard');
export class TrajectoryJson {
 constructor({maxRetainedBytes=8*1024*1024,projection=schema}={}){this.maxRetainedBytes=maxRetainedBytes;this.projection=projection;}
 stack=[];token=null;result=undefined;done=false;retained=0;
 fail(){throw new Error('Antigravity 接口返回了无法解析的数据');}
 charge(n){if((this.retained+=n)>this.maxRetainedBytes)throw new Error('会话统计数据超过采集上限');}
 node(){
  const f=this.stack.at(-1);if(!f)return this.projection;
  if(f.node===summaries)return !f.array&&normalizeConversationId(f.key)?f.node[summaryEntry]:undefined;
  if(objectOnly.has(f.node)&&f.array||arrayOnly.has(f.node)&&!f.array)return undefined;
  const key=f.array?'*':f.key;return f.node&&typeof f.node==='object'&&Object.hasOwn(f.node,key)?f.node[key]:undefined;
 }
 valueAllowed(){const f=this.stack.at(-1);return f?['value','valueOrEnd'].includes(f.expect):!this.done;}
 finishValue(value){
  const f=this.stack.at(-1);
  if(!f){if(this.done)this.fail();this.result=value;this.done=true;return;}
  if(!['value','valueOrEnd'].includes(f.expect))this.fail();
  if(value!==DROP&&f.out){this.charge(32+(f.node===summaries?f.key.length*2:0));if(f.array)f.out.push(value);else Object.defineProperty(f.out,f.key,{value,writable:true,enumerable:true,configurable:true});}
  f.count++;f.expect='commaOrEnd';f.key=null;
 }
 punctuation(c){
  const f=this.stack.at(-1);
  if(c==='{'||c==='['){
   if(!this.valueAllowed()||this.stack.length>=64)this.fail();const node=this.node(),array=c==='[';
   const out=typeof node==='object'&&(!objectOnly.has(node)||!array)&&(!arrayOnly.has(node)||array)?(array?[]:{}):null;if(out)this.charge(64);
   this.stack.push({node,array,out,count:0,key:null,expect:array?'valueOrEnd':'keyOrEnd'});return;
  }
  if(c==='}'||c===']'){
   if(!f||f.array!==(c===']')||!['commaOrEnd',f.array?'valueOrEnd':'keyOrEnd'].includes(f.expect))this.fail();
   this.stack.pop();this.finishValue(f.node===presence?true:f.node===calls?(f.count?[{}]:[]):f.out||DROP);return;
  }
  if(c===':'){if(!f||f.array||f.expect!=='colon')this.fail();f.expect='value';return;}
  if(c===','){if(!f||f.expect!=='commaOrEnd')this.fail();f.expect=f.array?'value':'key';return;}
  this.fail();
 }
 startString(){
  const f=this.stack.at(-1),key=f&&!f.array&&['key','keyOrEnd'].includes(f.expect);
  if(!key&&!this.valueAllowed())this.fail();
  const node=key?null:this.node();
  this.token={kind:'string',key,node,buffer:'',overflow:false,escape:0,hex:'',any:false,ascii:0,other:0};
 }
 stringPart(text){
  const t=this.token;if(t.node===nonempty&&/\S/u.test(text)||t.node===presence&&text.length)t.any=true;
  if(t.node==='textEstimate'){
   const other=(text.match(/[^\x00-\x7f]/g)||[]).length;t.ascii+=text.length-other;t.other+=other;
   if(t.buffer.length<256)t.buffer+=text.slice(0,256-t.buffer.length);
  }
  // IDs are bounded independently of arbitrary prompt-sized strings. Invalid
  // values are still validated as JSON but never retained as relation metadata.
  if(t.node===guid){if(!t.overflow){if(t.buffer.length+text.length>36){t.buffer='';t.overflow=true;}else t.buffer+=text;}return;}
  if(t.key||stringAllowed(t.node)){
   if(t.overflow)return;t.buffer+=text;
   if(t.buffer.length>(t.key?1024:16384)){if(!t.key)throw new Error('会话统计字段超过采集上限');t.buffer='';t.overflow=true;}
  }
 }
 endString(){
  const t=this.token;this.token=null;
  if(t.key){const f=this.stack.at(-1);f.key=t.overflow?null:f.node===summaries?normalizeConversationId(t.buffer):t.buffer;f.expect='colon';return;}
  let value=DROP;
  if(t.node===nonempty)value=t.any?'1':'';
  else if(t.node==='textEstimate')value={tokens:Math.ceil(t.ascii/4+t.other/1.5),prefix:t.buffer};
  else if(t.node===presence)value=t.any;
  else if(t.node===guid){const id=!t.overflow&&normalizeConversationId(t.buffer);if(id){value=id;this.charge(value.length*2);}}
  else if(stringAllowed(t.node)){value=t.buffer;this.charge(value.length*2);}
  this.finishValue(value);
 }
 literalEnd(){
  const t=this.token;this.token=null;
  if(!/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)$/.test(t.buffer))this.fail();
  const value=JSON.parse(t.buffer);this.finishValue(t.node&&t.node!==guid&&!structured(t.node)?value:DROP);
 }
 write(text){
  let i=0;
  while(i<text.length){
   const t=this.token;
   if(t?.kind==='string'){
    if(t.escape===1){
     const c=text[i++];if(c==='u'){t.escape=2;t.hex='';continue;}
     const decoded={'"':'"','\\':'\\','/':'/','b':'\b','f':'\f','n':'\n','r':'\r','t':'\t'}[c];
     if(decoded===undefined)this.fail();this.stringPart(decoded);t.escape=0;continue;
    }
    if(t.escape===2){const c=text[i++];if(!/[0-9a-f]/i.test(c))this.fail();t.hex+=c;if(t.hex.length===4){this.stringPart(String.fromCharCode(parseInt(t.hex,16)));t.escape=0;}continue;}
    const special=/["\\\x00-\x1f]/g;special.lastIndex=i;const hit=special.exec(text),end=hit?hit.index:text.length;
    this.stringPart(text.slice(i,end));i=end;if(!hit)continue;
    const c=text[i++];if(c==='"')this.endString();else if(c==='\\')t.escape=1;else this.fail();continue;
   }
   if(t?.kind==='literal'){
    const start=i;while(i<text.length&&/[a-zA-Z0-9+\-.]/.test(text[i]))i++;
    t.buffer+=text.slice(start,i);if(t.buffer.length>1024)this.fail();if(i<text.length)this.literalEnd();continue;
   }
   const c=text[i++];if(/[ \r\n\t]/.test(c))continue;
   if(c==='"'){this.startString();continue;}
   if('{}[]:,'.includes(c)){this.punctuation(c);continue;}
   if(!this.valueAllowed()||!/[tfn\d-]/.test(c))this.fail();this.token={kind:'literal',node:this.node(),buffer:c};
  }
 }
 end(){if(this.token?.kind==='literal')this.literalEnd();if(this.token||this.stack.length||!this.done||!this.result||typeof this.result!=='object')this.fail();return this.result;}
}
