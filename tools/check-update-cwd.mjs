// Real process regression for Windows' open-current-directory rename lock.
// Every file and HOME value is isolated; GitHub/network functions are replaced
// only inside the temporary Python harness. No installed plugin is touched.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync,spawn} from 'node:child_process';
import {AppUpdater,runUpdateWorker} from '../sidecars/panel/updater.mjs';

const script=fileURLToPath(import.meta.url),root=resolve(dirname(script),'..');
const manifest=version=>JSON.stringify({name:'antigravity-pulse',version});

if(process.argv[2]==='--child'){
 const {PULSE_CWD_TARGET:target,PULSE_CWD_HARNESS:worker,PULSE_CWD_DATA:data}=process.env;
 if(process.argv[3]==='baseline'){
  const plan=await runUpdateWorker(worker,['check','--target',target]);
  assert.equal(plan.latestVersion,'0.8.9');
  const planFile=join(data,'baseline-plan.json');await writeFile(planFile,JSON.stringify(plan));
  await assert.rejects(()=>runUpdateWorker(worker,['apply','--target',target,'--plan',planFile,'--updates',data]),error=>error.message==='install');
  assert.equal(JSON.parse(await readFile(join(target,'plugin.json'),'utf8')).version,'0.8.8');
  console.log('Confirmed: parent cwd inside sidecars blocks Windows replacement; original retained.');
 }else{
  const updater=new AppUpdater({pluginDir:target,dataDir:data,worker});
  assert.equal((await updater.check()).state,'available');
  assert.equal((await updater.apply('0.8.9')).state,'installing');await updater.job;
  assert.equal(updater.publicState().state,'installed',JSON.stringify(updater.publicState()));
  assert.equal(JSON.parse(await readFile(join(target,'plugin.json'),'utf8')).version,'0.8.9');
  if(process.platform==='win32')assert.equal(process.cwd(),target);
  console.log('Passed: initially nested parent cwd released; real worker installed verified 0.8.9.');
 }
}else{
 const candidates=process.platform==='win32'?[['python'],['py','-3'],['python3']]:[['python3'],['python']];
 const python=candidates.find(([command,...prefix])=>spawnSync(command,[...prefix,'-c','import sys;sys.exit(0 if sys.version_info >= (3,10) else 1)'],{encoding:'utf8',windowsHide:true,timeout:4000}).status===0);
 assert.ok(python,'Python 3.10+ is required for the isolated updater regression');
 const home=await mkdtemp(join(tmpdir(),'ag-update-cwd-'));
 try{
  const target=join(home,'.gemini','config','plugins','antigravity-pulse'),panel=join(target,'sidecars','panel'),data=join(home,'data'),harness=join(home,'compat','update-worker.py'),archive=join(home,'fixture.zip');
  await mkdir(panel,{recursive:true});await mkdir(dirname(harness),{recursive:true});await mkdir(data);
  await writeFile(join(target,'plugin.json'),manifest('0.8.8'));await writeFile(join(panel,'old.txt'),'old runtime');
  const env={...process.env,HOME:home,USERPROFILE:home,PYTHONDONTWRITEBYTECODE:'1',PULSE_CWD_TARGET:target,PULSE_CWD_HARNESS:harness,PULSE_CWD_DATA:data,PULSE_CWD_ARCHIVE:archive,PULSE_CWD_REAL_WORKER:join(root,'compat','update-worker.py')};
  const build=String.raw`import os,json,zipfile
from pathlib import Path
required=('plugin.json','compat/inline-widget.cjs','compat/runtime-ui.mjs','compat/i18n.cjs','compat/theme.cjs','sidecars/panel/main.mjs','sidecars/panel/metrics.mjs','sidecars/panel/history.mjs','assets/logo.svg')
with zipfile.ZipFile(os.environ['PULSE_CWD_ARCHIVE'],'w') as bundle:
 for name in required:bundle.writestr('antigrative-dashboard/'+name,json.dumps({'name':'antigravity-pulse','version':'0.8.9'}) if name=='plugin.json' else 'fixture source')
`;
  const built=spawnSync(python[0],[...python.slice(1),'-c',build],{env,encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(built.status,0,built.stderr);
  await writeFile(harness,String.raw`import importlib.util,os,json,hashlib
from pathlib import Path
spec=importlib.util.spec_from_file_location('fixture_worker',os.environ['PULSE_CWD_REAL_WORKER'])
w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
archive=Path(os.environ['PULSE_CWD_ARCHIVE']);name='antigrative-dashboard-0.8.9.zip'
base='https://github.com/'+w.REPO+'/releases/download/v0.8.9/'
release={'tag_name':'v0.8.9','assets':[{'name':name,'size':archive.stat().st_size,'browser_download_url':base+name},{'name':name+'.sha256','browser_download_url':base+name+'.sha256'}]}
w.latest_release=lambda current:release
def fetch(url,limit,destination=None,progress=None,**kwargs):
 if destination is None:return (hashlib.sha256(archive.read_bytes()).hexdigest()+'  '+name).encode()
 destination.write_bytes(archive.read_bytes())
 if progress:progress(archive.stat().st_size)
 return archive.stat().st_size
w.fetch=fetch
raise SystemExit(w.main())
`);
  async function child(mode){
   await new Promise((done,reject)=>{
    const child=spawn(process.execPath,[script,'--child',mode],{cwd:panel,env,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
    child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);
    const timer=setTimeout(()=>{child.kill();reject(Error('Isolated cwd regression timed out'));},30000);
    child.on('error',error=>{clearTimeout(timer);reject(error);});
    child.on('close',code=>{clearTimeout(timer);if(code!==0)reject(Error(stdout+stderr));else{process.stdout.write(stdout);done();}});
   });
  }
  if(process.platform==='win32')await child('baseline');
  await child('fixed');
 }finally{await rm(home,{recursive:true,force:true});}
}
