import {Worker} from 'node:worker_threads';
// Local usage ledger. Never stores prompts, credentials or raw request IDs.
import {readFile,writeFile,mkdir,rename,readdir,unlink,open,stat,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {tokenCount,requestCacheMetrics} from './metrics.mjs';
import {platformPaths} from '../../compat/platform.mjs';
import {discoverLocalConversations,conversationId} from './local-conversations.mjs';
import {setImmediate as yieldToLiveRequests} from 'node:timers/promises';
import {delegatedIds} from './delegation.mjs';
import {collectionFailure} from './collection-state.mjs';
const HASH=/^[a-f0-9]{64}$/,GUID=/^[a-f0-9-]{36}$/i;
const hash=value=>createHash('sha256').update(value).digest('hex');
const keys=['uncached','cacheRead','cacheWrite','output'];
const cleanModel=value=>String(value||'Unknown').replace(/[\x00-\x1f\x7f]/g,'').slice(0,120);
const stamp=value=>typeof value==='string'&&/^20\d\d-\d\d-\d\dT/.test(value)&&Number.isFinite(Date.parse(value))?Date.parse(value):null;
const sum=r=>keys.reduce((n,k)=>n+(r[k]??0),0);
function mergeUsageRow(row,old){const record={...row,at:row.at??old?.at??null,timeBasis:row.at===null&&old?.at!==null&&old?.at!==undefined?old.timeBasis:row.timeBasis};for(const key of keys)record[key]=row[key]??old?.[key]??null;return record;}
// Counts include an allowance for JS object and Map overhead, not just the
// serialized projection. The original response and message text are never
// retained by the live write queue.
const projectedBytes=row=>Buffer.byteLength(JSON.stringify(row))+128;
const LIVE_UNGUARDED=Symbol('unguarded'),LIVE_RECOVERY=Symbol('recovery');
const guardActive=guard=>{try{return guard()===true;}catch{return false;}};
const BACKFILL_BYTES=8*1024*1024,BACKFILL_ENTRIES=4096;
function checkpointState(entries={},partial=false,recovery=null){
  Object.defineProperties(entries,{checkpointPartial:{value:partial,enumerable:false},checkpointRecovery:{value:recovery,enumerable:false}});return entries;
}
function boundedCheckpoints(entries,preferred=[],reportTruncation=false){
  const relevant=new Set(preferred),valid=[];let rejected=0;
  for(const [id,e]of Object.entries(entries)){
    if(!HASH.test(id)||!e||!HASH.test(e.signature)||!['complete','retry'].includes(e.state)||!Number.isSafeInteger(e.failures)||e.failures<0||!Number.isSafeInteger(e.retryAt)||e.retryAt<0){rejected++;continue;}
    valid.push([id,{signature:e.signature,state:e.state,failures:e.failures,retryAt:e.retryAt,...(e.hasDelegates===true?{hasDelegates:true}:{})}]);
  }
  // Preserve retries and the active pass before unrelated settled checkpoints.
  // Checkpoints are an optimization; eviction never deletes usage records.
  const priority=([id,e])=>e.state==='retry'?(relevant.has(id)?3:2):(relevant.has(id)?1:0);
  valid.reverse().sort((a,b)=>priority(b)-priority(a));
  return checkpointState(Object.fromEntries(valid.slice(0,BACKFILL_ENTRIES)),entries.checkpointPartial===true||reportTruncation&&(rejected>0||valid.length>BACKFILL_ENTRIES),entries.checkpointRecovery||null);
}
async function readBounded(file,budget){
  const handle=await open(file,'r');
  try{
    if((await handle.stat()).size>budget)throw Object.assign(Error('Usage file exceeds read budget'),{code:'USAGE_READ_BUDGET'});
    const chunks=[];let bytes=0;
    while(bytes<=budget){
      const chunk=Buffer.allocUnsafe(Math.min(65536,budget-bytes+1));const {bytesRead}=await handle.read(chunk,0,chunk.length,null);
      if(!bytesRead)break;bytes+=bytesRead;
      if(bytes>budget)throw Object.assign(Error('Usage file exceeds read budget'),{code:'USAGE_READ_BUDGET'});
      chunks.push(chunk.subarray(0,bytesRead));
    }
    return Buffer.concat(chunks,bytes).toString('utf8');
  }finally{await handle.close();}
}
export function dateKey(time,zone='Asia/Shanghai'){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(time);
  const get=key=>parts.find(p=>p.type===key).value;return `${get('year')}-${get('month')}-${get('day')}`;
}
export function usageRecords(raw,conversationId,{maxRows=Infinity,maxBytes=Infinity}={}){
  const trajectory=raw?.trajectory||{},rows=new Map(),steps=trajectory.steps||[];let bytes=0;
  for(const [index,g] of (trajectory.generatorMetadata||[]).entries()){
    const chat=g.chatModel,u=chat?.usage;if(!u)continue;
    const output=tokenCount(u.outputTokens),cache=requestCacheMetrics(u);
    const uncached=cache?.uncachedTokens??tokenCount(u.inputTokens);
    const read=tokenCount(u.cacheReadTokens)??(u.cacheReadTokens===undefined?0:null);
    const write=tokenCount(u.cacheWriteTokens)??(u.cacheWriteTokens===undefined?0:null);
    // Empty failed-attempt records have no reported consumption.
    if([uncached,read,write,output].every(n=>n===null||n===0))continue;
    const planners=(g.stepIndices||[]).map(i=>Number.isInteger(i)&&i>=0?steps[i]:null).filter(s=>/PLANNER_RESPONSE/.test(String(s?.type||'')));
    const times=planners.map(s=>stamp(s.metadata?.createdAt)).filter(t=>t!==null);
    const at=stamp(chat.chatStartMetadata?.createdAt)??(times.length?Math.min(...times):null);
    const identity=u.responseId?`response:${u.apiProvider||''}:${u.responseId}`:u.messageId?`message:${u.apiProvider||''}:${u.messageId}`:
      `fallback:${conversationId}:${JSON.stringify(g.stepIndices||[index])}:${at??'undated'}`;
    const row={id:hash(identity),at,model:cleanModel(chat.modelDisplayName||chat.responseModel||u.model||chat.model),
      uncached,cacheRead:read,cacheWrite:write,output,partial:uncached===null||read===null||write===null||output===null||!cache&&uncached>0,
      timeBasis:stamp(chat.chatStartMetadata?.createdAt)!==null?'request-start':at!==null?'planner-created':'unknown'};
    const old=rows.get(row.id);
    if(!old||sum(row)>sum(old)){
      if(maxRows!==Infinity||maxBytes!==Infinity){
        const next=bytes+projectedBytes(row)-(old?projectedBytes(old):0);
        if(!old&&rows.size>=maxRows||next>maxBytes){const result=[...rows.values()];Object.defineProperty(result,'overflow',{value:true});return result;}
        bytes=next;
      }
      rows.set(row.id,row);
    }
  }
  return [...rows.values()];
}
const validRow=r=>r&&HASH.test(r.id)&&typeof r.model==='string'&&r.model.length<=120&&
  (r.at===null||Number.isSafeInteger(r.at)&&r.at>=0)&&keys.every(k=>r[k]===null||Number.isSafeInteger(r[k])&&r[k]>=0);
export class UsageLedger{
  constructor(directory=join(platformPaths().data,'usage-v1'),{timeZone='Asia/Shanghai',source='desktop-local'}={}){this.directory=directory;this.timeZone=timeZone;this.source=source;}
  _gate=Promise.resolve();_barrier=Promise.resolve();_writes=new Set();_files=new Map();usageWrites=new Map();revision=0;cache=null;
  beginUsageWrite(scope){this.usageWrites.set(scope,(this.usageWrites.get(scope)||0)+1);}
  endUsageWrite(scope){const n=(this.usageWrites.get(scope)||0)-1;if(n>0)this.usageWrites.set(scope,n);else this.usageWrites.delete(scope);}
  // Public queue remains a snapshot barrier for all outstanding writes. Its
  // setter also preserves the legacy test/caller ability to suspend new work.
  get queue(){return this._barrier;}
  set queue(value){this._gate=Promise.resolve(value);this._barrier=Promise.allSettled([this._gate,...this._writes]).then(()=>{});}
  enqueue(file,operation){
    // Fail explicitly instead of retaining an unbounded number of projected
    // requests while a disk is slow. Callers can retry on a later refresh.
    if(this._writes.size>=32)return Promise.reject(Error('Usage write queue is full'));
    const previous=this._files.get(file),gate=this._gate;
    const pending=Promise.all([gate.catch(()=>{}),previous?.catch(()=>{})]).then(operation);
    const tracked=pending.finally(()=>{this._writes.delete(tracked);if(this._files.get(file)===tracked)this._files.delete(file);});
    this._writes.add(tracked);this._files.set(file,tracked);
    this._barrier=Promise.allSettled([gate,...this._writes]).then(()=>{});
    return tracked;
  }
  async backfillState(scope,host,{preferred=[]}={}){
    if(!HASH.test(scope)||!['app','ide'].includes(host))throw Error('Invalid backfill scope');
    await this.queue.catch(()=>{});
    try{
      const content=await readBounded(join(this.directory,scope,'backfill-v1.json'),BACKFILL_BYTES);
      const value=JSON.parse(content);
      if(value.schema!==1||value.account!==scope||value.host!==host||!value.entries||typeof value.entries!=='object'||Array.isArray(value.entries))return checkpointState({},true,'invalid');
      return boundedCheckpoints(value.entries,preferred,true);
    }catch(e){if(e.code==='ENOENT')return checkpointState();if(e.code==='USAGE_READ_BUDGET')return checkpointState({},true,'oversized');if(e instanceof SyntaxError)return checkpointState({},true,'invalid');throw e;}
  }
  saveBackfillState(scope,host,entries,{preferred=[],isCurrent=()=>true}={}){
    if(!HASH.test(scope)||!['app','ide'].includes(host))throw Error('Invalid backfill scope');
    const file=join(this.directory,scope,'backfill-v1.json');
    return this.enqueue(file,async()=>{
      if(isCurrent()!==true)return;
      const bounded=boundedCheckpoints(entries,preferred),content=JSON.stringify({schema:1,account:scope,host,entries:bounded});
      if(Buffer.byteLength(content)>BACKFILL_BYTES)throw Error('Checkpoint exceeds write budget');
      await mkdir(join(this.directory,scope),{recursive:true});if(isCurrent()!==true)return;const temp=file+'.'+randomUUID()+'.tmp';
      try{
        await this.writeRecord(temp,content);if(isCurrent()!==true)return;
        let previous;try{previous=await stat(file);}catch(e){if(e.code!=='ENOENT')throw e;}
        if(isCurrent()!==true)return;
        if(previous?.size>BACKFILL_BYTES){
          // Keep oversized legacy metadata recoverable without reading/copying
          // it into memory. New checkpoints are bounded, so this happens once.
          await rename(file,join(this.directory,scope,`backfill-v1.oversized-${randomUUID()}.json`));
          if(isCurrent()!==true)return;
        }
        await rename(temp,file);return bounded;
      }finally{await unlink(temp).catch(()=>{});}
    }).catch(error=>{if(isCurrent()===true)throw error;});
  }
  async writeRecord(file,content){await writeFile(file,content,{mode:0o600});}
  async readSummaryRecord(file){return readBounded(file,16*1024*1024);}
  file(scope,id){if(!HASH.test(scope)||!GUID.test(id))throw Error('Invalid usage scope');return join(this.directory,scope,hash(id.toLowerCase())+'.json');}
  ingest(scope,id,raw,options={}){
    // Enter the per-conversation queue before the first asynchronous stat.
    // Otherwise a later disk import could overtake this older observation.
    return this.ingestMemory(scope,id,raw,options);
  }
  ingestMemory(scope,id,raw,{isCurrent=()=>true}={}){
    if(!scope)return Promise.resolve();
    return this.ingestRows(scope,id,usageRecords(raw,id),{isCurrent});
  }
  ingestRows(scope,id,rows,{isCurrent=()=>true}={}){
    if(!scope)return Promise.resolve();
    const file=this.file(scope,id);this.beginUsageWrite(scope);
    return this.enqueue(file,async()=>{
      if(isCurrent()!==true)return;
      if(await this.diskExists(scope,id)){
        this.diskWrites=(this.diskWrites||0)+1;
        try{return await this.mergeDisk(scope,id,{records:rows},{isCurrent});}finally{this.diskWrites--;}
      }
      let previous;try{previous=JSON.parse(await readBounded(file,16*1024*1024));}catch(e){if(isCurrent()!==true)return;if(e.code!=='ENOENT')throw Error('Usage ledger cannot be read');}
      if(isCurrent()!==true)return;
      if(previous&&(previous.schema!==1||previous.account!==scope||!Array.isArray(previous.records)||!previous.records.every(validRow)))throw Error('Invalid usage ledger');
      const merged=new Map((previous?.records||[]).map(r=>[r.id,r]));
      for(const row of rows)merged.set(row.id,mergeUsageRow(row,merged.get(row.id)));
      const records=[...merged.values()].sort((a,b)=>a.id.localeCompare(b.id));
      if(previous&&JSON.stringify(previous.records)===JSON.stringify(records))return;
      await mkdir(join(this.directory,scope),{recursive:true});if(isCurrent()!==true)return;const temp=file+'.'+randomUUID()+'.tmp';
      try{await this.writeRecord(temp,JSON.stringify({schema:1,account:scope,records}));if(isCurrent()!==true)return;await rename(temp,file);}
      finally{await unlink(temp).catch(()=>{});}
      // Keep the last same-account/day result as a visibly stale fallback
      // while a potentially expensive disk-backed summary is rebuilt.
      this.revision++;
    }).catch(error=>{if(isCurrent()===true)throw error;}).finally(()=>this.endUsageWrite(scope));
  }
  async diskExists(scope,id){try{return (await stat(this.file(scope,id).replace(/\.json$/,'.sqlite'))).isFile();}catch(e){if(e.code==='ENOENT')return false;throw e;}}
  diskJob(input,options={}){this.diskPending=(this.diskPending||0)+1;const pending=(this.diskQueue||Promise.resolve()).catch(()=>{}).then(()=>this.runDiskJob(input,options));this.diskQueue=pending;return pending.finally(()=>{this.diskPending--;});}
  runDiskJob(input,{isCurrent=()=>true}={}){
    const cancel=new SharedArrayBuffer(4),flag=new Int32Array(cancel);
    return new Promise((resolve,reject)=>{
      if(isCurrent()!==true){resolve(null);return;}
      const worker=new Worker(new URL('./usage-disk-worker.mjs',import.meta.url),{workerData:{...input,cancel},resourceLimits:{maxOldGenerationSizeMb:64,maxYoungGenerationSizeMb:8}});
      let result=null,settled=false,workerError=null;
      const timer=setInterval(()=>{if(isCurrent()!==true){Atomics.store(flag,0,1);void worker.terminate();}},100);timer.unref();
      const done=(error,value)=>{if(settled)return;settled=true;clearInterval(timer);error?reject(error):resolve(value);};
      worker.on('message',value=>{result=value;});worker.on('error',error=>{workerError=error;});
      worker.on('exit',code=>{if(isCurrent()!==true)done(null,null);else if(code===0&&result?.ok)done(null,result.result);else done(workerError||Error('Usage disk processing failed'));});
    });
  }
  ingestDisk(scope,id,jobDb,options={}){return this.ingestDiskRows(scope,id,{jobDb},options);}
  async mergeDisk(scope,id,input,{isCurrent=()=>true}={}){
    const file=this.file(scope,id).replace(/\.json$/,'.sqlite');
      if(isCurrent()!==true)return;
      await mkdir(join(this.directory,scope),{recursive:true});
      let previous=null;for(const candidate of [file,this.file(scope,id)]){try{await stat(candidate);previous=candidate;break;}catch(e){if(e.code!=='ENOENT')throw e;}}
      // Repeated settled-conversation polls often produce the same bounded row
      // set. Remember a verified signature for each recently touched SQLite
      // ledger so those polls neither start workers nor reread large databases.
      // File identity is rechecked to avoid trusting external edits/deletion.
      let signature=null;
      if(previous===file&&Array.isArray(input.records)){
        const digest=createHash('sha256');for(const row of input.records)digest.update(JSON.stringify(row)+'\n');signature=digest.digest('hex');
        const cached=this.diskSignatures?.get(file),info=await lstat(file);
        if(info.isSymbolicLink()||!info.isFile())throw Error('Linked usage source rejected');
        if(cached&&cached.signature===signature&&cached.size===info.size&&cached.mtimeMs===info.mtimeMs&&cached.ctimeMs===info.ctimeMs&&cached.ino===info.ino){
          if(isCurrent()!==true)return;return {changed:false,skipped:true};
        }
      }
      const staging=file+'.'+randomUUID()+'.tmp';
      try{
        const result=await this.diskJob({action:'merge',scope,previous,staging,...input},{isCurrent});if(!result||isCurrent()!==true)return;
        if(result.changed!==false){await rename(staging,file);this.revision++;}
        this.diskSignatures??=new Map();this.diskSignatures.delete(file);
        if(signature){const info=await lstat(file);if(!info.isSymbolicLink()&&info.isFile())this.diskSignatures.set(file,{signature,size:info.size,mtimeMs:info.mtimeMs,ctimeMs:info.ctimeMs,ino:info.ino});}
        while(this.diskSignatures.size>128)this.diskSignatures.delete(this.diskSignatures.keys().next().value);
        return result;
      }finally{for(const suffix of ['', '-journal'])await unlink(staging+suffix).catch(()=>{});}
  }
  ingestDiskRows(scope,id,input,options={}){
    if(!scope)return Promise.resolve();const file=this.file(scope,id);this.diskWrites=(this.diskWrites||0)+1;this.beginUsageWrite(scope);
    // The logical JSON path is shared with ingestMemory for the same account
    // and conversation, so migration and ordinary writes cannot race. The
    // diskQueue independently limits expensive workers to one at a time.
    return this.enqueue(file,()=>this.mergeDisk(scope,id,input,options)).finally(()=>{this.diskWrites--;this.endUsageWrite(scope);});
  }
  startDiskSummary(scope,now,scanRevision,cacheKey,isCurrent){
    if(this.diskSummaryPending||this.diskSummaryRetry?.key===cacheKey&&this.diskSummaryRetry.at>Date.now())return;
    const staging=join(this.directory,scope,'.summary-'+randomUUID()+'.tmp');
    this.diskSummaryPending=this.diskJob({action:'summary',scope,directory:join(this.directory,scope),staging,now,timeZone:this.timeZone,source:this.source},{isCurrent}).then(value=>{
      if(!value||isCurrent()!==true)return;this.diskSummaryError=false;
      if(this.revision===scanRevision){this.cache={key:cacheKey,revision:scanRevision,value};this.diskSummaryRetry=null;}
      else {
        // Writes continued while the scan was running. Its result is usable
        // only as a marked fallback, never as the current exact revision.
        // Delay the next full scan to avoid repeatedly monopolizing the disk
        // while conversation traffic is continuous.
        if(this.cache?.key!==cacheKey||this.cache.revision<=scanRevision)this.cache={key:cacheKey,revision:scanRevision,value};
        this.diskSummaryRetry={key:cacheKey,at:Date.now()+30000};
      }
    }).catch(()=>{if(isCurrent()===true){this.diskSummaryError=true;this.diskSummaryRetry={key:cacheKey,at:Date.now()+30000};}}).finally(async()=>{for(const suffix of ['', '-journal'])await unlink(staging+suffix).catch(()=>{});this.diskSummaryPending=null;});
  }
  async summary(scope,now=Date.now(),{isCurrent=()=>true}={}){
    if(!scope||!HASH.test(scope))return null;
    const today=dateKey(now,this.timeZone),cacheKey=scope+':'+today;
    const unknown=()=>({accountKey:scope,timeZone:this.timeZone,today,days:[],models:[],todayTokens:null,weekTokens:null,monthTokens:null,totalTokens:null,requests:null,unreadableFiles:0,source:this.source,summaryStale:true});
    if(this.usageWrites.get(scope))return this.cache?.key===cacheKey?{...this.cache.value,summaryStale:true}:unknown();
    if(this.cache?.key===cacheKey&&this.cache.revision===this.revision)return this.cache.value;
    const scanRevision=this.revision;
    const daily=new Map(),models=new Set(),seen=new Map();let unreadable=0,unknownTokens=0,unknownRequests=0,partialRequests=0;
    let files=[];try{files=await readdir(join(this.directory,scope));}catch(e){if(e.code!=='ENOENT')throw e;}
    if(files.some(name=>/^[a-f0-9]{64}\.sqlite$/.test(name))){
      this.startDiskSummary(scope,now,scanRevision,cacheKey,isCurrent);
      return this.cache?.key===cacheKey?{...this.cache.value,summaryStale:true}:unknown();
    }
    for(const name of files.filter(name=>/^[a-f0-9]{64}\.json$/.test(name))){
      try{
        const text=await this.readSummaryRecord(join(this.directory,scope,name));
        const record=JSON.parse(text);if(record.schema!==1||record.account!==scope||!Array.isArray(record.records)||!record.records.every(validRow))throw Error('Invalid ledger');
        for(const r of record.records){const previous=seen.get(r.id);if(!previous||sum(r)>sum(previous))seen.set(r.id,r);}
      }catch{unreadable++;}
    }
    for(const r of seen.values()){
      models.add(r.model);if(r.partial)partialRequests++;
      if(r.at===null){unknownTokens+=sum(r);unknownRequests++;continue;}
      const date=dateKey(r.at,this.timeZone);if(!daily.has(date))daily.set(date,{date,models:{}});
      const day=daily.get(date);day.models[r.model]||={uncached:0,cacheRead:0,cacheWrite:0,output:0,total:0,requests:0};
      const bucket=day.models[r.model];for(const key of keys)bucket[key]+=r[key]??0;bucket.total+=sum(r);bucket.requests++;
    }
    const days=[...daily.values()].sort((a,b)=>a.date.localeCompare(b.date));
    const total=day=>Object.values(day.models).reduce((n,r)=>n+r.total,0);
    const value={accountKey:scope,timeZone:this.timeZone,today,days,models:[...models].sort(),todayTokens:days.filter(d=>d.date===today).reduce((n,d)=>n+total(d),0),
      weekTokens:days.filter(d=>d.date>=weekStart(today)&&d.date<=today).reduce((n,d)=>n+total(d),0),
      monthTokens:days.filter(d=>d.date.slice(0,7)===today.slice(0,7)&&d.date<=today).reduce((n,d)=>n+total(d),0),
      totalTokens:days.reduce((n,d)=>n+total(d),0)+unknownTokens,unknownTokens,unknownRequests,partialRequests,unreadableFiles:unreadable,
      requests:seen.size,firstDate:days[0]?.date||null,updatedAt:new Date(now).toISOString(),source:this.source};
    if(this.revision===scanRevision&&!this.usageWrites.get(scope)){this.cache={key:cacheKey,revision:scanRevision,value};return value;}
    return {...value,summaryStale:true};
  }
}
export function weekStart(date){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);}

