// Background task accounting. Every source remains an independent conversation;
// only numeric request projections are combined, never timing or context windows.
import {setImmediate as yieldLoop} from 'node:timers/promises';
import {delegatedIds,normalizeConversationId} from './delegation.mjs';
import {taskRecords,mergeTaskRecords,aggregateTaskUsage,safeTaskUsage} from './task-usage.mjs';

export class DelegatedUsage {
  constructor(client,{onSource=async()=>{},onUpdate=async()=>{},owns=()=>true,now=Date.now,
    budgetBytes=8*1024*1024,maxAgents=128,maxEntries=4,refreshMs=5000}={}) {
    Object.assign(this,{client,onSource,onUpdate,owns,now,budgetBytes,maxAgents,maxEntries,refreshMs});
    // A Promise is truthy but is never proof of ownership. Callers must supply
    // the synchronous cached predicate, not the asynchronous marker verifier.
    this.owns=()=>owns()===true;
  }
  tasks=new Map();epoch=0;scope=null;running=null;bytes=0;disposed=false;
  reset(){this.epoch++;this.tasks.clear();this.bytes=0;this.scope=null;}
  dispose(){this.disposed=true;this.reset();}
  links(id,raw){return delegatedIds(id,raw,this.client.reader?.summaries||{});}
  request(scope,id,raw,{saved=null,knownIds=[],force=false,isCurrent=()=>true}={}) {
    if(this.disposed||!scope||!this.owns())return safeTaskUsage(saved);
    id=normalizeConversationId(id);if(!id)return null;
    if(scope!==this.scope){this.reset();this.scope=scope;}
    const ids=[...new Set([...this.links(id,raw),...knownIds.map(normalizeConversationId).filter(Boolean)])].filter(child=>child!==id);
    let task=this.tasks.get(id);
    if(!ids.length&&!task)return safeTaskUsage(saved);
    if(!task){
      while(this.tasks.size>=this.maxEntries){const oldest=this.tasks.keys().next().value;this.bytes-=this.tasks.get(oldest).bytes;this.tasks.delete(oldest);}
      task={id,scope,children:new Set(),sources:new Map(),failures:new Map(),staleSources:new Set(),attempted:new Map(),order:0,bytes:0,lastAt:-Infinity,requested:false,force:false,result:safeTaskUsage(saved),truncated:false};
      this.tasks.set(id,task);
    }
    this.tasks.delete(id);this.tasks.set(id,task);
    task.isCurrent=isCurrent;
    const oldSize=task.children.size;
    this.addChildren(task,ids);
    if(task.raw?.deref()!==raw){
      task.raw=new WeakRef(raw);
      const rows=taskRecords(raw,id);
      if(!this.put(task,id,rows))task.truncated=true;
      task.result=this.result(task,task.lastAt===-Infinity?'loading':task.result?.state||'loading');
    }
    if(force||!task.collecting&&(oldSize!==task.children.size||this.now()-task.lastAt>=this.refreshMs)){task.requested=true;task.force||=force;this.schedule();}
    return task.result||this.result(task,'loading');
  }
  addChildren(task,ids){
    for(const id of ids){
      if(id===task.id||task.children.has(id))continue;
      if(task.children.size>=this.maxAgents){task.truncated=true;break;}
      task.children.add(id);
    }
  }
  put(task,id,rows){
    const merged=mergeTaskRecords(task.sources.get(id)?.rows||[],rows);rows=merged.rows;
    if(merged.restored)task.staleSources.add(id);else task.staleSources.delete(id);
    const size=Buffer.byteLength(JSON.stringify(rows)),old=task.sources.get(id)?.bytes||0;
    if(this.bytes-old+size>this.budgetBytes){
      for(const [key,other] of this.tasks){if(other===task)continue;this.bytes-=other.bytes;this.tasks.delete(key);if(this.bytes-old+size<=this.budgetBytes)break;}
    }
    if(this.bytes-old+size>this.budgetBytes)return false;
    this.bytes+=size-old;task.bytes+=size-old;task.sources.set(id,{rows,bytes:size});return true;
  }
  result(task,state){
    const childRows=[...task.children].filter(id=>task.sources.has(id)).map(id=>task.sources.get(id).rows);
    const result=aggregateTaskUsage(task.sources.get(task.id)?.rows||[],childRows,{
      subagents:task.children.size,loadedSubagents:childRows.length,state:task.truncated||task.staleSources.size?'partial':state,
    });
    // On restart, numeric saved task totals remain visible until the first pass
    // can account for every known child. They are never treated as fresh/complete.
    const savedTotal=task.result?.tokens?.totalTokens;
    if(Number.isSafeInteger(savedTotal)&&(result.tokens?.totalTokens===null||savedTotal>result.tokens?.totalTokens))
      return {...task.result,tokens:{...task.result.tokens,complete:false},cache:{...task.result.cache,complete:false},subagents:Math.max(task.children.size,task.result.subagents),state:state==='loading'?'loading':'partial',complete:false};
    return result;
  }
  schedule(){
    if(this.running||this.disposed)return;
    this.running=Promise.resolve().then(async()=>{
      for(;;){
        const task=[...this.tasks.values()].find(t=>t.requested);if(!task||this.disposed||!this.owns())break;
        task.requested=false;const force=task.force;task.force=false;
        const epoch=this.epoch,current=()=>!this.disposed&&this.owns()&&epoch===this.epoch&&task.scope===this.scope&&this.tasks.get(task.id)===task&&task.isCurrent();
        task.collecting=true;try{await this.collect(task,force,current);}finally{task.collecting=false;}
      }
    }).finally(()=>{this.running=null;});
  }
  async collect(task,force,current){
    const deadline=this.now()+30000;let failed=false;
    try{
      // Resume oldest/unread sources first after a bounded pass. Starting from
      // the same first child every time can starve late children in a large task.
      const queue=[...task.children].sort((a,b)=>(task.attempted.get(a)||0)-(task.attempted.get(b)||0)),queued=new Set(queue);
      for(const id of queue){
        if(!current())return;
        if(this.now()>deadline){failed=true;break;}
        const failure=task.failures.get(id);
        if(!force&&failure?.retryAt>this.now()){failed=true;continue;}
        task.attempted.set(id,++task.order);
        try{
          const summaries=this.client.reader?.summaries||{};
          const summary=summaries[id]||Object.entries(summaries).find(([key])=>key.toLowerCase()===id)?.[1]||{};
          const raw=await this.client.trajectory(id,{summary,force,isCurrent:current});
          if(!current())return;
          if(!raw?.trajectory||!Array.isArray(raw.trajectory.generatorMetadata)||
            !raw.trajectory.generatorMetadata.length&&!raw.trajectory.steps?.length&&!Object.keys(summary).length)throw Error('Delegated statistics unavailable');
          this.addChildren(task,this.links(id,raw));
          for(const child of task.children)if(!queued.has(child)){queued.add(child);queue.push(child);}
          if(!this.put(task,id,taskRecords(raw,id))){task.truncated=true;failed=true;break;}
          await this.onSource(task.scope,id,raw);
          if(!current())return;
          task.failures.delete(id);
        }catch{
          if(!current())return;failed=true;
          const failures=(failure?.failures||0)+1;
          task.failures.set(id,{failures,retryAt:this.now()+Math.min(300000,5000*2**Math.min(failures-1,6))});
        }
        await yieldLoop();
      }
      if(!current())return;
      task.lastAt=this.now();task.result=this.result(task,failed?'partial':'ready');
      await this.onUpdate(task.scope,task.id,task.result,[...task.children]);
    }catch{if(current()){task.lastAt=this.now();task.result=this.result(task,'partial');}}
  }
  async idle(){while(this.running)await this.running;}
}
