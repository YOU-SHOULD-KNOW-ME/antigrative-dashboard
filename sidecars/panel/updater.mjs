// Manual updates only. Public release metadata is fetched by the bounded
// Python worker, which uses the user's existing proxy configuration.
import {readFile,mkdir,writeFile,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';

const progressPhases=new Set(['check','download','verify','extract','backup','install','recover','complete']);
function safeProgress(value){
 if(!value||!progressPhases.has(value.phase))return null;
 const result={phase:value.phase};
 if(value.phase==='download'&&Number.isSafeInteger(value.received)&&value.received>=0&&Number.isSafeInteger(value.total)&&value.total>0&&value.total<=64*1024*1024&&value.received<=value.total){result.received=value.received;result.total=value.total;}
 return result;
}
export async function runUpdateWorker(worker,args,{spawnImpl=spawn,platform=process.platform,onProgress=null}={}){
 const candidates=platform==='win32'?['python','py']:['python3','python'];
 for(const command of candidates){
  try{return await new Promise((resolve,reject)=>{
   const child=spawnImpl(command,[worker,...args],{stdio:['ignore','pipe','pipe'],windowsHide:true});
   let output='',overflow=false,settled=false;
   const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
   // A read-only check can be cancelled safely. Installation is not terminated
   // in the middle of a filesystem transaction; its network reads are bounded.
   const timer=args[0]==='check'?setTimeout(()=>{child.kill();finish(Error('network'));},30000):null;
   child.stdout.on('data',chunk=>{if(overflow)return;output+=chunk;if(output.length>32768){overflow=true;output='';if(args[0]==='check')child.kill();}});
   let progressLine='',discardProgress=false;
   child.stderr.on('data',chunk=>{
    for(const part of String(chunk).split(/(\n)/)){
     if(part==='\n'){
      if(!discardProgress){try{const value=JSON.parse(progressLine);if(value.event==='pulse-update-progress'){const progress=safeProgress(value);if(progress)onProgress?.(progress);}}catch{}}
      progressLine='';discardProgress=false;
     }else if(!discardProgress){if(progressLine.length+part.length>1024){progressLine='';discardProgress=true;}else progressLine+=part;}
    }
   });
   child.on('error',error=>finish(error));
   child.on('close',code=>{
    if(overflow){finish(Error('verification'));return;}
    try{const response=JSON.parse(output.trim());if(response.ok!==true)throw Error(['network','busy','verification','install','rollback'].includes(response.code)?response.code:'install');if(code!==0)throw Error('install');finish(null,response.result);}
    catch(error){finish(error.message==='network'||error.message==='busy'||error.message==='verification'||error.message==='rollback'?error:Error('install'));}
   });
  });}catch(error){if(error.code!=='ENOENT')throw error;}
 }
 throw Error('python');
}

export class AppUpdater{
 constructor({pluginDir,dataDir,worker=join(pluginDir,'compat','update-worker.py'),run=runUpdateWorker,onReload=null,now=Date.now}={}){
  this.pluginDir=pluginDir;this.dataDir=join(dataDir,'updates');this.worker=worker;this.run=run;this.onReload=onReload;this.now=now;
 }
 state={state:'idle',host:'app',currentVersion:null};plan=null;checkPending=null;applyPending=null;job=null;lastCheck=0;
 publicState(){const {state,host,currentVersion,latestVersion,notes,error,progress}=this.state;return {state,host,currentVersion,latestVersion,notes,error,progress};}
 async current(){const m=JSON.parse(await readFile(join(this.pluginDir,'plugin.json'),'utf8'));if(m.name!=='antigravity-pulse'||!/^\d+\.\d+\.\d+$/.test(m.version))throw Error('verification');return m.version;}
 async check(){
  if(this.job||this.applyPending||['installed','reloading'].includes(this.state.state))return this.publicState();if(this.checkPending)return this.checkPending;
  if(this.lastCheck&&this.now()-this.lastCheck<15000&&['current','available'].includes(this.state.state))return this.publicState();
  this.checkPending=(async()=>{
   this.state={state:'checking',host:'app',currentVersion:null,progress:{phase:'check'}};this.plan=null;
   try{
    this.state.currentVersion=await this.current();
    const result=await this.run(this.worker,['check','--target',this.pluginDir]);
    if(result.host!=='app'||result.currentVersion!==this.state.currentVersion)throw Error('verification');
    this.plan=result.hasUpdate?{...result,expires:this.now()+15*60*1000}:null;
    this.state={state:result.hasUpdate?'available':'current',host:'app',currentVersion:result.currentVersion,latestVersion:result.latestVersion,notes:typeof result.notes==='string'?result.notes.slice(0,1800):''};
   }catch(error){this.state={...this.state,state:'error',error:['python','network','busy','verification','rollback'].includes(error.message)?error.message:'install'};}
   this.lastCheck=this.now();return this.publicState();
  })().finally(()=>{this.checkPending=null;});return this.checkPending;
 }
 async apply(version){
  if(this.job)return this.publicState();
  if(this.applyPending)return this.applyPending;
  this.applyPending=this.startApply(version);
  try{return await this.applyPending;}finally{this.applyPending=null;}
 }
 async startApply(version){
  if(!this.plan||this.state.state!=='available'||version!==this.plan.latestVersion||this.plan.expires<this.now()||await this.current()!==this.plan.currentVersion)throw Error('verification');
  const plan=this.plan;this.plan=null;this.state={...this.state,state:'installing',progress:{phase:'verify'}};
  this.job=(async()=>{
   let file;
   try{
    await mkdir(this.dataDir,{recursive:true});file=join(this.dataDir,'plan-'+randomUUID()+'.json');
    await writeFile(file,JSON.stringify(plan),{flag:'wx',mode:0o600});
    const result=await this.run(this.worker,['apply','--target',this.pluginDir,'--plan',file,'--updates',this.dataDir],{onProgress:value=>{
     const progress=safeProgress(value);if(!progress||this.state.state!=='installing')return;
     const old=this.state.progress;
     if(old?.phase==='download'&&progress.phase==='download'&&old.total===progress.total&&progress.received<old.received)return;
     this.state={...this.state,progress};
    }});
    if(result.verified!==true||result.version!==version||await this.current()!==version)throw Error('verification');
    this.state={...this.state,state:'installed',currentVersion:version,progress:{phase:'complete'}};
   }catch(error){this.state={...this.state,state:'error',error:['network','busy','verification','python','rollback'].includes(error.message)?error.message:'install'};}
   finally{if(file)await unlink(file).catch(()=>{});}
  })().finally(()=>{this.job=null;});return this.publicState();
 }
 async request(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['action','version'].includes(k)))throw Error('verification');
  if(input.action==='check'&&input.version===undefined){void this.check().catch(()=>{});return this.publicState();}
  if(input.action==='status'&&input.version===undefined)return this.publicState();
  if(input.action==='apply'&&typeof input.version==='string')return this.apply(input.version);
  if(input.action==='reload'&&input.version===undefined&&this.state.state==='reloading')return this.publicState();
  if(input.action==='reload'&&input.version===undefined&&this.state.state==='installed'&&this.onReload){this.state={...this.state,state:'reloading'};setTimeout(()=>this.onReload(),500);return this.publicState();}
  throw Error('verification');
 }
}