export class DesktopUsage{
  constructor(store,ledger=new UsageLedger(),{host=null,discoverLocal=null,owns=()=>true,now=Date.now,sliceMs=3000,continueDelay=250,
    maxCandidates=25,maxCandidatesPerSlice=25,maxPassMs=15000,maxMapEntries=4096,localScanMs=30000,
    liveMaxConversations=16,liveMaxRows=8192,liveMaxBytes=4*1024*1024,liveMaxGroups=128,liveMaxRecoveryGuards=16,liveMaxRecoveries=256,liveRetryMs=1000,livePollMs=1000,liveRecoveryPollMs=1000,liveBackgroundPollMs=1000,liveBackgroundRetryMs=60000}={}){
    this.store=store;this.ledger=ledger;this.fingerprints=new Map();this.host=host;this.owns=()=>owns()===true;this.now=now;
    this.discoverLocal=discoverLocal||(()=>host?discoverLocalConversations({host}):Promise.resolve({conversations:[],errors:0}));
    this.customDiscover=Boolean(discoverLocal);this.localScanMs=localScanMs;this.localScanAt=-Infinity;this.localScanResult=null;
    this.sliceMs=sliceMs;this.continueDelay=continueDelay;this.maxCandidates=maxCandidates;this.maxCandidatesPerSlice=maxCandidatesPerSlice;
    this.maxPassMs=maxPassMs;this.maxMapEntries=maxMapEntries;this.fullRemaining=new Map();this.fullJournal=null;this.fullMissing=0;this.passSeen=new Set();this.passFailures=new Set();this.readFailures=new Map();this.delegatedCandidates=new Map();
    this.liveMaxConversations=liveMaxConversations;this.liveMaxRows=liveMaxRows;this.liveMaxBytes=liveMaxBytes;this.liveMaxGroups=liveMaxGroups;this.liveMaxRecoveryGuards=liveMaxRecoveryGuards;this.liveMaxRecoveries=liveMaxRecoveries;this.liveRetryMs=liveRetryMs;this.livePollMs=livePollMs;
    this.liveRecoveryPollMs=liveRecoveryPollMs;this.liveBackgroundPollMs=liveBackgroundPollMs;this.liveBackgroundRetryMs=liveBackgroundRetryMs;
    this.liveStates=new Map();this.liveOrphans=new Set();this.liveRecoveries=new Map();this.liveRows=0;this.liveBytes=0;this.liveGroups=0;this.liveScope=null;this.liveEpoch=null;this.liveUnknownOverflow=false;this.liveMarkedError=false;
  }
  syncing=false;lastSync=0;status='waiting';missingConversations=0;confirmedMissingConversations=0;retryingConversations=0;scope=null;scopeEpoch=null;forceQueued=false;disposed=false;continuation=null;
  rememberDelegates(scope,id,raw){
    if(scope!==this.store.identity)return [];
    if(this.delegatedScope!==scope||this.delegatedEpoch!==this.store.epoch){this.delegatedCandidates.clear();this.delegatedScope=scope;this.delegatedEpoch=this.store.epoch;}
    const children=delegatedIds(id,raw,this.store.client.reader?.summaries||{});
    for(const child of children){if(this.delegatedCandidates.size>=this.maxMapEntries)break;this.delegatedCandidates.set(child,{id:child});}
    while(this.delegatedCandidates.size>this.maxMapEntries)this.delegatedCandidates.delete(this.delegatedCandidates.keys().next().value);
    return children;
  }
  capMap(map){while(map.size>this.maxMapEntries)map.delete(map.keys().next().value);}
  async ingest(scope,id,raw){
    const epoch=this.store.epoch,current=()=>!this.disposed&&this.owns()&&scope===this.store.identity&&epoch===this.store.epoch;
    if(!current())return;this.rememberDelegates(scope,id,raw);await this.ledger.ingest(scope,id,raw,{isCurrent:current});
  }
  // Foreground metrics do not await usage persistence: a SQLite import or
  // summary can take seconds. Only bounded numeric rows cross this boundary.
  // A conversation still has a single ordered writer and coalesces repeated
  // observations by request ID while the writer is busy.
  ingestLive(scope,id,raw,options={}){
    this.refreshLiveScope();const epoch=this.store.epoch;
    const guard=typeof options.isCurrent==='function'?options.isCurrent:()=>true,guardKey=Object.hasOwn(options,'guardKey')?options.guardKey:options.isCurrent||LIVE_UNGUARDED;
    if(this.disposed||!this.owns()||scope!==this.store.identity||!guardActive(guard))return {deferred:true};
    try{
      this.ledger.file(scope,id);id=id.toLowerCase();this.rememberDelegates(scope,id,raw);
      const rows=usageRecords(raw,id,{maxRows:this.liveMaxRows,maxBytes:this.liveMaxBytes});if(!rows.length&&!rows.overflow)return {deferred:true};
      const key=scope+':'+id;let state=this.liveStates.get(key);
      if(!state){
        if(this.liveStates.size+this.liveOrphans.size>=this.liveMaxConversations){this.queueLiveRecovery(scope,id,epoch,guardKey,guard);return {deferred:true};}
        state=this.newLiveState(scope,id,epoch);
      }
      if(rows.overflow||this.liveOversized(rows))this.markLiveRecovery(state,guardKey,guard,true);
      else if(!this.stageLiveRows(state,rows,guardKey,guard))this.markLiveRecovery(state,guardKey,guard,false);
      this.scheduleLive(state,0);
    }catch{this.queueLiveRecovery(scope,String(id).toLowerCase(),epoch,guardKey,guard);}
    return {deferred:true};
  }
  newLiveState(scope,id,epoch){
    const key=scope+':'+id,state={key,scope,id,epoch,pending:[],batch:null,running:false,timer:null,failures:0,failed:false,failureKind:null,needsRead:false,needsDisk:false,backgroundRequested:false,backgroundCommitted:false,backgroundGeneration:0,halted:false,recovering:false,recoveryGeneration:0,recoveryGuards:new Map(),persistedForegroundVersion:null};
    state.current=()=>!this.disposed&&this.owns()&&state.scope===this.store.identity&&state.epoch===this.store.epoch;
    this.liveStates.set(key,state);return state;
  }
  updateLiveError(){
    const error=this.liveUnknownOverflow||this.liveRecoveries.size>0||[...this.liveStates.values()].some(state=>state.failed||state.recovering);
    if(typeof this.store.setUsagePersistenceError==='function')this.store.setUsagePersistenceError('live',error);
    else if(error)this.store.usagePersistenceError=true;
    else if(this.liveMarkedError)this.store.usagePersistenceError=false;
    this.liveMarkedError=error;
  }
  releaseLiveRows(rows){for(const row of rows.values()){this.liveRows--;this.liveBytes-=projectedBytes(row);}}
  releaseLiveGroup(group){this.releaseLiveRows(group.rows);this.liveGroups--;}
  pruneLiveGroups(state){const valid=[];for(const group of state.pending){if(guardActive(group.guard))valid.push(group);else this.releaseLiveGroup(group);}state.pending=valid;}
  dropLiveState(state){
    if(state.timer)clearTimeout(state.timer);state.timer=null;
    for(const group of state.pending)this.releaseLiveGroup(group);state.pending=[];
    if(this.liveStates.get(state.key)===state)this.liveStates.delete(state.key);
    if(state.running)this.liveOrphans.add(state);
    else if(state.batch){this.releaseLiveGroup(state.batch);state.batch=null;}
  }
  refreshLiveScope(){
    const scope=this.owns()&&!this.disposed?this.store.identity:null,epoch=scope?this.store.epoch:null;
    if(scope===this.liveScope&&epoch===this.liveEpoch)return;
    for(const state of this.liveStates.values())this.dropLiveState(state);
    this.liveRecoveries.clear();this.liveUnknownOverflow=false;this.liveScope=scope;this.liveEpoch=epoch;this.updateLiveError();
  }
  stageLiveRows(state,rows,guardKey,guard,{front=false,foregroundVersion=undefined}={}){
    this.pruneLiveGroups(state);
    let group=!front&&state.pending.at(-1)?.guardKey===guardKey?state.pending.at(-1):null;
    const created=!group;if(created){if(this.liveGroups>=this.liveMaxGroups)return false;group={guardKey,guard,rows:new Map(),foregroundVersion:null};}
    const changes=new Map();let count=0,bytes=0;
    for(const row of rows){
      const old=changes.get(row.id)||group.rows.get(row.id),next=mergeUsageRow(row,old);
      if(!old)count++;bytes+=projectedBytes(next)-(old?projectedBytes(old):0);changes.set(row.id,next);
      if(this.liveRows+count>this.liveMaxRows||this.liveBytes+bytes>this.liveMaxBytes)return false;
    }
    for(const [id,row]of changes)group.rows.set(id,row);group.guard=guard;group.foregroundVersion=foregroundVersion??this.store.usageFailureVersion?.('foreground:'+state.id)??null;
    if(created){front?state.pending.unshift(group):state.pending.push(group);this.liveGroups++;}
    this.liveRows+=count;this.liveBytes+=bytes;return true;
  }
  markLiveRecovery(state,guardKey,guard,disk){
    if(!guardActive(guard))return;
    if(!state.recoveryGuards.has(guardKey)&&state.recoveryGuards.size>=this.liveMaxRecoveryGuards)this.liveUnknownOverflow=true;
    else state.recoveryGuards.set(guardKey,guard);
    state.recoveryGeneration++;state.recovering=true;
    if(disk){state.needsDisk=true;state.needsRead=false;}else if(!state.needsDisk)state.needsRead=true;
    this.updateLiveError();
  }
  liveRecoveryCurrent(state){return state.current()&&[...state.recoveryGuards.values()].some(guardActive);}
  liveOversized(rows){let bytes=0;for(const row of rows){bytes+=projectedBytes(row);if(bytes>this.liveMaxBytes)return true;}return rows.length>this.liveMaxRows;}
  pruneLiveRecoveries(){
    // A guard may close over an evicted task/session. Do not keep that object
    // alive while unrelated active writes occupy all conversation slots.
    for(const [key,item]of this.liveRecoveries){
      for(const [guardKey,guard]of item.guards)if(!guardActive(guard))item.guards.delete(guardKey);
      if(!item.guards.size)this.liveRecoveries.delete(key);
    }
  }
  queueLiveRecovery(scope,id,epoch,guardKey=LIVE_UNGUARDED,guard=()=>true){
    // Recovery remembers only bounded IDs and reads this specific conversation
    // later. It never starts an automatic all-history scan.
    this.pruneLiveRecoveries();if(!guardActive(guard)){this.updateLiveError();return;}
    if(scope!==this.store.identity||epoch!==this.store.epoch||!GUID.test(id)||!HASH.test(scope)){this.liveUnknownOverflow=true;this.updateLiveError();return;}
    const key=scope+':'+id,state=this.liveStates.get(key);
    if(state){this.markLiveRecovery(state,guardKey,guard,false);this.scheduleLive(state,this.liveRetryMs);}
    else if(this.liveRecoveries.size<this.liveMaxRecoveries||this.liveRecoveries.has(key)){
      const item=this.liveRecoveries.get(key)||{scope,id,epoch,guards:new Map()};
      if(item.guards.has(guardKey)||item.guards.size<this.liveMaxRecoveryGuards)item.guards.set(guardKey,guard);else this.liveUnknownOverflow=true;
      this.liveRecoveries.set(key,item);
    }else this.liveUnknownOverflow=true;
    this.updateLiveError();this.scheduleLiveRecoveries();
  }
  scheduleLiveRecoveries(){
    if(this.liveRecoveryTimer||!this.liveRecoveries.size||this.disposed)return;
    this.liveRecoveryTimer=setTimeout(()=>{this.liveRecoveryTimer=null;this.refreshLiveScope();this.pruneLiveRecoveries();
      while(this.liveRecoveries.size&&this.liveStates.size+this.liveOrphans.size<this.liveMaxConversations){
        const [key,item]=this.liveRecoveries.entries().next().value;this.liveRecoveries.delete(key);
        if(item.scope!==this.store.identity||item.epoch!==this.store.epoch||!this.owns())continue;
        const guards=[...item.guards].filter(([,guard])=>guardActive(guard));if(!guards.length)continue;
        const state=this.newLiveState(item.scope,item.id,item.epoch);for(const [guardKey,guard]of guards)this.markLiveRecovery(state,guardKey,guard,false);this.scheduleLive(state,0);
      }
      this.updateLiveError();this.scheduleLiveRecoveries();
    },this.liveRecoveryPollMs);this.liveRecoveryTimer.unref?.();
  }
  scheduleLive(state,delay){
    if(state.timer||state.running||!state.current())return;
    state.timer=setTimeout(()=>{state.timer=null;void this.runLive(state);},delay);state.timer.unref?.();
  }
  async runLive(state){
    if(!state.current()){this.dropLiveState(state);this.updateLiveError();return;}
    this.pruneLiveGroups(state);
    if(state.recovering&&!this.liveRecoveryCurrent(state)){
      state.needsRead=false;state.needsDisk=false;state.recovering=false;state.recoveryGuards.clear();state.backgroundRequested=false;state.backgroundCommitted=false;state.halted=false;if(state.failureKind!=='write'){state.failed=false;state.failureKind=null;}
    }
    if(state.backgroundRequested&&state.needsDisk){this.runLiveBackground(state);return;}
    if(state.batch&&!guardActive(state.batch.guard)){this.releaseLiveGroup(state.batch);state.batch=null;if(state.failureKind==='write'){state.failed=false;state.failureKind=null;state.failures=0;}}
    if(!state.batch&&state.pending.length)state.batch=state.pending.shift();
    if(!state.batch&&!state.needsRead&&!state.needsDisk){
      state.recovering=false;state.recoveryGuards.clear();
      if(state.persistedForegroundVersion!==null&&this.store.usageFailureVersion?.('foreground:'+state.id)===state.persistedForegroundVersion)this.store.setUsagePersistenceError?.('foreground:'+state.id,false);
      this.dropLiveState(state);this.updateLiveError();this.scheduleLiveRecoveries();return;
    }
    if(!state.batch&&state.halted)return;
    if(!state.batch&&state.needsDisk){this.runLiveBackground(state);return;}
    // Keep the active live batch coalescible and cancellable while an unrelated
    // expensive disk task is already running; do not queue another full worker.
    if(this.ledger.diskPending){this.scheduleLive(state,this.livePollMs);return;}
    state.running=true;let failed=false;
    try{
      if(state.batch){
        const batch=state.batch,current=()=>state.current()&&guardActive(batch.guard);
        await this.ledger.ingestRows(state.scope,state.id,[...batch.rows.values()],{isCurrent:current});
        if(!state.current())return;
        this.releaseLiveGroup(batch);state.batch=null;if(state.failureKind==='write'){state.failed=false;state.failureKind=null;state.failures=0;}if(current())state.persistedForegroundVersion=batch.foregroundVersion;
      }else{
        const generation=state.recoveryGeneration,version=this.store.usageFailureVersion?.('foreground:'+state.id)??null,current=()=>this.liveRecoveryCurrent(state);
        const raw=await this.store.client.trajectory(state.id,{force:true,isCurrent:current});
        if(!current())return;
        if(generation!==state.recoveryGeneration)return;
        if(!raw?.trajectory||!Array.isArray(raw.trajectory.generatorMetadata))throw Error('Live usage recovery unavailable');
        const rows=usageRecords(raw,state.id,{maxRows:this.liveMaxRows,maxBytes:this.liveMaxBytes});if(!rows.length&&!rows.overflow)throw Error('Live usage recovery unavailable');
        if(rows.overflow||this.liveOversized(rows)){state.needsRead=false;state.needsDisk=true;}
        else {if(!this.stageLiveRows(state,rows,LIVE_RECOVERY,current,{front:true,foregroundVersion:version}))throw Error('Live usage recovery exceeds budget');state.needsRead=false;if(state.failureKind==='recovery'){state.failed=false;state.failureKind=null;state.failures=0;}}
      }
    }catch(error){if(state.current()){
      const limit=!state.batch&&collectionFailure(error);
      if(limit&&limit.kind!=='field'){state.needsRead=false;state.needsDisk=true;}
      else if(limit?.kind==='field'){state.halted=true;state.failed=true;state.failureKind='recovery';}
      else {failed=true;state.failed=true;state.failureKind=state.batch?'write':'recovery';state.failures++;}
    }}
    finally{
      state.running=false;
      if(!state.current()){
        if(state.batch){this.releaseLiveGroup(state.batch);state.batch=null;}
        this.dropLiveState(state);this.liveOrphans.delete(state);
      }else{
        this.updateLiveError();
        this.scheduleLive(state,failed?Math.min(30000,this.liveRetryMs*2**Math.min(state.failures-1,5)):0);
      }
      this.scheduleLiveRecoveries();
    }
  }
  runLiveBackground(state){
    const entry=this.store.sessions?.get(state.id),background=this.store.background;
    if(!entry||!background||typeof this.store.startBackground!=='function'){
      // No bounded collector is available. Keep the incomplete status visible
      // without repeatedly re-reading the same oversized conversation.
      state.halted=true;state.failed=true;state.failureKind='recovery';this.updateLiveError();return;
    }
    const status=background.state?.(state.id);
    if(state.backgroundRequested){
      if(state.backgroundCommitted&&status?.state!=='processing'){
        state.backgroundRequested=false;state.backgroundCommitted=false;
        if(state.backgroundGeneration===state.recoveryGeneration){state.needsDisk=false;state.needsRead=false;if(state.failureKind==='recovery'){state.failed=false;state.failureKind=null;state.failures=0;}state.persistedForegroundVersion=state.backgroundForegroundVersion;this.updateLiveError();this.scheduleLive(state,0);return;}
      }else if(status?.state==='limited'){
        state.backgroundRequested=false;state.failed=true;state.failureKind='recovery';this.updateLiveError();this.scheduleLive(state,this.liveBackgroundRetryMs);return;
      }else {this.scheduleLive(state,this.liveBackgroundPollMs);return;}
    }
    state.backgroundRequested=true;state.backgroundCommitted=false;state.backgroundGeneration=state.recoveryGeneration;state.backgroundForegroundVersion=this.store.usageFailureVersion?.('foreground:'+state.id)??null;
    if(!this.store.startBackground(state.scope,state.id,entry,()=>this.liveRecoveryCurrent(state)&&this.store.sessions?.get(state.id)===entry)){
      state.backgroundRequested=false;state.failed=true;state.failureKind='recovery';this.updateLiveError();this.scheduleLive(state,this.liveBackgroundRetryMs);return;
    }
    this.scheduleLive(state,this.liveBackgroundPollMs);
  }
  async ingestDisk(scope,id,jobDb,{isCurrent=()=>true}={}){
    const epoch=this.store.epoch,current=()=>!this.disposed&&this.owns()&&scope===this.store.identity&&epoch===this.store.epoch&&isCurrent()===true;
    if(!current())return;await this.ledger.ingestDisk(scope,id,jobDb,{isCurrent:current});
    if(!current())return;
    const state=this.liveStates.get(scope+':'+String(id).toLowerCase());
    if(state?.needsDisk&&state.backgroundRequested&&state.epoch===epoch&&this.liveRecoveryCurrent(state)){state.backgroundCommitted=true;this.scheduleLive(state,0);}
  }
  sync(forceFull=false){
    if(this.disposed||!this.owns())return Promise.resolve();
    if(forceFull)this.forceQueued=true;
    if(this.pending)return this.pending;
    if(!this.continuation){this.passSeen.clear();this.passFailures.clear();}
    clearTimeout(this.continuation);this.continuation=null;
    this.syncing=true;this.status='syncing';
    this.pending=(async()=>{
      let result;
      do{
        const force=this.forceQueued;this.forceQueued=false;
        result=await this.runSync(force);
      }while(this.forceQueued&&!this.disposed&&this.owns());
      if(!result?.current())return;
      this.lastSync=this.now();this.missingConversations=result.missing;
      this.confirmedMissingConversations=result.confirmed;this.retryingConversations=result.retrying;
      this.status=result.more?'syncing':result.missing||result.partial?'partial':'ready';
      if(result.more){this.continuation=setTimeout(()=>void this.sync(),this.continueDelay);this.continuation.unref?.();}
    })().catch(()=>{this.status='offline';this.lastSync=this.now();}).finally(()=>{this.syncing=false;this.pending=null;});return this.pending;
  }
  async runSync(forceFull){
    const scope=this.store.identity,epoch=this.store.epoch;
    const current=()=>{
      const active=!this.disposed&&this.owns()&&scope===this.store.identity&&epoch===this.store.epoch;
      if(!active&&this.scope===scope&&this.scopeEpoch===epoch){this.fullRemaining.clear();this.fullJournal=null;}
      return active;
    };
    if(!scope)return null;
    if(this.scope!==scope||this.scopeEpoch!==epoch){this.scope=scope;this.scopeEpoch=epoch;this.fingerprints.clear();this.fullRemaining.clear();this.fullJournal=null;this.fullMissing=0;this.passSeen.clear();this.passFailures.clear();this.readFailures.clear();this.localScanResult=null;this.localScanAt=-Infinity;}
    let missing=0,candidates,completePass=false;
    if(!forceFull&&this.fullRemaining.size){
      // A full import owns a fixed, bounded queue. Rediscovery between slices
      // could lose deleted/temporarily hidden IDs and keep the timer alive forever.
      candidates=new Map(this.fullRemaining);missing=this.fullMissing;completePass=true;
    }else{
      let listed=[];
      try{listed=await this.store.listConversations(true);}catch{missing++;}
      if(!current())return {current};
      let local;
      if(!this.customDiscover&&this.localScanResult&&this.now()-this.localScanAt<this.localScanMs&&!forceFull)local=this.localScanResult;
      else {local=await this.discoverLocal();if(!this.customDiscover){this.localScanResult=local;this.localScanAt=this.now();}}
      if(!current())return {current};missing+=local.errors||0;
      candidates=new Map();
      // Current conversations get priority over unloaded archives.
      for(const c of listed)if(conversationId.test(c.id)){
        if(candidates.size>=this.maxMapEntries){missing++;break;}
        candidates.set(c.id.toLowerCase(),{id:c.id.toLowerCase(),listed:c});
      }
      for(const c of local.conversations||[])if(conversationId.test(c.id)){
        const id=c.id.toLowerCase();if(candidates.has(id)||candidates.size<this.maxMapEntries)candidates.set(id,{...candidates.get(id),...c,id});else missing++;
      }
      if(this.delegatedScope===scope&&this.delegatedEpoch===epoch)for(const [id,c]of this.delegatedCandidates)if(!candidates.has(id)){
        if(candidates.size>=this.maxMapEntries){missing++;break;}candidates.set(id,c);
      }
      if(forceFull||this.sliceMs===0){this.fullRemaining=new Map(candidates);this.fullMissing=missing;this.passSeen.clear();this.passFailures.clear();completePass=true;}
    }
    const reused=!forceFull&&completePass&&this.fullJournal;
    let journal=reused?this.fullJournal:this.host?await this.ledger.backfillState(scope,this.host,{preferred:[...candidates.keys()].map(hash)}):{};
    if(!reused&&journal.checkpointPartial)missing++;
    if(completePass)this.fullJournal=journal;
    const ordered=[...candidates.values()].sort((a,b)=>{
      const running=c=>/RUNNING|IN_PROGRESS/.test(String(c.listed?.status||''));
      if(running(a)!==running(b))return running(b)-running(a);
      const time=c=>Date.parse(c.listed?.modifiedAt||c.listed?.lastModifiedTime||'')||0;
      return time(b)-time(a);
    });
    const selected=completePass?ordered:ordered.slice(0,this.maxCandidates);
    const started=this.now();let processed=0,more=false,dirty=false,partial=!completePass&&ordered.length>selected.length;
    for(const c of selected){
      if(!current())return {current};
      // Always consume one queued entry, even if the event loop was suspended
      // past the slice budget before its first read. Every continuation advances.
      if(processed&&(processed>=this.maxCandidatesPerSlice||this.now()-started>=this.maxPassMs)){more=completePass;partial=partial||completePass;break;}
      const key=hash(c.id),s=c.listed,mark=JSON.stringify([s?.stepCount,s?.modifiedAt,s?.status,s?.lastUserInputStepIndex]);
      // Recheck older imports once: they could finish without discovering
      // delegated conversations that were absent from the host's top-level list.
      const signature=hash('delegation-v1:'+c.id+':'+(c.signature||'')+mark),old=journal[key];
      const unchanged=old?.signature===signature;
      const forced=this.fullRemaining.has(c.id);
      if(!forced&&this.passSeen.has(c.id))continue;
      if(!forced&&unchanged&&old?.state==='retry'&&old.retryAt>this.now()){this.passFailures.add(c.id);continue;}
      const cached=s&&this.fingerprints.get(c.id)===mark&&!/RUNNING/.test(s.status||'');
      // A persisted checkpoint already verified both disk and host revision.
      // Restarting the collector alone must not force all settled chats to load.
      const settled=s?.modifiedAt&&/IDLE|DONE|COMPLETED|CANCELLED|CANCELED|STOPPED|FAILED|ERROR/.test(String(s.status||''));
      if(!forced&&!old?.hasDelegates&&(c.signature?unchanged&&old.state==='complete'&&(!s||cached||settled):cached))continue;
      if(processed&&this.now()-started>=this.sliceMs){more=completePass;break;}
      processed++;
      this.passSeen.add(c.id);this.capMap(this.passSeen);
      this.fullRemaining.delete(c.id);
      try{
        const completed=this.store.sessions?.get(c.id),revision=JSON.stringify([s?.stepCount??null,s?.modifiedAt??s?.lastModifiedTime??null,s?.status??null,s?.lastUserInputStepIndex??null]);
        if(s&&completed?.backgroundUsageComplete===true&&completed.backgroundRevision===revision){
          const stable=!c.readSignature||await c.readSignature()===c.signature;if(!current())return {current};if(!stable)throw Error('History changed during import');
          const children=(completed.data?.delegatedConversations||[]).filter(child=>conversationId(child)&&child!==c.id);
          for(const child of children)if(!candidates.has(child)&&!this.passSeen.has(child)){
            if(candidates.size>=this.maxMapEntries||completePass&&this.passSeen.size+this.fullRemaining.size>=this.maxMapEntries){missing++;break;}
            candidates.set(child,{id:child});if(completePass)this.fullRemaining.set(child,{id:child});
          }
          this.fingerprints.set(c.id,mark);this.capMap(this.fingerprints);this.passFailures.delete(c.id);this.readFailures.delete(c.id);
          if(this.host){journal[key]={signature,state:'complete',failures:0,retryAt:0,hasDelegates:children.length>0};dirty=true;}
          await yieldToLiveRequests();continue;
        }
        // An independently discovered ID has no summary. An empty summary
        // intentionally reads steps until EOF; the shared reader still enforces
        // pagination, revision checks, memory budgets and a wall-time deadline.
        const summary=s?{stepCount:s.stepCount,lastModifiedTime:s.modifiedAt,status:s.status,lastUserInputStepIndex:s.lastUserInputStepIndex}:{};
        const raw=await this.store.client.trajectory(c.id,{summary,force:forced,isCurrent:current});
        if(!current())return {current};
        if(!raw?.trajectory||!Array.isArray(raw.trajectory.steps)||!Array.isArray(raw.trajectory.generatorMetadata))throw Error('Incomplete historical statistics');
        if(!s&&!raw.trajectory.steps.length&&!raw.trajectory.generatorMetadata.length)throw Error('History not yet readable');
        const children=this.rememberDelegates(scope,c.id,raw);
        for(const id of children)if(!candidates.has(id)&&!this.passSeen.has(id)){
          // Match the existing local-history discovery ceiling and keep an
          // iterative map walk, so nested/shared/cyclic delegation cannot recurse.
          if(candidates.size>=this.maxMapEntries||completePass&&this.passSeen.size+this.fullRemaining.size>=this.maxMapEntries){missing++;break;}
          candidates.set(id,{id});if(completePass)this.fullRemaining.set(id,{id});
        }
        const stable=!c.readSignature||await c.readSignature()===c.signature;
        if(!current())return {current};
        if(!stable)throw Error('History changed during import');
        await this.ingest(scope,c.id,raw);if(!current())return {current};
        this.fingerprints.set(c.id,mark);this.capMap(this.fingerprints);
        this.passFailures.delete(c.id);
        this.readFailures.delete(c.id);
        if(this.host){journal[key]={signature,state:'complete',failures:0,retryAt:0,hasDelegates:children.length>0};dirty=true;}
      }catch{
        if(!current())return {current};this.passFailures.add(c.id);
        const remembered=this.readFailures.get(c.id),failures=Math.max(unchanged?old?.failures||0:0,remembered?.signature===signature?remembered.failures:0)+1;
        this.readFailures.set(c.id,{signature,failures});this.capMap(this.readFailures);this.capMap(this.passFailures);
        if(this.host){
          journal[key]={signature,state:'retry',failures,retryAt:this.now()+Math.min(30*60000,30000*2**Math.min(failures-1,6))};dirty=true;}
      }
      await yieldToLiveRequests();
    }
    // Usage records remain atomic per conversation. A crash only revalidates
    // this bounded slice; do not rewrite the whole checkpoint after every ID.
    if(dirty){
      const preferred=[...new Set([...candidates.keys(),...this.passSeen,...this.fullRemaining.keys()])].map(hash);
      const saved=await this.ledger.saveBackfillState(scope,this.host,journal,{preferred,isCurrent:current});
      if(!current())return {current};if(saved)journal=saved;if(completePass)this.fullJournal=journal;
    }
    if(completePass){this.fullMissing=missing;if(this.fullRemaining.size>0)more=true;else this.fullJournal=null;}
    const confirmed=[...this.passFailures].filter(id=>(journal[hash(id)]?.failures||this.readFailures.get(id)?.failures||0)>=2).length;
    return {current,missing:missing+this.passFailures.size,confirmed,retrying:missing+this.passFailures.size-confirmed,more,partial};
  }
  async snapshot({sync=true}={}){
    this.refreshLiveScope();
    if(!this.store.identity)return null;
    if(this.scope!==this.store.identity||this.scopeEpoch!==this.store.epoch){this.lastSync=0;this.status='waiting';this.missingConversations=0;this.confirmedMissingConversations=0;this.retryingConversations=0;if(this.pending)this.forceQueued=true;}
    if(sync&&this.now()-this.lastSync>60000&&!this.continuation)void this.sync();
    const scope=this.store.identity,epoch=this.store.epoch,current=()=>!this.disposed&&this.owns()&&scope===this.store.identity&&epoch===this.store.epoch;
    const value=await this.ledger.summary(scope,Date.now(),{isCurrent:current});if(!current())return null;
    const syncing=this.syncing||!!this.continuation||!!this.ledger.diskSummaryPending||!!this.ledger.diskWrites||value?.summaryStale===true;
    return {...value,syncing,status:syncing?'syncing':this.status,missingConversations:this.missingConversations,confirmedMissingConversations:this.confirmedMissingConversations,retryingConversations:this.retryingConversations,persistenceError:this.store.usagePersistenceError===true||this.ledger.diskSummaryError===true};
  }
  dispose(){this.disposed=true;this.forceQueued=false;clearTimeout(this.continuation);this.continuation=null;clearTimeout(this.liveRecoveryTimer);this.liveRecoveryTimer=null;this.refreshLiveScope();this.fullRemaining.clear();this.fullJournal=null;}
}
