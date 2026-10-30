import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {AppUpdater,runUpdateWorker,releaseRuntimeDirectory} from '../updater.mjs';
import {EventEmitter} from 'node:events';

async function setup(t,run){const directory=await mkdtemp(join(tmpdir(),'ag-updater-'));t.after(()=>rm(directory,{recursive:true,force:true}));await writeFile(join(directory,'plugin.json'),JSON.stringify({name:'antigravity-pulse',version:'0.8.6'}));return {directory,service:new AppUpdater({pluginDir:directory,dataDir:directory,run})};}

test('updater is manual, coalesces checks and exposes no package URLs',async t=>{
 let calls=0,now=100;const {service}=await setup(t,async()=>{calls++;return {host:'app',currentVersion:'0.8.6',latestVersion:'0.8.7',hasUpdate:true,url:'private-plan-url',notes:'release notes'};});service.now=()=>now;
 assert.equal(calls,0);await Promise.all([service.check(),service.check()]);assert.equal(calls,1);assert.equal(service.publicState().state,'available');assert.equal(service.publicState().url,undefined);
 await service.check();assert.equal(calls,1);now+=15001;await service.check();assert.equal(calls,2);
 await assert.rejects(()=>service.apply('0.8.8'));await assert.rejects(()=>service.request({action:'check',url:'unsafe'}));
});
test('same version has no apply action and an IDE response cannot become an App plan',async t=>{
 const {service}=await setup(t,async()=>({host:'app',currentVersion:'0.8.6',latestVersion:'0.8.6',hasUpdate:false}));assert.equal((await service.check()).state,'current');await assert.rejects(()=>service.apply('0.8.6'));
 service.lastCheck=0;service.run=async()=>({host:'ide',currentVersion:'0.8.6',latestVersion:'0.8.7',hasUpdate:true});assert.equal((await service.check()).error,'verification');assert.equal(service.plan,null);
});
test('verified installation requires exact target version before reporting success',async t=>{
 let service;const fixture=await setup(t,async(_worker,args)=>{if(args[0]==='check')return {host:'app',currentVersion:'0.8.6',latestVersion:'0.8.7',hasUpdate:true};await writeFile(join(fixture.directory,'plugin.json'),JSON.stringify({name:'antigravity-pulse',version:'0.8.7'}));return {version:'0.8.7',verified:true};});service=fixture.service;
 await service.check();assert.equal((await service.apply('0.8.7')).state,'installing');await service.job;assert.equal(service.publicState().state,'installed');assert.equal(service.publicState().currentVersion,'0.8.7');
 assert.equal(JSON.parse(await readFile(join(fixture.directory,'plugin.json'))).version,'0.8.7');
});
test('failed check/install reports static error codes and retains the installed version',async t=>{
 const {service,directory}=await setup(t,async()=>{throw Error('network');});assert.equal((await service.check()).error,'network');
 service.lastCheck=0;service.run=async(_worker,args)=>{if(args[0]==='check')return {host:'app',currentVersion:'0.8.6',latestVersion:'0.8.7',hasUpdate:true};throw Error('verification');};await service.check();await service.apply('0.8.7');await service.job;assert.equal(service.publicState().error,'verification');assert.equal(JSON.parse(await readFile(join(directory,'plugin.json'))).version,'0.8.6');
});

test('simultaneous apply clicks start one worker and check cannot replace installation state',async t=>{
 let installs=0,finish;const waiting=new Promise(r=>finish=r);
 const fixture=await setup(t,async(_worker,args)=>{if(args[0]==='check')return {host:'app',currentVersion:'0.8.6',latestVersion:'0.8.7',hasUpdate:true};installs++;await waiting;await writeFile(join(fixture.directory,'plugin.json'),JSON.stringify({name:'antigravity-pulse',version:'0.8.7'}));return {version:'0.8.7',verified:true};});
 const {service}=fixture;await service.check();
 const results=await Promise.all([service.apply('0.8.7'),service.apply('0.8.7'),service.apply('0.8.7')]);
 assert.ok(results.every(r=>r.state==='installing'));assert.equal((await service.check()).state,'installing');
 const job=service.job;finish();await job;assert.equal(installs,1);
 assert.equal((await service.check()).state,'installed','Reopening the dialog must retain the Reload action');
 assert.deepEqual((await readdir(service.dataDir)).filter(n=>n.startsWith('plan-')),[]);
});

