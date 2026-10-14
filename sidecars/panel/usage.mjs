// Local usage ledger. Never stores prompts, credentials or raw request IDs.
import {readFile,writeFile,mkdir,rename,readdir,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {tokenCount,requestCacheMetrics} from './metrics.mjs';
import {platformPaths} from '../../compat/platform.mjs';
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
export function hourKey(time,zone='Asia/Shanghai'){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',hourCycle:'h23'}).formatToParts(time);
  return parseInt(parts.find(p=>p.type==='hour').value,10);
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
      const date=dateKey(r.at,this.timeZone);if(!daily.has(date))daily.set(date,{date,models:{},hours:{}});
      const day=daily.get(date);day.models[r.model]||={uncached:0,cacheRead:0,cacheWrite:0,output:0,total:0,requests:0};
      const bucket=day.models[r.model];for(const key of keys)bucket[key]+=r[key]??0;bucket.total+=sum(r);bucket.requests++;
      const h=hourKey(r.at,this.timeZone);day.hours[h]||={uncached:0,cacheRead:0,cacheWrite:0,output:0,total:0,requests:0,models:{}};
      const hBucket=day.hours[h];for(const key of keys)hBucket[key]+=r[key]??0;hBucket.total+=sum(r);hBucket.requests++;
      hBucket.models[r.model]||={uncached:0,cacheRead:0,cacheWrite:0,output:0,total:0,requests:0};
      const hmBucket=hBucket.models[r.model];for(const key of keys)hmBucket[key]+=r[key]??0;hmBucket.total+=sum(r);hmBucket.requests++;
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

import { PricingService } from './pricing.mjs';

export class DesktopUsage{
  constructor(store,ledger=new UsageLedger(),pricing=new PricingService(ledger.directory)){this.store=store;this.ledger=ledger;this.pricing=pricing;this.fingerprints=new Map();void this.pricing.init();}
  syncing=false;lastSync=0;status='waiting';missingConversations=0;scope=null;
  async ingest(scope,id,raw){await this.ledger.ingest(scope,id,raw);}
  sync(force=false,models=[]){
    if(force)void this.pricing.fetchCloud(models,true);
    if(this.pending)return this.pending;
    const syncScope=this.store.identity,syncEpoch=this.store.epoch;
    this.syncing=true;this.status='syncing';
    let timer;
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Usage sync timeout')),30000);timer?.unref?.();});
    const run=(async()=>{
      const scope=this.store.identity,epoch=this.store.epoch;if(!scope)return;
      const current=()=>scope===this.store.identity&&epoch===this.store.epoch;
      const conversations=await this.store.listConversations(true);let missing=0;
      for(const c of conversations){
        if(!current())return;
        const key=scope+':'+c.id,mark=c.modifiedAt+':'+c.status;
        if(this.fingerprints.get(key)===mark&&!/RUNNING/.test(c.status||''))continue;
        try{const raw=await this.store.client.trajectory(c.id,{summary:{stepCount:c.stepCount,lastModifiedTime:c.modifiedAt,status:c.status,lastUserInputStepIndex:c.lastUserInputStepIndex}});if(!current())return;await this.ingest(scope,c.id,raw);this.fingerprints.set(key,mark);}
        catch{missing++;}
      }
      if(current()){this.missingConversations=missing;this.status=missing?'partial':'ready';this.lastSync=Date.now();}
    })();
    this.pending=Promise.race([run,timeout]).catch(()=>{if(syncScope===this.store.identity&&syncEpoch===this.store.epoch)this.status='offline';})
      .finally(()=>{clearTimeout(timer);this.lastSync=syncScope===this.store.identity&&syncEpoch===this.store.epoch?Date.now():0;this.syncing=false;this.pending=null;});
    return this.pending;
  }
  async snapshot(){
    if(!this.store.identity)return null;
    if(this.scope!==this.store.identity){this.scope=this.store.identity;this.lastSync=0;this.status='waiting';this.missingConversations=0;}
    if(Date.now()-this.lastSync>60000)void this.sync();
    const scope=this.store.identity,value=await this.ledger.summary(scope);
    if(value?.models?.length)void this.pricing.fetchCloud(value.models,false);
    return scope===this.store.identity?{...value,syncing:this.syncing,status:this.status,missingConversations:this.missingConversations,persistenceError:this.store.usagePersistenceError===true,pricing:this.pricing.snapshot(value?.models)}:null;
  }
}
