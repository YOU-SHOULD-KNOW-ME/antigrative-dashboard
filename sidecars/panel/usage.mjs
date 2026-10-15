// Local usage ledger. Never stores prompts, credentials or raw request IDs.
import {readFile,writeFile,mkdir,rename,readdir,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {tokenCount,requestCacheMetrics} from './metrics.mjs';
import {platformPaths} from '../../compat/platform.mjs';
import {discoverLocalConversations,conversationId} from './local-conversations.mjs';
import {setImmediate as yieldToLiveRequests} from 'node:timers/promises';
const HASH=/^[a-f0-9]{64}$/,GUID=/^[a-f0-9-]{36}$/i;
const hash=value=>createHash('sha256').update(value).digest('hex');
const keys=['uncached','cacheRead','cacheWrite','output'];
const cleanModel=value=>String(value||'Unknown').replace(/[\x00-\x1f\x7f]/g,'').slice(0,120);
const stamp=value=>typeof value==='string'&&/^20\d\d-\d\d-\d\dT/.test(value)&&Number.isFinite(Date.parse(value))?Date.parse(value):null;
const sum=r=>keys.reduce((n,k)=>n+(r[k]??0),0);
export function dateKey(time,zone='Asia/Shanghai'){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(time);
  const get=key=>parts.find(p=>p.type===key).value;return `${get('year')}-${get('month')}-${get('day')}`;
}
export function usageRecords(raw,conversationId){
  const trajectory=raw?.trajectory||{},rows=new Map(),steps=trajectory.steps||[];
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
    if(!old||sum(row)>sum(old))rows.set(row.id,row);
  }
  return [...rows.values()];
}
const validRow=r=>r&&HASH.test(r.id)&&typeof r.model==='string'&&r.model.length<=120&&
  (r.at===null||Number.isSafeInteger(r.at)&&r.at>=0)&&keys.every(k=>r[k]===null||Number.isSafeInteger(r[k])&&r[k]>=0);