test('expired or changed-install plans never start a download',async t=>{
 let calls=0,now=100;const {service,directory}=await setup(t,async()=>{calls++;return {host:'app',currentVersion:'0.8.6',latestVersion:'0.8.7',hasUpdate:true};});service.now=()=>now;
 await service.check();now+=15*60*1000+1;assert.equal((await service.apply('0.8.7')).errorDetail,'plan-expired');assert.equal(calls,1);
 await service.check();await writeFile(join(directory,'plugin.json'),JSON.stringify({name:'antigravity-pulse',version:'0.8.8'}));const state=await service.apply('0.8.7');assert.equal(state.errorDetail,'plan-expired');assert.equal(state.currentVersion,'0.8.8');assert.equal(calls,2);
});

test('missing installed manifest becomes a retryable static check error',async t=>{
 const {service,directory}=await setup(t,async()=>{throw Error('must not run');});await rm(join(directory,'plugin.json'));
 const state=await service.check();assert.equal(state.state,'error');assert.equal(state.error,'install');assert.equal(service.checkPending,null);
 await writeFile(join(directory,'plugin.json'),JSON.stringify({name:'antigravity-pulse',version:'0.8.6'}));
 service.run=async()=>({host:'app',currentVersion:'0.8.6',latestVersion:'0.8.6',hasUpdate:false});assert.equal((await service.check()).state,'current');
});

test('reload is scheduled once even if multiple views request it',async t=>{
 const {service}=await setup(t,async()=>{});let reloads=0;service.onReload=()=>reloads++;service.state={state:'installed',host:'app',currentVersion:'0.8.7'};
 await Promise.all([service.request({action:'reload'}),service.request({action:'reload'})]);
 assert.equal(service.publicState().state,'reloading');assert.equal((await service.check()).state,'reloading');
 await new Promise(r=>setTimeout(r,550));assert.equal(reloads,1);
});

test('worker runner bounds output, requires zero exit status and hides subprocess windows',async()=>{
 const spawnImpl=({output,code})=>(_command,args,options)=>{
  assert.equal(options.windowsHide,true);const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{};
  queueMicrotask(()=>{if(args.includes('-c')){child.stdout.emit('data',JSON.stringify({pulseUpdatePython:1,supported:true}));child.emit('close',0);return;}for(const chunk of output)child.stdout.emit('data',chunk);child.emit('close',code);});return child;
 };
 const valid=JSON.stringify({ok:true,result:{version:'0.8.7'}});
 assert.deepEqual(await runUpdateWorker('worker.py',['apply'],{spawnImpl:spawnImpl({output:[valid],code:0})}),{version:'0.8.7'});
 await assert.rejects(()=>runUpdateWorker('worker.py',['apply'],{spawnImpl:spawnImpl({output:[valid],code:1})}),/install/);
 await assert.rejects(()=>runUpdateWorker('worker.py',['apply'],{spawnImpl:spawnImpl({output:['x'.repeat(40000),'x'.repeat(40000)],code:0})}),/verification/);
});

test('slow network checking returns promptly to the renderer and exposes progress through status',async t=>{
 let finish;const waiting=new Promise(r=>finish=r);let calls=0;
 const {service}=await setup(t,async()=>{calls++;await waiting;return {host:'app',currentVersion:'0.8.6',latestVersion:'0.8.6',hasUpdate:false};});
 assert.equal((await service.request({action:'check'})).state,'checking');
 await service.request({action:'check'});assert.equal((await service.request({action:'status'})).state,'checking');
 finish();await service.checkPending;assert.equal(calls,1);assert.equal((await service.request({action:'status'})).state,'current');
});

