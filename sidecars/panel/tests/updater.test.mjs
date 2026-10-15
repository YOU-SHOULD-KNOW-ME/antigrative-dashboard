import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {AppUpdater,runUpdateWorker} from '../updater.mjs';
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
 await service.check();now+=15*60*1000+1;await assert.rejects(()=>service.apply('0.8.7'));assert.equal(calls,1);
 await service.check();await writeFile(join(directory,'plugin.json'),JSON.stringify({name:'antigravity-pulse',version:'0.8.8'}));await assert.rejects(()=>service.apply('0.8.7'));assert.equal(calls,2);
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
 const spawnImpl=({output,code})=>(_command,_args,options)=>{
  assert.equal(options.windowsHide,true);const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{};
  queueMicrotask(()=>{for(const chunk of output)child.stdout.emit('data',chunk);child.emit('close',code);});return child;
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
 const spawnImpl=()=>{const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{};
  queueMicrotask(()=>{
   child.stderr.emit('data','unrelated private diagnostic\n'+'x'.repeat(50000)+'\n');
   const event=JSON.stringify({event:'pulse-update-progress',phase:'download',received:5,total:10,private:'ignored'})+'\n';
   child.stderr.emit('data',event.slice(0,17));child.stderr.emit('data',event.slice(17));
   child.stderr.emit('data',JSON.stringify({event:'pulse-update-progress',phase:'unknown',private:'ignored'})+'\n');
   child.stdout.emit('data',valid);child.emit('close',0);
  });return child;};
 assert.deepEqual(await runUpdateWorker('worker.py',['apply'],{spawnImpl,onProgress:value=>received.push(value)}),{verified:true});
 assert.deepEqual(received,[{phase:'download',received:5,total:10}]);
});
