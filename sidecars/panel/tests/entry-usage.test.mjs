import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

// Execute the real App/IDE entrypoints with inert host, disk and transport
// adapters. No installed application or personal statistics are touched.
async function entryFixture(host,url,selection=false){
  const {SourceTextModule,SyntheticModule,createContext}=await import('node:vm');
  const {readFile}=await import('node:fs/promises');
  const state={owned:true,asyncChecks:0,diskReads:0,syncs:[],snapshots:[],predicates:[],ingests:0,metricsInputs:[]};
  const apis=new Map();let snapshot,http;
  class Owner{token='fixture';startedAt=1;async claim(){return true;}owns(){return state.owned;}async isOwner(){state.asyncChecks++;if(state.ownerGate)await state.ownerGate;return state.owned;}watch(){}stop(){state.owned=false;}}
  class Store{constructor(client,options){state.store=this;state.predicates.push(options.owns);}async snapshot(input){state.metricsInputs.push(input);return {connection:'live'};}dispose(){}}
  class Usage{constructor(store,ledger,options){state.predicates.push(options.owns);}async snapshot(options){state.snapshots.push(options??null);return {};}async sync(force){state.syncs.push(force);}ingestLive(){state.ingests++;}dispose(){}}
  class Ui{health={};constructor(options){snapshot=options.snapshot;}start(){}async stop(){}}
  class App{api(path,handler){apis.set(path,handler);}page(){}run(){}}
  const source=await readFile(new URL(url),'utf8');
  const native=Object.fromEntries(await Promise.all(['node:path','node:url','node:os'].map(async name=>[name,await import(name)])));
  const fakeProcess={env:host==='ide'?{AG_PULSE_IDE_PROFILE:'fixture'}:host==='app'?{ANTIGRAVITY_SIDECAR_WEB_PORT:'1'}:{},exit(){throw Error('Unexpected exit');},on(){},once(){}};
  const context=createContext({process:fakeProcess,console,URL,URLSearchParams,setInterval:()=>({unref(){}}),clearInterval(){},setTimeout:()=>({unref(){}}),clearTimeout(){}});
  const modules={
    'node:fs':{readFileSync(file){state.diskReads++;return String(file).endsWith('.cjs')?'module.exports = function() {};':'{}';}},
    'node:fs/promises':{readFile:async()=> 'module.exports = function() {};',mkdir:async()=>{},writeFile:async()=>{}},
    'node:http':{createServer(handler){if(host!=='preview')throw Error('Unexpected preview server');http=handler;return {listen(){}};}},
    'node:module':{createRequire:()=>()=>()=>({css:()=>''})},
    'store.mjs':{MetricsStore:Store},'usage.mjs':{DesktopUsage:Usage,UsageLedger:class{}},
    'sdk.mjs':{loadSidecarSdk:async()=>({SidecarApp:App,Response:class{}})},
    'runtime-ui.mjs':{RuntimeUi:Ui,makeRendererSource:()=>''},
    'platform.mjs':{platformPaths:()=>({data:'fixture',settings:'settings.json'})},
    'preferences.mjs':{PreferencesStore:class{async snapshot(){return {};}}},
    'sidecar-owner.mjs':{SidecarOwner:Owner},'host-theme.mjs':{readHostTheme:async()=>({})},
    'panel-source.mjs':{panelAppSource:()=>'',panelPageSource:()=>''},
    'updater.mjs':{AppUpdater:class{},releaseRuntimeDirectory(){}},
    'history.mjs':{SessionHistory:class{}},'transcript.mjs':{TranscriptReader:class{},transcriptBrainRoot:()=>''},
    'client.mjs':{IdeClient:class{}},'runtime.mjs':{ideTargets:async()=>({targets:[],port:0})},
  };
  const entry=new SourceTextModule(source,{context,identifier:url,initializeImportMeta(meta){meta.url=url;}});
  await entry.link(async specifier=>{
    const key=specifier.startsWith('node:')?specifier:specifier.split('/').at(-1),values=native[key]||modules[key];
    if(!values)throw Error('Unexpected import '+specifier);
    return new SyntheticModule(Object.keys(values),function(){for(const [name,value]of Object.entries(values))this.setExport(name,value);},{context});
  });
  await entry.evaluate();
  if(selection){
    const child='22222222-2222-2222-2222-222222222222';
    for(const input of [{},{conversationId:null},{conversationId:undefined},{conversationId:child,force:true,selectLatest:true}])await snapshot(input);
    const inlineInputs=state.metricsInputs.splice(0),statuses=[];
    if(host==='app'){
      for(const input of [{},{conversationId:null},{conversationId:child,force:'1',selectLatest:false}])await apis.get('/api/metrics')(input);
    }else{
      for(const query of ['', '?conversationId=', '?conversationId='+child+'&force=1&selectLatest=false']){
        await http({method:'GET',url:'/api/metrics'+query,headers:{host:'127.0.0.1:17891'}},{setHeader(){},writeHead(status){statuses.push(status);},end(){}});
      }
    }
    return {inlineInputs,panelInputs:state.metricsInputs,statuses};
  }
  for(const input of [{conversationId:'fixture'}, {force:true}, {conversationId:'fixture',force:true}, {conversationId:'fixture',force:true,usageSync:'true'}])await snapshot(input);
  const ordinarySyncs=state.syncs.length,ordinarySnapshots=[...state.snapshots];
  await snapshot({conversationId:'fixture',force:true,usageSync:true});
  const active=state.predicates.map(owns=>typeof owns()==='boolean'&&owns()===true);
  const reads=state.diskReads;for(let i=0;i<1000;i++)for(const owns of state.predicates)owns();
  const hotPathReads=state.diskReads-reads;
  await state.store.onTrajectory('account','fixture',{});
  // A backend can reconnect while asynchronous ownership verification waits.
  // A previous session's raw data must not enter the new collector epoch.
  let releaseGate,stillCurrent=true;
  state.ownerGate=new Promise(resolve=>{releaseGate=resolve;});
  const delayed=state.store.onTrajectory('account','fixture',{}, {isCurrent:()=>stillCurrent,guardKey:{}});
  stillCurrent=false;releaseGate();await delayed;state.ownerGate=null;
  state.owned=false;
  const inactive=state.predicates.map(owns=>owns()===false);
  await state.store.onTrajectory('account','fixture',{});
  let refused=false;try{await snapshot({conversationId:'fixture',force:true,usageSync:true});}catch{refused=true;}
  return {ordinarySyncs,ordinarySnapshots,explicitSyncs:state.syncs.slice(ordinarySyncs),explicitSnapshot:state.snapshots.at(-1),active,inactive,hotPathReads,refused,ingests:state.ingests};
}

