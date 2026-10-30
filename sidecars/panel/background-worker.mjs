// Isolated, disk-backed acquisition. Credentials exist only in workerData.
import {parentPort,workerData} from 'node:worker_threads';
import {readFile,writeFile,rename,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {AntigravityClient} from './client.mjs';
import {collectionFailure} from './collection-state.mjs';
import {normalizeConversationId} from './delegation.mjs';
const {endpoint,id,directory,cancel,summary:initialSummary}=workerData;
const flag=new Int32Array(cancel),current=()=>Atomics.load(flag,0)===0;
const assertCurrent=()=>{if(!current())throw Object.assign(Error('Cancelled'),{code:'CANCELLED'});};
const client=new AntigravityClient();client.discover=async()=>{assertCurrent();return endpoint;};
const mark=s=>JSON.stringify([s?.stepCount??null,s?.lastModifiedTime??null,s?.status??null,s?.lastUserInputStepIndex??null]);
const file=join(directory,'statistics.sqlite'),checkpoint=join(directory,'checkpoint.json');
let store,lastProgress=0,phase='queued',steps=0,generators=0;
function progress(force=false){if(force||Date.now()-lastProgress>500){lastProgress=Date.now();parentPort.postMessage({type:'progress',stage:phase,processedSteps:steps,processedGenerators:generators});}}
async function summary(){
 const result=await client.call('GetAllCascadeTrajectories',{excludeSubtrajectories:false},false);
 const all=result.trajectorySummaries||{},parent=normalizeConversationId(id),children=new Set(),digest=Buffer.alloc(32);let s=null,count=0;
 for(const [key,value] of Object.entries(all)){
  assertCurrent();const child=normalizeConversationId(key);if(!child)continue;
  if(child===parent){s=value;continue;}
  const info=value?.trajectoryMetadata;
  if(normalizeConversationId(info?.parentConversationId)!==parent&&normalizeConversationId(info?.rootConversationId)!==parent)continue;
  // This order-independent, bounded fingerprint detects association changes
  // without retaining every summary or exposing titles/metadata to the UI.
  const hash=createHash('sha256').update(child).digest();for(let i=0;i<digest.length;i++)digest[i]^=hash[i];count++;
  if(children.size<129)children.add(child);
 }
 if(!s)throw Error('Conversation unavailable');
 return {conversation:s,children:[...children].slice(0,128),truncated:children.size>128,relations:count+':'+digest.toString('hex')};
}
async function save(cp){store.flush();await writeFile(checkpoint+'.tmp',JSON.stringify(cp),{mode:0o600});assertCurrent();await rename(checkpoint+'.tmp',checkpoint);}
try{
 const {DiskStatistics}=await import('./disk-statistics.mjs');
 store=new DiskStatistics({file,conversationId:id,maxBytes:256*1024*1024,isCurrent:current,onProgress:()=>progress(),yieldEvery:128});
 let cp=null;try{if((await stat(checkpoint)).size<16384)cp=JSON.parse(await readFile(checkpoint,'utf8'));}catch{}
 let view=await summary(),s=view.conversation;
 if(!cp||cp.mark!==mark(s)||cp.relations!==view.relations||cp.schema!==1){store.truncate('steps',0);store.truncate('generators',0);cp={schema:1,mark:mark(s),relations:view.relations,steps:0,generators:0,phase:'steps'};await save(cp);}
 steps=cp.steps;generators=cp.generators;
 let failures=0,revisions=0,pages=0;const fingerprints=new Set();
 for(;;){
  assertCurrent();if(++pages>4096)throw Error('Background pagination limit');
  phase=cp.phase;progress(true);
  if(phase==='steps'||phase==='generators'){
   const isStep=phase==='steps',offset=isStep?cp.steps:cp.generators;
   store.truncate(phase,offset);store.flush();
   let count=0,identified=true;const hash=createHash('sha256');
   try{
    await client.streamTrajectoryPage(isStep?'GetCascadeTrajectorySteps':'GetCascadeTrajectoryGeneratorMetadata',
     isStep?{cascadeId:id,stepOffset:offset,trajectoryVerbosity:3}:{cascadeId:id,generatorMetadataOffset:offset,includeMessages:false},
     {wallMs:300000,isCurrent:current,onRecord:async(kind,index,value)=>{
       assertCurrent();if(kind!==(isStep?'steps':'generatorMetadata')||index!==count)throw Error('Invalid streamed record order');
       const stable=isStep?(value.id||value.stepId||value.metadata?.id):(value.id||value.generatorId||value.chatModel?.usage?.responseId||value.chatModel?.usage?.messageId);if(stable){const text=JSON.stringify(stable);hash.update(Buffer.byteLength(text)+':'+text);}else identified=false;if(isStep)store.addStep(offset+index,value);else store.addGenerator(offset+index,value);
       count++;if(isStep)steps=offset+count;else generators=offset+count;progress();
       if(count%128===0)await sleep(2);
     }});
    assertCurrent();failures=0;
   }catch(error){
    store.truncate(phase,offset);store.flush();steps=cp.steps;generators=cp.generators;
    if(!current()||collectionFailure(error)||++failures>3)throw error;
    await sleep(Math.min(30000,1000*2**failures));continue;
   }
   const fingerprint=phase+':'+hash.digest('hex');
   // Pages with stable IDs must not repeat at any later offset. The global
   // page limit bounds this set; distinct phases have independent namespaces.
   if(count&&identified){if(fingerprints.has(fingerprint))throw Error('Repeated background page');fingerprints.add(fingerprint);}
   if(isStep){
    const expected=Number(s.stepCount);if(Number.isSafeInteger(expected)&&expected>=0&&steps>expected)throw Error('Conversation changed during acquisition');
    if(!count&&Number.isSafeInteger(expected)&&expected>steps)throw Error('Incomplete background steps');
    cp.steps=steps;if(!count||Number.isSafeInteger(expected)&&steps===expected)cp.phase='generators';
   }else{cp.generators=generators;if(!count)cp.phase='reducing';}
   await save(cp);await sleep(100);continue;
  }
  // Never publish a mixture of old and changing host revisions.
  const latest=await summary();
  if(mark(latest.conversation)!==cp.mark||latest.relations!==cp.relations){
   if(++revisions>3)throw Error('Conversation keeps changing');
   view=latest;s=view.conversation;store.truncate('steps',0);store.truncate('generators',0);steps=generators=0;fingerprints.clear();
   cp={schema:1,mark:mark(s),relations:view.relations,steps:0,generators:0,phase:'steps'};await save(cp);await sleep(1000);continue;
  }
  phase='reducing';progress(true);
  const result=await store.finish({status:s.status,numTotalSteps:steps,numTotalGeneratorMetadata:generators});
  assertCurrent();const final=await summary();if(mark(final.conversation)!==cp.mark||final.relations!==cp.relations)throw Error('Conversation changed during reduction');
  const combined=new Set([...result.delegatedIds,...final.children]);
  // The reducer itself retains at most 128 step links, so hitting that exact
  // bound is conservatively partial even when no overflow can be observed.
  result.delegatedTruncated=final.truncated||result.delegatedIds.length>=128||combined.size>128;
  result.delegatedIds=[...combined].slice(0,128);
  store.close();store=null;phase='publishing';progress(true);
  parentPort.postMessage({type:'complete',result,revision:cp.mark,relations:final.relations});break;
 }
}catch(error){parentPort.postMessage({type:'failed',collection:collectionFailure(error),code:!current()?'cancelled':error.code==='ERR_UNKNOWN_BUILTIN_MODULE'?'unsupported-runtime':error.code==='SQLITE_FULL'||error.errcode===13||error.code==='ENOSPC'?'disk-budget':'background-unavailable'});}
finally{try{store?.close();}catch{}parentPort.close();}