test('download progress reports measured bytes, drops extra fields and never regresses within a download',async t=>{
 let finish,progressStarted;const waiting=new Promise(r=>finish=r),started=new Promise(r=>progressStarted=r);let fixture;
 fixture=await setup(t,async(_worker,args,options)=>{
  if(args[0]==='check')return {host:'app',currentVersion:'0.8.6',latestVersion:'0.8.7',hasUpdate:true};
  options.onProgress({phase:'download',received:50,total:100,url:'private',notes:'private'});
  options.onProgress({phase:'download',received:20,total:100});
  assert.deepEqual(fixture.service.publicState().progress,{phase:'download',received:50,total:100});
  progressStarted();
  await waiting;options.onProgress({phase:'install'});
  await writeFile(join(fixture.directory,'plugin.json'),JSON.stringify({name:'antigravity-pulse',version:'0.8.7'}));return {version:'0.8.7',verified:true};
 });
 await fixture.service.check();await fixture.service.apply('0.8.7');await started;assert.equal(fixture.service.publicState().progress.received,50);
 finish();await fixture.service.job;assert.deepEqual(fixture.service.publicState().progress,{phase:'complete'});
});

test('stderr progress parsing tolerates chunks and ignores unbounded or unrelated diagnostic data',async()=>{
 const received=[];const valid=JSON.stringify({ok:true,result:{verified:true}});
 const spawnImpl=(_command,args)=>{const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{};
  queueMicrotask(()=>{
   if(args.includes('-c')){child.stdout.emit('data',JSON.stringify({pulseUpdatePython:1,supported:true}));child.emit('close',0);return;}
   child.stderr.emit('data','unrelated private diagnostic\n'+'x'.repeat(50000)+'\n');
   const event=JSON.stringify({event:'pulse-update-progress',phase:'download',received:5,total:10,private:'ignored'})+'\n';
   child.stderr.emit('data',event.slice(0,17));child.stderr.emit('data',event.slice(17));
   child.stderr.emit('data',JSON.stringify({event:'pulse-update-progress',phase:'unknown',private:'ignored'})+'\n');
   child.stdout.emit('data',valid);child.emit('close',0);
  });return child;};
 assert.deepEqual(await runUpdateWorker('worker.py',['apply'],{spawnImpl,onProgress:value=>received.push(value)}),{verified:true});
 assert.deepEqual(received,[{phase:'download',received:5,total:10}]);
});

test('Windows relocates only cwd inside a replaced runtime tree',()=>{
 const root='C:\\Users\\Fixture\\plugins\\antigravity-pulse',changes=[];
 for(const current of [root+'\\sidecars\\panel',root+'\\compat',root+'\\assets\\icons']){
  assert.equal(releaseRuntimeDirectory(root,{platform:'win32',cwd:()=>current,chdir:dir=>changes.push(dir)}),true);
 }
 assert.deepEqual(changes,[root,root,root]);
 for(const current of [root,root+'\\sidecars-other',root+'-other\\sidecars','D:\\external']){
  assert.equal(releaseRuntimeDirectory(root,{platform:'win32',cwd:()=>current,chdir:()=>assert.fail('external cwd changed')}),false);
 }
 assert.equal(releaseRuntimeDirectory(root,{platform:'linux',cwd:()=>assert.fail('unix cwd read'),chdir:()=>assert.fail('unix cwd changed')}),false);
});

function scriptedSpawn(handler){
 return (command,args,options)=>{
  const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{};
  queueMicrotask(()=>handler({command,args,options,child,respond:(value,code=0)=>{if(value!==null)child.stdout.emit('data',typeof value==='string'?value:JSON.stringify(value));child.emit('close',code);}}));
  return child;
 };
}

test('Windows probes past Store aliases and selects py -3 before running the worker once',async()=>{
 const calls=[],stable=join(tmpdir(),'ag-worker-stable');
 const result=await runUpdateWorker('C:\\plugin\\compat\\update-worker.py',['apply'],{platform:'win32',cwd:stable,spawnImpl:scriptedSpawn(({command,args,options,respond})=>{
  calls.push({command,args});assert.equal(options.cwd,stable);
  if(command==='python'){respond(null,9009);return;}
  assert.equal(command,'py');assert.equal(args[0],'-3');
  respond(args.includes('-c')?{pulseUpdatePython:1,supported:true}:{ok:true,result:{verified:true}});
 })});
 assert.deepEqual(result,{verified:true});assert.equal(calls.length,3);assert.deepEqual(calls.map(c=>c.command),['python','py','py']);
});

