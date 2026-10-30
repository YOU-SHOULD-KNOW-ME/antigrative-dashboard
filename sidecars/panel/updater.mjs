// Manual updates only. Public release metadata is fetched by the bounded
// Python worker, which uses the user's existing proxy configuration.
import {readFile,mkdir,writeFile,unlink} from 'node:fs/promises';
import {join,dirname,resolve,win32} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';

const progressPhases=new Set(['check','download','verify','extract','backup','install','recover','complete']);
const errorCodes=new Set(['python','network','busy','verification','install','rollback','location']);
const errorDetails=new Set(['timeout','dns','certificate','proxy','http','connection','permission','python-version','python-missing','install-location','plan-expired']);
const safeCode=value=>errorCodes.has(value)?value:'install';
const safeDetail=value=>errorDetails.has(value)?value:undefined;
const errorDetail=error=>safeDetail(error.detail)||(['EACCES','EPERM'].includes(error.code)?'permission':undefined);
const updateError=(code,detail)=>Object.assign(Error(code),{detail:safeDetail(detail)});
// Windows keeps a process's current directory open. A sidecar launched in
// sidecars/panel must release that handle before its runtime can be renamed.
export function releaseRuntimeDirectory(pluginDir,{platform=process.platform,cwd=()=>process.cwd(),chdir=dir=>process.chdir(dir)}={}){
 if(platform!=='win32')return false;
 const root=win32.resolve(pluginDir),current=win32.resolve(cwd());
 for(const name of ['assets','compat','sidecars']){
  const relative=win32.relative(win32.join(root,name),current);
  if(relative===''||relative!=='..'&&!relative.startsWith('..\\')&&!win32.isAbsolute(relative)){chdir(root);return true;}
 }
 return false;
}
const pythonProbe='import json,sys; print(json.dumps({"pulseUpdatePython":1,"supported":sys.version_info >= (3,10)}))';
async function probePython(command,prefix,options,spawnImpl){
 return new Promise(resolve=>{
  let child,output='',settled=false,timer;
  const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value);};
  try{child=spawnImpl(command,[...prefix,'-c',pythonProbe],options);}catch{finish('missing');return;}
  timer=setTimeout(()=>{finish('missing');try{child.kill();}catch{}},4000);
  child.stdout.on('data',chunk=>{if(output.length<=4096)output=(output+chunk).slice(0,4097);});
  child.stderr.on('data',()=>{});
  child.on('error',()=>finish('missing'));
  child.on('close',code=>{
   try{const value=JSON.parse(output);finish(code===0&&value.pulseUpdatePython===1?(value.supported===true?'ready':'version'):'missing');}
   catch{finish('missing');}
  });
 });
}
function safeProgress(value){
 if(!value||!progressPhases.has(value.phase))return null;
 const result={phase:value.phase};
 if(value.phase==='download'&&Number.isSafeInteger(value.received)&&value.received>=0&&Number.isSafeInteger(value.total)&&value.total>0&&value.total<=64*1024*1024&&value.received<=value.total){result.received=value.received;result.total=value.total;}
 return result;
}
export async function runUpdateWorker(worker,args,{spawnImpl=spawn,platform=process.platform,onProgress=null,cwd}={}){
 worker=resolve(worker);
 const candidates=platform==='win32'?[['python',[]],['py',['-3']],['python3',[]]]:[['python3',[]],['python',[]]];
 const options={stdio:['ignore','pipe','pipe'],windowsHide:true,cwd:resolve(cwd??resolve(dirname(worker),'..'))};
 let unsupported=false,selected;
 for(const [command,prefix] of candidates){
  const status=await probePython(command,prefix,options,spawnImpl);
  if(status==='ready'){selected=[command,prefix];break;}
  if(status==='version')unsupported=true;
 }
 if(!selected)throw updateError('python',unsupported?'python-version':'python-missing');
 const [command,prefix]=selected;
 // Selection is complete before executing the worker. Never retry an apply
 // after it starts: even a malformed final response may follow a committed swap.
 return new Promise((resolve,reject)=>{
   const child=spawnImpl(command,[...prefix,worker,...args],options);
   let output='',overflow=false,settled=false;
   const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
   // A read-only check can be cancelled safely. Installation is not terminated
   // in the middle of a filesystem transaction; its network reads are bounded.
   const timer=args[0]==='check'?setTimeout(()=>{child.kill();finish(updateError('network','timeout'));},75000):null;
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
    try{const response=JSON.parse(output.trim());if(response.ok!==true)throw updateError(safeCode(response.code),response.detail);if(code!==0)throw Error('install');finish(null,response.result);}
    catch(error){finish(updateError(safeCode(error.message),error.detail));}
   });
  });
}

export class AppUpdater{
 constructor({pluginDir,dataDir,worker=join(pluginDir,'compat','update-worker.py'),run=runUpdateWorker,onReload=null,now=Date.now}={}){
  this.pluginDir=resolve(pluginDir);this.dataDir=join(resolve(dataDir),'updates');this.worker=resolve(worker);this.run=run;this.onReload=onReload;this.now=now;
 }
 state={state:'idle',host:'app',currentVersion:null};plan=null;checkPending=null;applyPending=null;job=null;lastCheck=0;
 publicState(){const {state,host,currentVersion,latestVersion,notes,error,errorDetail,progress}=this.state;return {state,host,currentVersion,latestVersion,notes,error,errorDetail,progress};}
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
   }catch(error){this.state={...this.state,state:'error',error:safeCode(error.message),errorDetail:errorDetail(error)};}
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
  const plan=this.plan;
  if(!plan||this.state.state!=='available'||version!==plan.latestVersion)throw Error('verification');
  // The dialog can outlive its plan, or another instance can finish an update.
  // Return actionable state so the UI retries a check rather than claiming a
  // network failure or attempting to install an obsolete plan.
  try{
   if(plan.expires<=this.now())throw updateError('verification','plan-expired');
   const current=await this.current();this.state.currentVersion=current;
   if(current!==plan.currentVersion)throw updateError('verification','plan-expired');
  }catch(error){this.plan=null;this.state={...this.state,state:'error',error:safeCode(error.message),errorDetail:errorDetail(error),progress:undefined};return this.publicState();}
  this.plan=null;this.state={...this.state,state:'installing',progress:{phase:'verify'}};
  this.job=(async()=>{
   let file;
   try{
    releaseRuntimeDirectory(this.pluginDir);
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
   }catch(error){this.state={...this.state,state:'error',error:safeCode(error.message),errorDetail:errorDetail(error)};}
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
