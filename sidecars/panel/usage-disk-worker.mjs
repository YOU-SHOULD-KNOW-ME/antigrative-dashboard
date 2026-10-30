// Only numeric usage records enter this worker. It never publishes ledger files.
import {parentPort,workerData} from 'node:worker_threads';
import {DatabaseSync} from 'node:sqlite';
import {createReadStream} from 'node:fs';
import {lstat,stat,readdir,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {TrajectoryJson} from './trajectory-json.mjs';
import {dateKey,weekStart} from './usage.mjs';
const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:workerData.timeZone||'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'});
const recordDate=time=>{const parts=formatter.formatToParts(time),get=k=>parts.find(p=>p.type===k).value;return get('year')+'-'+get('month')+'-'+get('day');};
const keys=['uncached','cacheRead','cacheWrite','output'],HASH=/^[a-f0-9]{64}$/;
const total=r=>keys.reduce((n,k)=>n+(r[k]??0),0);
const valid=r=>r&&HASH.test(r.id)&&typeof r.model==='string'&&r.model.length<=120&&(r.at===null||Number.isSafeInteger(r.at)&&r.at>=0)&&keys.every(k=>r[k]===null||Number.isSafeInteger(r[k])&&r[k]>=0);
const budget=256*1024*1024,cancel=new Int32Array(workerData.cancel),sleeper=new Int32Array(new SharedArrayBuffer(4));let operations=0;
function check(){if(Atomics.load(cancel,0))throw Error('Usage operation cancelled');if(++operations%128===0)Atomics.wait(sleeper,0,0,2);}
function database(file){const db=new DatabaseSync(file);db.exec('PRAGMA journal_mode=DELETE;PRAGMA synchronous=FULL;PRAGMA temp_store=FILE;PRAGMA cache_size=-2048;PRAGMA mmap_size=0;PRAGMA max_page_count=65536;CREATE TABLE records(id TEXT PRIMARY KEY,j TEXT NOT NULL);CREATE TABLE meta(account TEXT NOT NULL);');db.prepare('INSERT INTO meta VALUES(?)').run(workerData.scope);return db;}
async function rows(file,accept,{job=false}={}){
 check();if((await lstat(file)).isSymbolicLink())throw Error('Linked usage source rejected');const info=await stat(file);if(info.size>budget)throw Error('Usage source exceeds disk budget');
 if(file.endsWith('.json')){
  const fields=Object.fromEntries(['id','at','model',...keys,'partial','timeBasis'].map(k=>[k,'scalar']));
  const parser=new TrajectoryJson({projection:{schema:'scalar',account:'scalar',records:{'*':fields}},recordKeys:['records'],onRecord:(kind,i,row)=>{check();if(!valid(row))throw Error('Invalid usage record');accept(row);}});
  for await(const chunk of createReadStream(file,{encoding:'utf8',highWaterMark:16384})){check();parser.write(chunk);}
  const value=parser.end();if(value.schema!==1||value.account!==workerData.scope)throw Error('Invalid usage account');
 }else{
  const db=new DatabaseSync(file,{readOnly:true});try{
   if(!job&&db.prepare('SELECT account FROM meta').get()?.account!==workerData.scope)throw Error('Invalid usage account');
   for(const row of db.prepare(job?'SELECT j FROM usage ORDER BY rowid':'SELECT j FROM records ORDER BY rowid').iterate()){check();const value=JSON.parse(row.j);if(!valid(value))throw Error('Invalid usage record');accept(value);}
  }finally{db.close();}
 }
}
// Apply precisely the same sparse-field merge used by the legacy JSON ledger.
function mergedRecord(row,old){const record={...row,at:row.at??old?.at??null,timeBasis:row.at===null&&old?.at!==null&&old?.at!==undefined?old.timeBasis:row.timeBasis};for(const key of keys)record[key]=row[key]??old?.[key]??null;return record;}
async function unchangedDiskRows(){
 // A JSON predecessor still needs migration, even if its rows happen to match.
 // Streaming a full background job twice is intentionally avoided here; this
 // fast path is for the bounded normal-session row array on repeat polling.
 if(!workerData.previous?.endsWith('.sqlite')||!Array.isArray(workerData.records))return false;
 if((await lstat(workerData.previous)).isSymbolicLink())throw Error('Linked usage source rejected');
 const info=await stat(workerData.previous);if(info.size>budget)throw Error('Usage source exceeds disk budget');
 const previous=new DatabaseSync(workerData.previous,{readOnly:true});try{
  if(previous.prepare('SELECT account FROM meta').get()?.account!==workerData.scope)throw Error('Invalid usage account');
  const get=previous.prepare('SELECT j FROM records WHERE id=?');
  for(const row of workerData.records){check();if(!valid(row))throw Error('Invalid usage record');const saved=get.get(row.id);if(!saved)return false;const old=JSON.parse(saved.j);if(!valid(old))throw Error('Invalid usage record');if(JSON.stringify(mergedRecord(row,old))!==JSON.stringify(old))return false;}
  return true;
 }finally{previous.close();}
}
async function merge(){
 if(await unchangedDiskRows())return {changed:false};
 const db=database(workerData.staging);try{
  const put=db.prepare('INSERT INTO records VALUES(?,?) ON CONFLICT(id) DO UPDATE SET j=excluded.j'),get=db.prepare('SELECT j FROM records WHERE id=?');
  const mergeRow=row=>{check();const value=get.get(row.id),old=value?JSON.parse(value.j):null;put.run(row.id,JSON.stringify(mergedRecord(row,old)));};
  db.exec('BEGIN');
  if(workerData.previous)await rows(workerData.previous,mergeRow);
  if(workerData.jobDb)await rows(workerData.jobDb,mergeRow,{job:true});
  else for(const row of workerData.records||[]){if(!valid(row))throw Error('Invalid usage record');mergeRow(row);}
  check();db.exec('COMMIT');return {changed:true,records:db.prepare('SELECT count(*) n FROM records').get().n};
 }finally{db.close();}
}
async function summarize(){
 const db=database(workerData.staging);try{
  const put=db.prepare('INSERT INTO records VALUES(?,?) ON CONFLICT(id) DO UPDATE SET j=excluded.j'),get=db.prepare('SELECT j FROM records WHERE id=?');
  const names=(await readdir(workerData.directory)).filter(n=>/^[a-f0-9]{64}\.(json|sqlite)$/.test(n));const disks=new Set(names.filter(n=>n.endsWith('.sqlite')).map(n=>n.slice(0,-7)));let unreadable=0;
  for(const name of names){if(name.endsWith('.json')&&disks.has(name.slice(0,-5)))continue;check();db.exec('SAVEPOINT source');try{await rows(join(workerData.directory,name),row=>{const previous=get.get(row.id);if(!previous||total(row)>total(JSON.parse(previous.j)))put.run(row.id,JSON.stringify(row));});db.exec('RELEASE source');}catch(e){db.exec('ROLLBACK TO source;RELEASE source');check();unreadable++;}}
  db.exec('BEGIN;CREATE TABLE buckets(day TEXT,model TEXT,uncached INTEGER,cacheRead INTEGER,cacheWrite INTEGER,output INTEGER,total INTEGER,requests INTEGER,PRIMARY KEY(day,model));CREATE TABLE models(model TEXT PRIMARY KEY);');
  const bucket=db.prepare('INSERT INTO buckets VALUES(?,?,?,?,?,?,?,1) ON CONFLICT(day,model) DO UPDATE SET uncached=uncached+excluded.uncached,cacheRead=cacheRead+excluded.cacheRead,cacheWrite=cacheWrite+excluded.cacheWrite,output=output+excluded.output,total=total+excluded.total,requests=requests+1');
  const model=db.prepare('INSERT OR IGNORE INTO models VALUES(?)');let unknownTokens=0,unknownRequests=0,partialRequests=0;
  for(const {j} of db.prepare('SELECT j FROM records ORDER BY rowid').iterate()){check();const r=JSON.parse(j);model.run(r.model);if(r.partial)partialRequests++;if(r.at===null){unknownTokens+=total(r);unknownRequests++;continue;}bucket.run(recordDate(r.at),r.model,...keys.map(k=>r[k]??0),total(r));}
  db.exec('COMMIT');
  const days=[],models=[];let used=0;
  for(const row of db.prepare('SELECT * FROM buckets ORDER BY day,model').iterate()){check();used+=Buffer.byteLength(JSON.stringify(row));if(used>4*1024*1024)throw Error('Usage summary exceeds result budget');let day=days.at(-1);if(day?.date!==row.day){day={date:row.day,models:{}};days.push(day);}const {day:_,model,...values}=row;Object.defineProperty(day.models,model,{value:values,enumerable:true,configurable:true,writable:true});}
  for(const {model} of db.prepare('SELECT model FROM models ORDER BY model').iterate()){used+=Buffer.byteLength(model);if(used>4*1024*1024)throw Error('Usage summary exceeds result budget');models.push(model);}
  const now=workerData.now,today=dateKey(now,workerData.timeZone),sumDay=d=>Object.values(d.models).reduce((n,r)=>n+r.total,0);
  return {accountKey:workerData.scope,timeZone:workerData.timeZone,today,days,models,todayTokens:days.filter(d=>d.date===today).reduce((n,d)=>n+sumDay(d),0),weekTokens:days.filter(d=>d.date>=weekStart(today)&&d.date<=today).reduce((n,d)=>n+sumDay(d),0),monthTokens:days.filter(d=>d.date.slice(0,7)===today.slice(0,7)&&d.date<=today).reduce((n,d)=>n+sumDay(d),0),totalTokens:days.reduce((n,d)=>n+sumDay(d),0)+unknownTokens,unknownTokens,unknownRequests,partialRequests,unreadableFiles:unreadable,requests:db.prepare('SELECT count(*) n FROM records').get().n,firstDate:days[0]?.date||null,updatedAt:new Date(now).toISOString(),source:workerData.source};
 }finally{db.close();await unlink(workerData.staging).catch(()=>{});}
}
try{const result=workerData.action==='merge'?await merge():await summarize();parentPort.postMessage({ok:true,result});}catch{parentPort.postMessage({ok:false,error:'Usage disk processing failed'});}
