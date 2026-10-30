// Disk-backed exact statistics. Run only inside the bounded background worker.
import {DatabaseSync} from 'node:sqlite';
import {trajectoryMetrics} from './metrics.mjs';
import {usageRecords} from './usage.mjs';
import {taskRecords,mergeTaskRecords} from './task-usage.mjs';
import {delegatedIds} from './delegation.mjs';
const encodeSample=s=>JSON.stringify({...s,tps:typeof s.tps==='number'&&!Number.isFinite(s.tps)?String(s.tps):s.tps});
const decodeSample=text=>{const s=JSON.parse(text);if(['Infinity','-Infinity','NaN'].includes(s.tps))s.tps=Number(s.tps);return s;};
class Sequence {
 constructor(factory){this.factory=factory;}
 [Symbol.iterator](){return this.factory();}
 *entries(){let i=0;for(const value of this)yield [i++,value];}
 get length(){let n=0;for(const value of this)n++;return n;}
 filter(fn){const source=this;return new Sequence(function*(){let i=0;for(const v of source)if(fn(v,i++))yield v;});}
 map(fn){const source=this;return new Sequence(function*(){let i=0;for(const v of source)yield fn(v,i++);});}
 reduce(fn,value){let i=0;for(const v of this)value=fn(value,v,i++);return value;}
 every(fn){for(const v of this)if(!fn(v))return false;return true;}
 some(fn){for(const v of this)if(fn(v))return true;return false;}
 at(i){if(i<0)i=this.length+i;let n=0;for(const v of this)if(n++===i)return v;return undefined;}
}
export class DiskStatistics {
 constructor({file,conversationId,maxBytes=256*1024*1024,isCurrent=()=>true,onProgress=()=>{},yieldEvery=128}={}){
  this.id=conversationId;this.current=isCurrent;this.progress=onProgress;this.every=yieldEvery;this.work=0;this.maxBytes=maxBytes;
  this.db=new DatabaseSync(file);this.db.exec(`PRAGMA journal_mode=DELETE; PRAGMA synchronous=NORMAL; PRAGMA temp_store=FILE; PRAGMA cache_size=-2048; PRAGMA mmap_size=0; PRAGMA max_page_count=${Math.max(32,Math.floor(maxBytes/4096))};
CREATE TABLE IF NOT EXISTS steps(i INTEGER PRIMARY KEY,j TEXT NOT NULL); CREATE TABLE IF NOT EXISTS generators(i INTEGER PRIMARY KEY,j TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS samples(i INTEGER PRIMARY KEY,j TEXT NOT NULL,profile TEXT,rate REAL,duration REAL,eligible INTEGER);
CREATE INDEX IF NOT EXISTS sample_profile ON samples(profile,eligible,rate);
CREATE TABLE IF NOT EXISTS identities(id TEXT PRIMARY KEY,signature TEXT,seq INTEGER);
CREATE TABLE IF NOT EXISTS usage(id TEXT PRIMARY KEY,j TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,j TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS intervals(a REAL,b REAL); CREATE INDEX IF NOT EXISTS interval_start ON intervals(a,b);
CREATE TABLE IF NOT EXISTS deviations(v REAL); CREATE INDEX IF NOT EXISTS deviation_value ON deviations(v);`);
  this.stmts=new Map();this.countCache={steps:this.db.prepare('SELECT count(*) n FROM steps').get().n,generators:this.db.prepare('SELECT count(*) n FROM generators').get().n};this.sampleCount=0;this.inTransaction=false;this.pendingWrites=0;this.sleeper=new Int32Array(new SharedArrayBuffer(4));
 }
 statement(sql){let s=this.stmts.get(sql);if(!s){s=this.db.prepare(sql);this.stmts.set(sql,s);}return s;}
 tick(){if(!this.current())throw Error('Background statistics cancelled');if(++this.work%this.every===0){Atomics.wait(this.sleeper,0,0,2);this.progress({processed:this.work});}}
 // Node 22.13-22.15 has node:sqlite but lacks isTransaction. Our own
 // transaction flag is authoritative there; modern runtimes additionally
 // report SQLite's automatic rollback after errors such as SQLITE_FULL.
 rollback(){
  if(this.inTransaction){try{this.db.exec('ROLLBACK');}catch{/* SQLite may already have rolled back. */}}
  this.inTransaction=false;this.pendingWrites=0;
  try{for(const table of ['steps','generators'])this.countCache[table]=this.statement(`SELECT count(*) n FROM ${table}`).get().n;}catch{/* Preserve the original SQLite error. */}
 }
 flush(){
  if(this.inTransaction){
   try{if(this.db.isTransaction!==false)this.db.exec('COMMIT');}
   catch(error){this.rollback();throw error;}
   this.inTransaction=false;
  }
  this.pendingWrites=0;
 }
 begin(){if(!this.inTransaction){this.db.exec('BEGIN');this.inTransaction=true;}}
 addStep(i,item){this.add('steps',i,item);}
 addGenerator(i,item){this.add('generators',i,item);}
 add(table,i,item){
  this.tick();if(!Number.isSafeInteger(i)||i<0)throw Error('Invalid statistics index');const j=JSON.stringify(item);if(Buffer.byteLength(j)>8*1024*1024)throw Error('Background statistics record too large');
  try{this.begin();const existed=i<this.countCache[table]&&this.statement(`SELECT 1 FROM ${table} WHERE i=?`).get(i);this.statement(`INSERT OR REPLACE INTO ${table}(i,j) VALUES(?,?)`).run(i,j);if(!existed)this.countCache[table]++;if(++this.pendingWrites>=256)this.flush();}
  catch(error){this.rollback();throw error;}
 }
 counts(){return {...this.countCache};}
 truncate(kind,from){const table=kind==='steps'?'steps':kind==='generators'?'generators':null;if(!table||!Number.isSafeInteger(from)||from<0)throw Error('Invalid truncate');this.statement(`DELETE FROM ${table} WHERE i>=?`).run(from);this.countCache[table]=this.statement(`SELECT count(*) n FROM ${table}`).get().n;}
 sequence(table){const self=this,seq=new Sequence(function*(){for(const row of self.statement(`SELECT j FROM ${table} ORDER BY i`).iterate()){self.tick();yield table==='samples'?decodeSample(row.j):JSON.parse(row.j);}});Object.defineProperty(seq,'length',{get:()=>table==='samples'?self.sampleCount:self.countCache[table]});return seq;}
 stepProxy(){const seq=this.sequence('steps'),self=this;return new Proxy([],{get(target,key){if(key==='length')return self.counts().steps;if(typeof key==='string'&&/^\d+$/.test(key)){const row=self.statement('SELECT j FROM steps WHERE i=?').get(Number(key));return row?JSON.parse(row.j):undefined;}const value=seq[key];return typeof value==='function'?value.bind(seq):value;}});}
 samplePut(i,value){const eligible=value.reasons.length===0&&value.duration>=1&&value.tps>0?1:0;this.statement('INSERT OR REPLACE INTO samples VALUES(?,?,?,?,?,?)').run(i,encodeSample(value),value.profile,Number.isFinite(value.tps)?value.tps:null,value.duration,eligible);}
 median(table,where='',params=[]){const n=this.statement(`SELECT count(*) n FROM ${table} ${where}`).get(...params).n;if(!n)return null;const column=table==='samples'?'rate':'v';const values=this.statement(`SELECT ${column} v FROM ${table} ${where} ORDER BY ${column} LIMIT ? OFFSET ?`).all(...params,n%2?1:2,Math.floor((n-1)/2));return values.length===1?values[0].v:(values[0].v+values[1].v)/2;}
 classify(){
  this.db.exec('CREATE TABLE IF NOT EXISTS limits(profile TEXT PRIMARY KEY,v REAL);DELETE FROM limits;');
  for(const row of this.statement('SELECT DISTINCT profile FROM samples WHERE eligible=1').iterate()){
   this.tick();const n=this.statement('SELECT count(*) n FROM samples WHERE profile=? AND eligible=1').get(row.profile).n;if(n<5)continue;
   const center=this.median('samples','WHERE profile=? AND eligible=1',[row.profile]);this.db.exec('DELETE FROM deviations');
   this.statement('INSERT INTO deviations SELECT abs(rate-?) FROM samples WHERE profile=? AND eligible=1').run(center,row.profile);
   const mad=this.median('deviations');this.statement('INSERT INTO limits VALUES(?,?)').run(row.profile,Math.max(center*8,center+12*mad));
  }
  for(const row of this.statement('SELECT i,j FROM samples ORDER BY i').iterate()){
   this.tick();const s=decodeSample(row.j),limit=this.statement('SELECT v FROM limits WHERE profile=?').get(s.profile)?.v;
   if(!Number.isFinite(s.tps)&&s.duration>0&&s.responseTokens!==null)s.reasons.push('nonfinite-rate');
   if(s.duration>0&&s.duration<1&&s.responseTokens>0&&s.toolOnly&&s.ttft>=2&&s.ttft/s.duration>=20)s.reasons.push('short-tool-window');
   s.outlier=limit!==undefined&&s.tps>limit;if(s.outlier&&s.duration<1&&!s.reasons.length)s.reasons.push('short-outlier');
   s.status=s.reasons.length?'unreliable':s.responseTokens===null||!(s.duration>0)?'missing':'ok';this.samplePut(row.i,s);
  }
 }
 toolSeconds(){let start=null,end=null,total=0;for(const {a,b} of this.statement('SELECT a,b FROM intervals ORDER BY a,b').iterate()){this.tick();if(start===null){start=a;end=b;}else if(a<=end)end=Math.max(end,b);else{total+=end-start;start=a;end=b;}}return (total+(start===null?0:end-start))/1000;}
 finish({status=null,numTotalSteps,numTotalGeneratorMetadata}={}){
  this.tick();this.flush();this.begin();
  try{
  this.sampleCount=0;this.db.exec('DELETE FROM samples;DELETE FROM identities;DELETE FROM usage;DELETE FROM tasks;DELETE FROM intervals;DELETE FROM deviations;');
  const counts=this.counts();
  for(const [table,n]of [['steps',counts.steps],['generators',counts.generators]]){const max=this.statement(`SELECT max(i) m FROM ${table}`).get().m;if(n&&max!==n-1)throw Error('Incomplete background record indices');}
  if(numTotalSteps!==undefined&&numTotalSteps!==counts.steps||numTotalGeneratorMetadata!==undefined&&numTotalGeneratorMetadata!==counts.generators)throw Error('Incomplete background statistics');
  const links=new Set(),steps=this.stepProxy();
  for(const step of this.sequence('steps')){
   for(const id of delegatedIds(this.id,{trajectory:{steps:[step]}})){if(links.size<128)links.add(id);}
   if(/SEARCH_WEB|BROWSE|RUN_COMMAND|COMMAND|READ|WRITE|EDIT|CODE_ACTION|TOOL|MCP|LIST|GREP|VIEW|FIND|TERMINAL/i.test(String(step.type||''))||step.metadata?.toolCall){const a=Date.parse(step.metadata?.startedAt||step.metadata?.createdAt),b=Date.parse(step.metadata?.completedAt);if(Number.isFinite(a)&&Number.isFinite(b)&&b>=a)this.statement('INSERT INTO intervals VALUES(?,?)').run(a,b);}
  }
  for(const row of this.statement('SELECT i,j FROM generators ORDER BY i').iterate()){
   this.tick();const g=JSON.parse(row.j);if((g.stepIndices||[]).some(i=>Number.isInteger(i)&&i>=counts.steps))throw Error('Incomplete step associations');
   const gens=new Proxy([g],{get(target,key){if(key==='entries')return function*(){yield [row.i,g];};return Reflect.get(target,key);}});
   const raw={trajectory:{steps,generatorMetadata:gens}};
   for(const u of usageRecords(raw,this.id)){const old=this.statement('SELECT j FROM usage WHERE id=?').get(u.id);const total=r=>['uncached','cacheRead','cacheWrite','output'].reduce((n,k)=>n+(r[k]??0),0);if(!old||total(u)>total(JSON.parse(old.j)))this.statement('INSERT INTO usage VALUES(?,?) ON CONFLICT(id) DO UPDATE SET j=excluded.j').run(u.id,JSON.stringify(u));}
   for(const t of taskRecords(raw,this.id)){const old=this.statement('SELECT j FROM tasks WHERE id=?').get(t.id);const merged=mergeTaskRecords([],old?[JSON.parse(old.j),t]:[t]).rows[0];this.statement('INSERT INTO tasks VALUES(?,?) ON CONFLICT(id) DO UPDATE SET j=excluded.j').run(t.id,JSON.stringify(merged));}
  }
  const self=this,samples=this.sequence('samples');samples.push=value=>{const i=self.sampleCount++;self.samplePut(i,value);};
  const ids={has:id=>!!self.statement('SELECT 1 FROM identities WHERE id=?').get(id),get(id){const r=self.statement('SELECT signature,seq,j FROM identities JOIN samples ON seq=i WHERE id=?').get(id);return r?{signature:r.signature,sample:decodeSample(r.j)}:undefined;},set(id,value){const old=self.statement('SELECT seq FROM identities WHERE id=?').get(id);if(old)self.samplePut(old.seq,value.sample);else self.statement('INSERT INTO identities VALUES(?,?,?)').run(id,value.signature,samples.length-1);},get size(){return self.statement('SELECT count(*) n FROM identities').get().n;}};
  const metrics=trajectoryMetrics({trajectory:{cascadeId:this.id,steps,generatorMetadata:this.sequence('generators')},status,numTotalSteps:counts.steps,numTotalGeneratorMetadata:counts.generators},{samples,ids,classify:()=>this.classify(),toolSeconds:()=>this.toolSeconds(),lastChat:()=>{for(const row of this.statement('SELECT j FROM generators ORDER BY i DESC').iterate()){this.tick();const g=JSON.parse(row.j);if(g.chatModel)return g.chatModel;}return null;}});
  this.flush();return {metrics,delegatedIds:[...links]};
  }catch(error){this.rollback();throw error;}
 }
 *iterateUsageRecords(){for(const row of this.statement('SELECT j FROM usage ORDER BY rowid').iterate()){this.tick();yield JSON.parse(row.j);}}
 *iterateTaskRecords(){for(const row of this.statement('SELECT j FROM tasks ORDER BY rowid').iterate()){this.tick();yield JSON.parse(row.j);}}
 close(){this.flush();this.stmts.clear();this.db.close();}
}
