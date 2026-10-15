// Statistics-only acquisition. Host schemas accept offsets, not page sizes.
// Cached immutable prefixes are local numeric/structural projections only.
const settled=s=>/IDLE|DONE|COMPLETED|CANCELLED|CANCELED|STOPPED|FAILED|ERROR/.test(String(s||''));
const unavailable=()=>new Error('后台已重新连接，请等待刷新');
export class TrajectoryReader {
 // Serialized statistics budget, not transcript/response size. Local resource
 // experiments cover 1K/8K/32K records; 8 MiB bounds retained objects well below
 // the 32K-record case (~100 MiB extra heap). See docs/LONG_CONVERSATIONS.md.
 constructor(client,{budgetBytes=8*1024*1024,idleRecheckMs=10000}={}){this.client=client;this.budgetBytes=budgetBytes;this.idleRecheckMs=idleRecheckMs;}
 entries=new Map();epoch=0;endpoint=null;summaries=null;summaryAt=-Infinity;summaryPending=null;cachedBytes=0;
 reset(){this.epoch++;this.entries.clear();this.summaries=null;this.summaryAt=-Infinity;this.summaryPending=null;this.cachedBytes=0;}
 trim(keep){for(const [key,e]of this.entries){if(this.cachedBytes<=this.budgetBytes)break;if(key===keep||e.pending)continue;this.cachedBytes-=e.bytes;this.entries.delete(key);}}
 async summary(id,provided,force){
  if(provided)return provided;
  if(force||!this.summaries||this.client.now()-this.summaryAt>=1800){
   if(!this.summaryPending){const epoch=this.epoch;
    const pending=this.client.call('GetAllCascadeTrajectories').then(r=>{
     if(epoch!==this.epoch)throw unavailable();this.summaries=r.trajectorySummaries||{};this.summaryAt=this.client.now();
    }).finally(()=>{if(this.summaryPending===pending)this.summaryPending=null;});this.summaryPending=pending;
   }
   await this.summaryPending;
  }
  const s=this.summaries[id];if(!s)throw new Error('会话暂时没有可用统计');return s;
 }
 async read(id,{summary:provided,force=false,isCurrent=()=>true}={}){
  if(!isCurrent())throw unavailable();
  const endpoint=await this.client.discover();
  if(!this.endpoint||['pid','port','csrf'].some(k=>this.endpoint[k]!==endpoint[k])){this.reset();this.endpoint=endpoint;}
  let entry=this.entries.get(id);if(entry?.pending)return entry.pending;
  entry||={data:null,bytes:0};this.entries.set(id,entry);
  const epoch=this.epoch,current=()=>epoch===this.epoch&&this.entries.get(id)===entry&&isCurrent();
  const assertCurrent=()=>{if(!current())throw unavailable();};
  entry.pending=(async()=>{
   const summary=await this.summary(id,provided,force);assertCurrent();
   const count=summary.stepCount===undefined?null:Number(summary.stepCount);if(count!==null&&(!Number.isSafeInteger(count)||count<0))throw new Error('会话统计分页数量无效');
   const mark=JSON.stringify([count,summary.lastModifiedTime,summary.status,summary.lastUserInputStepIndex]);
   const old=entry.data;
   const same=old&&entry.mark===mark;
   if(!force&&same&&settled(summary.status)&&summary.lastModifiedTime&&this.client.now()-entry.verifiedAt<this.idleRecheckMs){this.entries.delete(id);this.entries.set(id,entry);return old;}
   // A changed settled history with no append may have been edited/compacted.
   const incremental=old&&!force&&count!==null&&count>=old.trajectory.steps.length&&(count>old.trajectory.steps.length||!settled(entry.summary?.status)||same);
   let stepOffset=0,metadataOffset=0;
   if(incremental){
    const lastInput=old.trajectory.steps.findLastIndex(s=>/USER_INPUT/.test(String(s?.type||'')));
    // The submitted input is immutable within a running turn. Start after it
    // so a large corpus is not downloaded on each generation-state refresh.
    stepOffset=lastInput<0?0:lastInput+1;
    const gs=old.trajectory.generatorMetadata;
    if(gs.length&&gs.every(g=>Array.isArray(g.stepIndices)&&g.stepIndices.length&&g.stepIndices.every(i=>Number.isInteger(i)&&i>=0))){
     metadataOffset=Math.max(0,gs.length-1);
     const associated=(gs.at(-1)?.stepIndices||[]).filter(i=>Number.isInteger(i)&&i>=0&&i<old.trajectory.steps.length&&!/USER_INPUT/.test(String(old.trajectory.steps[i]?.type||'')));
     stepOffset=associated.length?Math.min(...associated):old.trajectory.steps.length;
    }
    // Background tools can finish after newer model requests have started.
    // Refresh from the earliest unresolved timed tool as well as the last model.
    const pendingTool=old.trajectory.steps.findIndex(s=>s?.metadata&&(s.metadata.startedAt||s.metadata.createdAt)&&!s.metadata.completedAt&&
     (/SEARCH_WEB|BROWSE|RUN_COMMAND|COMMAND|READ|WRITE|EDIT|CODE_ACTION|TOOL|MCP|LIST|GREP|VIEW|FIND|TERMINAL/i.test(String(s.type||''))||s.metadata.toolCall));
    if(pendingTool>=0)stepOffset=Math.min(stepOffset,pendingTool);
    if(gs.some(g=>!Array.isArray(g.stepIndices)||!g.stepIndices.length))metadataOffset=0;
   }
   const steps=incremental?old.trajectory.steps.slice(0,stepOffset):[];
   const generators=incremental?old.trajectory.generatorMetadata.slice(0,metadataOffset):[];
   let bytes=Buffer.byteLength(JSON.stringify({steps,generatorMetadata:generators}));const deadline=this.client.now()+30000;
   const append=(target,items)=>{
    for(const item of items){bytes+=Buffer.byteLength(JSON.stringify(item))+1;if(bytes>this.budgetBytes)throw new Error('会话统计数据超过内存预算');target.push(item);}
   };
   const check=()=>{assertCurrent();if(this.client.now()>deadline)throw new Error('会话统计分页读取超时');};
   while(count===null||steps.length<count){
    check();const page=await this.client.call('GetCascadeTrajectorySteps',{cascadeId:id,stepOffset:steps.length,trajectoryVerbosity:3});check();
    const items=page.steps||[];if(!Array.isArray(items))throw new Error('会话统计分页格式无效');
    if(!items.length){if(count===null)break;throw new Error('完整会话统计分页暂不可用');}append(steps,items);
   }
   // Full step semantics retain the tool-only timing markers. Their text and
   // large tool payloads are discarded by the streaming projector.
   for(;;){
    check();const page=await this.client.call('GetCascadeTrajectoryGeneratorMetadata',{cascadeId:id,generatorMetadataOffset:generators.length,includeMessages:false});check();
    const items=page.generatorMetadata||page.generatorMetadatas||[];if(!Array.isArray(items))throw new Error('会话统计分页格式无效');
    if(!items.length)break;append(generators,items);
   }
   // A growing host may return newer metadata than the step-count snapshot.
   // Do not cache or persist a mixed/incomplete revision.
   if(generators.some(g=>(g.stepIndices||[]).some(i=>Number.isInteger(i)&&i>=steps.length)))throw new Error('会话仍在更新，请等待下一次刷新');
   const value={trajectory:{cascadeId:id,steps,generatorMetadata:generators},numTotalSteps:steps.length,numTotalGeneratorMetadata:generators.length,status:summary.status};
   assertCurrent();this.cachedBytes-=entry.bytes;entry.bytes=bytes;this.cachedBytes+=bytes;
   entry.data=value;entry.summary=summary;entry.mark=mark;entry.verifiedAt=this.client.now();this.entries.delete(id);this.entries.set(id,entry);
   this.trim(id);
   return value;
  })().finally(()=>{entry.pending=null;if(!entry.data&&current())this.entries.delete(id);if(current())this.trim(id);});
  return entry.pending;
 }
}
