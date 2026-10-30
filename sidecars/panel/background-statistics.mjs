// One low-priority worker; foreground snapshots never await a long acquisition.
import {Worker} from 'node:worker_threads';
import {mkdir,mkdtemp,rm,lstat,readdir} from 'node:fs/promises';
import {join,resolve,dirname,basename} from 'node:path';
const GUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,HASH=/^[a-f0-9]{64}$/;
export class BackgroundStatistics {
 constructor({directory,onComplete,owns=()=>true,workerFactory=(data)=>new Worker(new URL('./background-worker.mjs',import.meta.url),{workerData:data,resourceLimits:{maxOldGenerationSizeMb:96,maxYoungGenerationSizeMb:8,stackSizeMb:4}}),now=Date.now}={}){
  Object.assign(this,{directory:resolve(directory),onComplete,owns,workerFactory,now});this.jobs=new Map();this.active=null;this.epoch=0;this.disposed=false;
 }
 state(id){const j=this.jobs.get(id);return j?.state==='processing'?{state:'processing',code:'background-collection',stage:j.stage,processedSteps:j.steps,processedGenerators:j.generators}:j?.state==='failed'?{state:'limited',code:'budget-exceeded',reason:j.reason}:null;}
 request(scope,id,endpoint,{summary,isCurrent=()=>true}={}){
  if(this.disposed||!this.owns()||!HASH.test(scope)||!GUID.test(id)||!endpoint?.csrf||!Number.isInteger(endpoint.port))return false;
  const old=this.jobs.get(id);if(old&&old.scope===scope){if(old.state==='processing')return true;if(old.state==='failed'&&old.retryAt>this.now())return false;this.jobs.delete(id);}
  while(this.jobs.size>=8){const key=[...this.jobs].find(([,j])=>j!==this.active&&j.state!=='processing')?.[0];if(!key)return false;this.jobs.delete(key);}
  this.jobs.set(id,{id,scope,endpoint,summary,isCurrent,state:'processing',stage:'queued',steps:0,generators:0});void this.pump();return true;
 }
 async pump(){
  if(this.active||this.disposed||!this.owns())return;
  const job=[...this.jobs.values()].find(j=>j.state==='processing'&&j.stage==='queued');if(!job)return;
  this.active=job;const epoch=this.epoch;
  const scopeCurrent=()=>!this.disposed&&epoch===this.epoch&&this.owns()&&job.isCurrent()&&this.jobs.get(job.id)===job;
  // Cancellation must invalidate the guard also while onComplete is importing
  // usage. A watchdog or worker failure can occur after 'complete' is sent.
  const current=()=>scopeCurrent()&&(!job.cancel||Atomics.load(new Int32Array(job.cancel),0)===0);
  let directory,worker,watchdog;
  const fail=reason=>{job.state='failed';job.reason=reason;job.retryAt=this.now()+300000;};
  try{
   await mkdir(this.directory,{recursive:true,mode:0o700});if((await lstat(this.directory)).isSymbolicLink())throw Error('Unsafe scratch directory');
   // Abrupt exits may leave scratch files. Count, do not silently delete,
   // previous jobs; refuse new work before scratch space can grow unbounded.
   const previous=await readdir(this.directory,{withFileTypes:true});
   if(previous.length>64)throw Error('Scratch directory limit');
   let scratchBytes=0;
   for(const item of previous){
    if(!item.name.startsWith('job-'))continue;
    const dir=join(this.directory,item.name);if(!item.isDirectory()||item.isSymbolicLink())throw Error('Unsafe scratch entry');
    const files=await readdir(dir,{withFileTypes:true});if(files.length>16)throw Error('Unexpected scratch files');
    for(const file of files){if(!file.isFile()||file.isSymbolicLink())throw Error('Unsafe scratch file');scratchBytes+=(await lstat(join(dir,file.name))).size;}
   }
   if(scratchBytes>256*1024*1024)throw Error('Scratch disk budget');
   if(!current())return;directory=await mkdtemp(join(this.directory,'job-'));job.directory=directory;job.cancel=new SharedArrayBuffer(4);
   worker=this.workerFactory({directory,id:job.id,endpoint:job.endpoint,summary:job.summary,cancel:job.cancel});job.worker=worker;
   await new Promise((done,reject)=>{
    let completed=false,settled=false;
    const finish=(error)=>{
     if(settled)return;
     if(error){
      // First make the publishing guard false; any delayed async ledger write
      // must observe cancellation before the scratch database can be removed.
      if(scopeCurrent()&&job.state==='processing')fail(error.code==='BACKGROUND_TIMEOUT'?'timeout':'background-unavailable');
      if(job.cancel)Atomics.store(new Int32Array(job.cancel),0,1);
     }
     settled=true;clearInterval(watchdog);error?reject(error):done();
    };
    worker.on('message',message=>{
     if(!current())return;
     if(message.type==='progress'){job.stage=message.stage;job.steps=message.processedSteps;job.generators=message.processedGenerators;}
     if(message.type==='failed'){fail(message.code);finish(Object.assign(Error('Background worker failed'),{code:message.code}));}
     if(message.type==='complete'){
      completed=true;job.stage='publishing';
      Promise.resolve().then(()=>current()?this.onComplete(job.scope,job.id,message.result,{database:join(directory,'statistics.sqlite'),revision:message.revision,isCurrent:current}):undefined).then(()=>{if(current())job.state='ready';finish();},finish);
     }
    });
    worker.on('error',finish);
    worker.on('exit',code=>{if(!completed||code!==0)finish(Error('Background worker stopped'));});
    const started=this.now();watchdog=setInterval(()=>{
     if(!current()||this.now()-started>60*60*1000){
      const timeout=scopeCurrent()&&this.now()-started>60*60*1000;
      finish(Object.assign(Error('Background task cancelled'),{code:timeout?'BACKGROUND_TIMEOUT':'BACKGROUND_CANCELLED'}));
      void worker.terminate();
     }
    },500);watchdog.unref();
   });
  }catch{if(current())fail('background-unavailable');}
  finally{
   clearInterval(watchdog);if(worker)await worker.terminate().catch(()=>{});
   if(directory&&dirname(resolve(directory))===this.directory&&basename(directory).startsWith('job-'))await rm(directory,{recursive:true,force:true}).catch(()=>{});
   if(this.active===job)this.active=null;if(scopeCurrent()&&job.state==='processing')fail('background-unavailable');
   if(!scopeCurrent()&&this.jobs.get(job.id)===job)this.jobs.delete(job.id);
   if(!this.disposed)setTimeout(()=>void this.pump(),250).unref();
  }
 }
 reset(){this.epoch++;for(const j of this.jobs.values()){if(j.cancel)Atomics.store(new Int32Array(j.cancel),0,1);void j.worker?.terminate();}this.jobs.clear();}
 dispose(){this.disposed=true;this.reset();}
}
