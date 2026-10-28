// Real process regression for Windows' open-current-directory rename lock,
// including the host's cmd -> agy-node.cmd -> Node launch ancestry.
// Every file and HOME value is isolated; GitHub/network functions are replaced
// only inside the temporary Python harness. No installed plugin is touched.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync,spawn} from 'node:child_process';
import {AppUpdater} from '../sidecars/panel/updater.mjs';

const script=fileURLToPath(import.meta.url),root=resolve(dirname(script),'..');
const manifest=version=>JSON.stringify({name:'antigravity-pulse',version});

if(process.argv[2]==='--child'){
 const {PULSE_CWD_TARGET:target,PULSE_CWD_HARNESS:worker,PULSE_CWD_DATA:data}=process.env;
 const updater=new AppUpdater({pluginDir:target,dataDir:data,worker});
 assert.equal((await updater.check()).state,'available');
 assert.equal((await updater.apply('0.8.10')).state,'installing');await updater.job;
 if(process.argv[3]==='baseline'){
  assert.equal(updater.publicState().state,'error',JSON.stringify(updater.publicState()));
  assert.equal(updater.publicState().error,'install');
  assert.equal(updater.publicState().errorDetail,'permission','legacy baseline must fail on the Windows cwd lock');
  assert.equal(JSON.parse(await readFile(join(target,'plugin.json'),'utf8')).version,'0.8.9');
  assert.equal(await readFile(join(target,'sidecars','panel','old.txt'),'utf8'),'old runtime');
  assert.equal(process.cwd(),target,'Node released its own cwd, while the parent cmd still holds panel');
  console.log('Confirmed: parent cmd retains panel cwd after Node relocates; legacy tree swap fails and original is retained.');
 }else{
  assert.equal(updater.publicState().state,'installed',JSON.stringify(updater.publicState()));
  assert.equal(JSON.parse(await readFile(join(target,'plugin.json'),'utf8')).version,'0.8.10');
  await assert.rejects(()=>readFile(join(target,'sidecars','panel','old.txt')),error=>error.code==='ENOENT');
  if(process.platform==='win32')assert.equal(process.cwd(),target);
  console.log(process.platform==='win32'?'Passed: real worker upgraded 0.8.9 to verified 0.8.10 with parent cmd retaining panel cwd; obsolete file removed.':'Passed: real worker upgraded 0.8.9 to verified 0.8.10 using the POSIX tree strategy; obsolete file removed.');
 }
 assert.equal(await readFile(join(target,'sidecars','panel','data','history-v1','record.json'),'utf8'),'saved private statistics');
 assert.equal(await readFile(join(target,'sidecars','panel','data','preferences.json'),'utf8'),'saved private preferences');
 assert.equal(await readFile(join(data,'usage-v1','ledger.json'),'utf8'),'saved external usage');
}else{
 const candidates=process.platform==='win32'?[['python'],['py','-3'],['python3']]:[['python3'],['python']];
 const python=candidates.find(([command,...prefix])=>spawnSync(command,[...prefix,'-c','import sys;sys.exit(0 if sys.version_info >= (3,10) else 1)'],{encoding:'utf8',windowsHide:true,timeout:4000}).status===0);
 assert.ok(python,'Python 3.10+ is required for the isolated updater regression');
 const home=await mkdtemp(join(tmpdir(),'ag-update-cwd-'));
 try{
  const target=join(home,'.gemini','config','plugins','antigravity-pulse'),panel=join(target,'sidecars','panel'),data=join(home,'data'),harness=join(home,'compat','update-worker.py'),archive=join(home,'fixture.zip'),shim=join(home,'agy-node.cmd'),launcher=join(home,'source space 中文 & safe','check-update-cwd.mjs');
  await mkdir(panel,{recursive:true});await mkdir(dirname(harness),{recursive:true});await mkdir(data);
  await mkdir(dirname(launcher));await writeFile(launcher,`import ${JSON.stringify(pathToFileURL(script).href)};\n`);
  await writeFile(join(target,'plugin.json'),manifest('0.8.9'));await writeFile(join(panel,'old.txt'),'old runtime');
  await mkdir(join(panel,'data','history-v1'),{recursive:true});await mkdir(join(data,'usage-v1'));
  await writeFile(join(panel,'data','history-v1','record.json'),'saved private statistics');await writeFile(join(panel,'data','preferences.json'),'saved private preferences');await writeFile(join(data,'usage-v1','ledger.json'),'saved external usage');
  // The shim intentionally never changes directory: cmd keeps its cwd open
  // while waiting for Node, exactly as the real host launch shim does.
  await writeFile(shim,'@echo off\r\n"%PULSE_CWD_NODE%" %*\r\nexit /b %errorlevel%\r\n');
  const env={...process.env,HOME:home,USERPROFILE:home,PYTHONDONTWRITEBYTECODE:'1',PULSE_CWD_TARGET:target,PULSE_CWD_HARNESS:harness,PULSE_CWD_DATA:data,PULSE_CWD_ARCHIVE:archive,PULSE_CWD_REAL_WORKER:join(root,'compat','update-worker.py'),PULSE_CWD_NODE:process.execPath,PULSE_CWD_SCRIPT:launcher,PULSE_CWD_SHIM:shim};
  const build=String.raw`import os,json,zipfile
from pathlib import Path
required=('plugin.json','compat/inline-widget.cjs','compat/runtime-ui.mjs','compat/i18n.cjs','compat/theme.cjs','sidecars/panel/main.mjs','sidecars/panel/metrics.mjs','sidecars/panel/history.mjs','assets/logo.svg')
with zipfile.ZipFile(os.environ['PULSE_CWD_ARCHIVE'],'w') as bundle:
 for name in required:bundle.writestr('antigrative-dashboard/'+name,json.dumps({'name':'antigravity-pulse','version':'0.8.10'}) if name=='plugin.json' else 'fixture source')
`;
  const built=spawnSync(python[0],[...python.slice(1),'-c',build],{env,encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(built.status,0,built.stderr);
  await writeFile(harness,String.raw`import importlib.util,os,json,hashlib
from pathlib import Path
spec=importlib.util.spec_from_file_location('fixture_worker',os.environ['PULSE_CWD_REAL_WORKER'])
w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
if os.environ.get('PULSE_CWD_LEGACY')=='1':
 install=w.install_staged
 def legacy_install(*args,**kwargs):
  kwargs['strategy']='trees'
  return install(*args,**kwargs)
 w.install_staged=legacy_install
archive=Path(os.environ['PULSE_CWD_ARCHIVE']);name='antigrative-dashboard-0.8.10.zip'
base='https://github.com/'+w.REPO+'/releases/download/v0.8.10/'
release={'tag_name':'v0.8.10','assets':[{'name':name,'size':archive.stat().st_size,'browser_download_url':base+name},{'name':name+'.sha256','browser_download_url':base+name+'.sha256'}]}
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
    const windows=process.platform==='win32',command=windows?(process.env.ComSpec||'cmd.exe'):process.execPath;
    // Values expand inside quotes in cmd, preserving spaces, Unicode and & in
    // executable/script paths without interpolating them into shell syntax.
    const args=windows?['/d','/v:off','/s','/c','""%PULSE_CWD_SHIM%" "%PULSE_CWD_SCRIPT%" --child "%PULSE_CWD_MODE%""']:[launcher,'--child',mode];
    const child=spawn(command,args,{cwd:panel,env:{...env,PULSE_CWD_MODE:mode,PULSE_CWD_LEGACY:mode==='baseline'?'1':'0'},windowsHide:true,windowsVerbatimArguments:windows,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
    child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);
    const timer=setTimeout(()=>{
     if(windows&&child.pid)spawnSync('taskkill',['/pid',String(child.pid),'/t','/f'],{windowsHide:true,stdio:'ignore',timeout:5000});
     else child.kill();
     reject(Error('Isolated cwd regression timed out'));
    },30000);
    child.on('error',error=>{clearTimeout(timer);reject(error);});
    child.on('close',code=>{clearTimeout(timer);if(code!==0)reject(Error(stdout+stderr));else{process.stdout.write(stdout);done();}});
   });
  }
  if(process.platform==='win32')await child('baseline');
  await child('fixed');
 }finally{await rm(home,{recursive:true,force:true});}
}