for(const host of ['app','ide'])test(`${host} real entrypoint gates history and passes synchronous ownership predicates`,()=>{
  const url=new URL(host==='ide'?'../../../ide/main.mjs':'../main.mjs',import.meta.url).href;
  const script=`(${entryFixture.toString()})(${JSON.stringify(host)},${JSON.stringify(url)}).then(value=>console.log(JSON.stringify(value)))`;
  const result=spawnSync(process.execPath,['--experimental-vm-modules','--input-type=module','-e',script],{encoding:'utf8',timeout:15000,windowsHide:true});
  assert.equal(result.status,0,result.stderr);
  const value=JSON.parse(result.stdout.trim());
  assert.equal(value.ordinarySyncs,0,'ordinary polling/force/non-boolean flags must not import history');
  assert.ok(value.ordinarySnapshots.every(options=>options?.sync===false));
  assert.deepEqual(value.explicitSyncs,[true]);assert.equal(value.explicitSnapshot.sync,true);
  assert.ok(value.active.every(Boolean),'active owns must synchronously return true');
  assert.ok(value.inactive.every(Boolean),'lost ownership must synchronously return false');
  assert.equal(value.hotPathReads,0,'ownership callbacks must not read settings from disk');
  assert.equal(value.refused,true,'superseded entrypoint must refuse new metrics/import requests');
  assert.equal(value.ingests,1,'superseded trajectory callbacks must not write usage');
});

for(const host of ['app','preview'])test(`${host} real entrypoint keeps unknown inline selection separate from panel defaults`,()=>{
  const url=new URL('../main.mjs',import.meta.url).href;
  const script=`(${entryFixture.toString()})(${JSON.stringify(host)},${JSON.stringify(url)},true).then(value=>console.log(JSON.stringify(value)))`;
  const result=spawnSync(process.execPath,['--experimental-vm-modules','--input-type=module','-e',script],{encoding:'utf8',timeout:15000,windowsHide:true});
  assert.equal(result.status,0,result.stderr);
  const value=JSON.parse(result.stdout.trim());
  assert.equal(value.inlineInputs.length,4);assert.ok(value.inlineInputs.every(input=>input.selectLatest===false));
  assert.equal(value.inlineInputs.at(-1).conversationId,'22222222-2222-2222-2222-222222222222');
  assert.equal(value.inlineInputs.at(-1).force,true);
  assert.equal(value.panelInputs.length,3);assert.ok(value.panelInputs.every(input=>!Object.hasOwn(input,'selectLatest')));
  assert.equal(value.panelInputs.at(-1).conversationId,'22222222-2222-2222-2222-222222222222');
  assert.equal(value.panelInputs.at(-1).force,true);
  if(host==='preview')assert.deepEqual(value.statuses,[200,200,200]);
});