test('unsupported Python falls back during probes; missing and old runtimes remain distinct',async()=>{
 const calls=[];
 await runUpdateWorker('worker.py',['check'],{platform:'win32',spawnImpl:scriptedSpawn(({command,args,respond})=>{
  calls.push(command);respond(args.includes('-c')?{pulseUpdatePython:1,supported:command!=='python'}:{ok:true,result:{}});
 })});
 assert.deepEqual(calls,['python','py','py']);
 for(const [supported,detail] of [[false,'python-version'],[null,'python-missing']]){
  await assert.rejects(()=>runUpdateWorker('worker.py',['apply'],{platform:'win32',spawnImpl:scriptedSpawn(({respond})=>respond(supported===null?null:{pulseUpdatePython:1,supported},supported===null?9009:0))}),error=>error.message==='python'&&error.detail===detail);
 }
});

test('a selected worker failure is never retried and exposes only allowed static detail',async()=>{
 for(const [response,expectedDetail] of [[{ok:false,code:'install',detail:'permission'},'permission'],[{ok:false,code:'network',detail:'secret proxy URL'},undefined],['not JSON',undefined]]){
  let calls=0;
  await assert.rejects(()=>runUpdateWorker('worker.py',['apply'],{platform:'win32',spawnImpl:scriptedSpawn(({args,respond})=>{
   calls++;respond(args.includes('-c')?{pulseUpdatePython:1,supported:true}:response,args.includes('-c')?0:1);
  })}),error=>error.detail===expectedDetail);
  assert.equal(calls,2,'only one probe and one worker execution');
 }
});

test('retrying a check clears a previous static error detail',async t=>{
 const {service}=await setup(t,async()=>{throw Object.assign(Error('network'),{detail:'certificate'});});
 assert.equal((await service.check()).errorDetail,'certificate');
 service.run=async()=>({host:'app',currentVersion:'0.8.6',latestVersion:'0.8.6',hasUpdate:false});
 assert.equal((await service.check()).errorDetail,undefined);
});

test('relative worker paths become absolute before changing subprocess cwd',async()=>{
 const worker=join('compat','worker.py'),expected=resolve(worker);
 await runUpdateWorker(worker,['check'],{spawnImpl:scriptedSpawn(({args,options,respond})=>{
  assert.equal(options.cwd,resolve('compat','..'));
  if(!args.includes('-c'))assert.equal(args[0],expected);
  respond(args.includes('-c')?{pulseUpdatePython:1,supported:true}:{ok:true,result:{}});
 })});
});

test('permission failures retain a static detail without leaking filesystem messages',async t=>{
 const {service}=await setup(t,async()=>{throw Object.assign(Error('private filesystem path'),{code:'EACCES'});});
 const state=await service.check();assert.equal(state.error,'install');assert.equal(state.errorDetail,'permission');
 assert.equal(JSON.stringify(state).includes('private'),false);
});

test('worker location rejection remains distinct from package verification without exposing paths',async()=>{
 let calls=0;
 await assert.rejects(()=>runUpdateWorker('worker.py',['check'],{spawnImpl:scriptedSpawn(({args,respond})=>{
  calls++;
  respond(args.includes('-c')?{pulseUpdatePython:1,supported:true}:{ok:false,code:'location',detail:'install-location',message:'C:\\private-user\\.gemini',traceback:'private traceback'},args.includes('-c')?0:1);
 })}),error=>error.message==='location'&&error.detail==='install-location'&&!JSON.stringify(error).includes('private'));
 assert.equal(calls,2,'location failures do not try another interpreter');
});