export class UsageLedger{
  constructor(directory=join(platformPaths().data,'usage-v1'),{timeZone='Asia/Shanghai',source='desktop-local'}={}){this.directory=directory;this.timeZone=timeZone;this.source=source;}
  queue=Promise.resolve();revision=0;cache=null;
  async backfillState(scope,host){
    if(!HASH.test(scope)||!['app','ide'].includes(host))throw Error('Invalid backfill scope');
    await this.queue.catch(()=>{});
    try{
      const content=await readFile(join(this.directory,scope,'backfill-v1.json'),'utf8');
      if(content.length>8*1024*1024)return {};
      const value=JSON.parse(content);
      if(value.schema!==1||value.account!==scope||value.host!==host||!value.entries||typeof value.entries!=='object'||Array.isArray(value.entries))return {};
      return Object.fromEntries(Object.entries(value.entries).filter(([id,e])=>HASH.test(id)&&e&&HASH.test(e.signature)&&['complete','retry'].includes(e.state)&&Number.isSafeInteger(e.failures)&&e.failures>=0&&Number.isSafeInteger(e.retryAt)&&e.retryAt>=0));
    }catch(e){if(e.code==='ENOENT'||e instanceof SyntaxError)return {};throw e;}
  }
  saveBackfillState(scope,host,entries){
    if(!HASH.test(scope)||!['app','ide'].includes(host))throw Error('Invalid backfill scope');
    const file=join(this.directory,scope,'backfill-v1.json');
    const pending=this.queue.catch(()=>{}).then(async()=>{
      await mkdir(join(this.directory,scope),{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';
      try{await writeFile(temp,JSON.stringify({schema:1,account:scope,host,entries}),{mode:0o600});await rename(temp,file);}
      catch(e){await unlink(temp).catch(()=>{});throw e;}
    });this.queue=pending;return pending;
  }
  file(scope,id){if(!HASH.test(scope)||!GUID.test(id))throw Error('Invalid usage scope');return join(this.directory,scope,hash(id.toLowerCase())+'.json');}
  ingest(scope,id,raw){
    if(!scope)return Promise.resolve();
    const rows=usageRecords(raw,id),file=this.file(scope,id);
    const pending=this.queue.catch(()=>{}).then(async()=>{
      let previous;try{previous=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw Error('Usage ledger cannot be read');}
      if(previous&&(previous.schema!==1||previous.account!==scope||!Array.isArray(previous.records)||!previous.records.every(validRow)))throw Error('Invalid usage ledger');
      const merged=new Map((previous?.records||[]).map(r=>[r.id,r]));
      for(const row of rows){const old=merged.get(row.id),record={...row,at:row.at??old?.at??null,timeBasis:row.at===null&&old?.at!==null&&old?.at!==undefined?old.timeBasis:row.timeBasis};for(const key of keys)record[key]=row[key]??old?.[key]??null;merged.set(row.id,record);}
      const records=[...merged.values()].sort((a,b)=>a.id.localeCompare(b.id));
      if(previous&&JSON.stringify(previous.records)===JSON.stringify(records))return;
      await mkdir(join(this.directory,scope),{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';
      try{await writeFile(temp,JSON.stringify({schema:1,account:scope,records}),{mode:0o600});await rename(temp,file);}
      catch(e){await unlink(temp).catch(()=>{});throw e;}
      this.revision++;this.cache=null;
    });this.queue=pending;return pending;
  }
  async summary(scope,now=Date.now()){
    await this.queue.catch(()=>{});
    if(!scope||!HASH.test(scope))return null;
    const today=dateKey(now,this.timeZone),cacheKey=scope+':'+today;
    if(this.cache?.key===cacheKey&&this.cache.revision===this.revision)return this.cache.value;
    const daily=new Map(),models=new Set(),seen=new Map();let unreadable=0,unknownTokens=0,unknownRequests=0,partialRequests=0;
    let files=[];try{files=await readdir(join(this.directory,scope));}catch(e){if(e.code!=='ENOENT')throw e;}
    for(const name of files.filter(name=>/^[a-f0-9]{64}\.json$/.test(name))){
      try{
        const text=await readFile(join(this.directory,scope,name),'utf8');if(text.length>16*1024*1024)throw Error('Ledger too large');
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
    this.cache={key:cacheKey,revision:this.revision,value};return value;
  }
}
export function weekStart(date){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);}

export class DesktopUsage{
  constructor(store,ledger=new UsageLedger(),{host=null,discoverLocal=null,owns=()=>true,now=Date.now,sliceMs=3000,continueDelay=250}={}){
    this.store=store;this.ledger=ledger;this.fingerprints=new Map();this.host=host;this.owns=owns;this.now=now;
    this.discoverLocal=discoverLocal||(()=>host?discoverLocalConversations({host}):Promise.resolve({conversations:[],errors:0}));
    this.sliceMs=sliceMs;this.continueDelay=continueDelay;this.fullRemaining=new Set();this.passSeen=new Set();this.passFailures=new Set();this.readFailures=new Map();
  }
  syncing=false;lastSync=0;status='waiting';missingConversations=0;confirmedMissingConversations=0;retryingConversations=0;scope=null;scopeEpoch=null;forceQueued=false;disposed=false;continuation=null;
  async ingest(scope,id,raw){await this.ledger.ingest(scope,id,raw);}
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
      this.status=result.more?'syncing':result.missing?'partial':'ready';
      if(result.more){this.continuation=setTimeout(()=>void this.sync(),this.continueDelay);this.continuation.unref?.();}
    })().catch(()=>{this.status='offline';this.lastSync=this.now();}).finally(()=>{this.syncing=false;this.pending=null;});return this.pending;
  }
  async runSync(forceFull){
    const scope=this.store.identity,epoch=this.store.epoch;
    const current=()=>!this.disposed&&this.owns()&&scope===this.store.identity&&epoch===this.store.epoch;
    if(!scope)return null;
    if(this.scope!==scope||this.scopeEpoch!==epoch){this.scope=scope;this.scopeEpoch=epoch;this.fingerprints.clear();this.fullRemaining.clear();this.passSeen.clear();this.passFailures.clear();this.readFailures.clear();}
    let missing=0,listed=[];
    try{listed=await this.store.listConversations(true);}catch{missing++;}
    if(!current())return {current};
    const local=await this.discoverLocal();if(!current())return {current};missing+=local.errors||0;
    const journal=this.host?await this.ledger.backfillState(scope,this.host):{};
    const candidates=new Map();
    // Current conversations get priority over unloaded archives.
    for(const c of listed)if(conversationId.test(c.id))candidates.set(c.id.toLowerCase(),{id:c.id.toLowerCase(),listed:c});
    for(const c of local.conversations||[])if(conversationId.test(c.id)){
      const id=c.id.toLowerCase();candidates.set(id,{...candidates.get(id),...c,id});
    }
    if(forceFull){this.fullRemaining=new Set(candidates.keys());this.passSeen.clear();this.passFailures.clear();}
    const started=this.now();let processed=0,more=false,dirty=false;
    for(const c of candidates.values()){
      if(!current())return {current};
      const key=hash(c.id),s=c.listed,mark=JSON.stringify([s?.stepCount,s?.modifiedAt,s?.status,s?.lastUserInputStepIndex]);
      const signature=c.signature?hash(c.signature+mark):hash(mark),old=journal[key];
      const unchanged=old?.signature===signature;
      const forced=this.fullRemaining.has(c.id);
      if(!forced&&this.passSeen.has(c.id))continue;
      if(!forced&&unchanged&&old.state==='retry'&&old.retryAt>this.now()){this.passFailures.add(c.id);continue;}
      const cached=s&&this.fingerprints.get(c.id)===mark&&!/RUNNING/.test(s.status||'');
      // A persisted checkpoint already verified both disk and host revision.
      // Restarting the collector alone must not force all settled chats to load.
      const settled=s?.modifiedAt&&/IDLE|DONE|COMPLETED|CANCELLED|CANCELED|STOPPED|FAILED|ERROR/.test(String(s.status||''));
      if(!forced&&(c.signature?unchanged&&old.state==='complete'&&(!s||cached||settled):cached))continue;
      if(processed&&this.now()-started>=this.sliceMs){more=true;break;}
      processed++;
      this.passSeen.add(c.id);
      this.fullRemaining.delete(c.id);
      try{
        // An independently discovered ID has no summary. An empty summary
        // intentionally reads steps until EOF; the shared reader still enforces
        // pagination, revision checks, memory budgets and a wall-time deadline.
        const summary=s?{stepCount:s.stepCount,lastModifiedTime:s.modifiedAt,status:s.status,lastUserInputStepIndex:s.lastUserInputStepIndex}:{};
        const raw=await this.store.client.trajectory(c.id,{summary,force:forced||!!c.signature,isCurrent:current});
        if(!current())return {current};
        if(!raw?.trajectory||!Array.isArray(raw.trajectory.steps)||!Array.isArray(raw.trajectory.generatorMetadata))throw Error('Incomplete historical statistics');
        if(!s&&!raw.trajectory.steps.length&&!raw.trajectory.generatorMetadata.length)throw Error('History not yet readable');
        await this.ingest(scope,c.id,raw);if(!current())return {current};
        const stable=!c.readSignature||await c.readSignature()===c.signature;
        if(!current())return {current};
        if(!stable)throw Error('History changed during import');
        this.fingerprints.set(c.id,mark);
        this.passFailures.delete(c.id);
        this.readFailures.delete(c.id);
        if(this.host&&c.signature){journal[key]={signature,state:'complete',failures:0,retryAt:0};dirty=true;}
      }catch{
        if(!current())return {current};this.passFailures.add(c.id);
        const failures=c.signature?(unchanged?(old?.failures||0)+1:1):(this.readFailures.get(c.id)||0)+1;
        this.readFailures.set(c.id,failures);
        if(this.host&&c.signature){
          journal[key]={signature,state:'retry',failures,retryAt:this.now()+Math.min(30*60000,30000*2**Math.min(failures-1,6))};dirty=true;}
      }
      // Save progress after every archive, so a restart doesn't lose the batch.
      if(dirty){await this.ledger.saveBackfillState(scope,this.host,journal);dirty=false;}
      await yieldToLiveRequests();
    }
    const confirmed=[...this.passFailures].filter(id=>(journal[hash(id)]?.failures||this.readFailures.get(id)||0)>=2).length;
    return {current,missing:missing+this.passFailures.size,confirmed,retrying:missing+this.passFailures.size-confirmed,more};
  }
  async snapshot(){
    if(!this.store.identity)return null;
    if(this.scope!==this.store.identity||this.scopeEpoch!==this.store.epoch){this.lastSync=0;this.status='waiting';this.missingConversations=0;this.confirmedMissingConversations=0;this.retryingConversations=0;if(this.pending)this.forceQueued=true;}
    if(this.now()-this.lastSync>60000&&!this.continuation)void this.sync();
    const scope=this.store.identity,value=await this.ledger.summary(scope);
    return scope===this.store.identity?{...value,syncing:this.syncing||!!this.continuation,status:this.status,missingConversations:this.missingConversations,confirmedMissingConversations:this.confirmedMissingConversations,retryingConversations:this.retryingConversations,persistenceError:this.store.usagePersistenceError===true}:null;
  }
  dispose(){this.disposed=true;this.forceQueued=false;clearTimeout(this.continuation);this.continuation=null;}
}