test('location failures survive check and apply feedback and retry performs a fresh check',async t=>{
 let checks=0,installs=0,locationFailure=true;
 const {service}=await setup(t,async(_worker,args)=>{
  if(args[0]==='check')checks++;else installs++;
  if(locationFailure||args[0]==='apply')throw Object.assign(Error('location'),{detail:'install-location',path:'private path'});
  return {host:'app',currentVersion:'0.8.6',latestVersion:'0.8.7',hasUpdate:true};
 });
 const failed=await service.check();assert.equal(failed.error,'location');assert.equal(failed.errorDetail,'install-location');assert.equal(JSON.stringify(failed).includes('private'),false);
 locationFailure=false;assert.equal((await service.check()).state,'available');assert.equal(checks,2);
 await service.apply('0.8.7');await service.job;
 assert.equal(service.publicState().error,'location');assert.equal(service.publicState().errorDetail,'install-location');assert.equal(installs,1);assert.equal(service.plan,null);
 assert.equal((await service.check()).state,'available');assert.equal(checks,3);assert.equal(service.publicState().errorDetail,undefined);
});

test('expired plan returns actionable state rather than a network-shaped rejection',async t=>{
 let calls=0,clock=100;
 const {service}=await setup(t,async()=>{calls++;return {host:'app',currentVersion:'0.8.6',latestVersion:'0.8.7',hasUpdate:true};});
 service.now=()=>clock;await service.check();clock+=15*60*1000+1;
 const state=await service.request({action:'apply',version:'0.8.7'});
 assert.equal(state.state,'error');assert.equal(state.error,'verification');assert.equal(state.errorDetail,'plan-expired');assert.equal(service.plan,null);assert.equal(calls,1);
 assert.equal((await service.check()).state,'available');assert.equal(calls,2,'retry refreshes the plan instead of resubmitting the old install');
});

test('unknown worker failure codes and details never expose diagnostics',async()=>{
 const secret='C:\\private-user\\.gemini https://user:password@proxy.invalid';
 await assert.rejects(()=>runUpdateWorker('worker.py',['check'],{spawnImpl:scriptedSpawn(({args,respond})=>{
  respond(args.includes('-c')?{pulseUpdatePython:1,supported:true}:{ok:false,code:secret,detail:secret,message:secret},args.includes('-c')?0:1);
 })}),error=>error.message==='install'&&error.detail===undefined&&!JSON.stringify(error).includes('private-user'));
});

test('real worker location failures pass through the Node protocol without network access',async t=>{
 const {directory}=await setup(t,async()=>{});
 const worker=fileURLToPath(new URL('../../../compat/update-worker.py',import.meta.url));
 let failure;
 try{await runUpdateWorker(worker,['check','--target',directory]);}
 catch(error){failure=error;}
 if(failure?.message==='python'){t.skip('Python 3.10+ is unavailable');return;}
 assert.equal(failure?.message,'location');assert.equal(failure?.detail,'install-location');
 assert.equal(JSON.stringify(failure).includes(directory),false);
 assert.deepEqual(await readdir(directory),['plugin.json'],'An invalid installation must fail before creating a transaction or downloading');
});

test('an uncertain outcome after committing never reruns installation and a fresh check finds the new version',async t=>{
 let installed=false,applies=0;
 const fixture=await setup(t,async(_worker,args)=>{
  if(args[0]==='check')return {host:'app',currentVersion:installed?'0.8.7':'0.8.6',latestVersion:'0.8.7',hasUpdate:!installed};
  applies++;await writeFile(join(fixture.directory,'plugin.json'),JSON.stringify({name:'antigravity-pulse',version:'0.8.7'}));installed=true;
  throw Error('install'); // A committed worker may exit without a valid result.
 });
 await fixture.service.check();await fixture.service.apply('0.8.7');await fixture.service.job;
 assert.equal(fixture.service.publicState().error,'install');assert.equal(fixture.service.plan,null);assert.equal(applies,1);
 const checked=await fixture.service.check();assert.equal(checked.state,'current');assert.equal(checked.currentVersion,'0.8.7');assert.equal(applies,1);
 assert.deepEqual((await readdir(fixture.service.dataDir)).filter(name=>name.startsWith('plan-')),[]);
});
