import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SidecarOwner} from '../compat/sidecar-owner.mjs';
import {RuntimeUi,makeRendererSource} from '../compat/runtime-ui.mjs';
import {PreferencesStore} from '../compat/preferences.mjs';
import {MetricsStore} from '../sidecars/panel/store.mjs';
import {SessionHistory} from '../sidecars/panel/history.mjs';
import {TranscriptReader,transcriptBrainRoot} from '../sidecars/panel/transcript.mjs';
import {DesktopUsage as LocalUsage,UsageLedger} from '../sidecars/panel/usage.mjs';
import {IdeClient} from './client.mjs';
import {ideTargets} from './runtime.mjs';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const profile=process.env.AG_PULSE_IDE_PROFILE;
if(!profile)throw Error('IDE profile is required');
const data=process.env.AG_PULSE_IDE_DATA||join(profile,'User','globalStorage','you-should-know-me.antigrative-dashboard-ide');
let debugPort=0;
const client=new IdeClient({profile,debugPort:()=>debugPort});
const ownership=new SidecarOwner(data);
const store=new MetricsStore(client,{history:new SessionHistory(join(data,'history-v1')),transcripts:new TranscriptReader({root:transcriptBrainRoot('ide')}),owns:()=>ownership.owns()});
const usage=new LocalUsage(store,new UsageLedger(join(data,'usage-v1'),{source:'ide-local'}),{host:'ide',owns:()=>ownership.owns()});
store.onTrajectory=async(scope,id,raw,options={})=>{
  const {isCurrent=()=>true}=options;
  if(isCurrent()!==true)return;
  if(await ownership.isOwner()&&isCurrent()===true)return usage.ingestLive(scope,id,raw,{...options,isCurrent});
};
store.onBackgroundResult=(scope,id,file,options)=>usage.ingestDisk(scope,id,file,options);
const preferences=new PreferencesStore({file:join(data,'preferences.json')});
const files=await Promise.all(['compat/i18n.cjs','compat/inline-widget.cjs','compat/theme.cjs','ide/surface.cjs','compat/usage-ui.cjs'].map(f=>readFile(join(root,f),'utf8')));
const extract=s=>s.slice(s.indexOf('module.exports = ')+17).trim().replace(/;$/,'');
if(!await ownership.claim())process.exit(0);
const usageSource=`window.__agPulseUsageFactory=(${extract(files[4])});`;
const owner=ownership.token,source=makeRendererSource(...files.slice(0,3),owner,ownership.startedAt,usageSource);
const adapter=`window.__agPulseSurface=(${extract(files[3])})();`;
// Each workbench has its own bridge request ID and DOM conversation ID. Empty
// composers request account quota only; no most-recent-conversation fallback.
const snapshot=async input=>{
  if(!await ownership.isOwner())throw Error('Sidecar ownership changed');
  let value;
  if(input.conversationId)value=await store.snapshot(input);
  else{
    try{
      const server=await client.discover();
      if(server.pid!==store.serverPid){store.epoch++;store.background?.reset();store.delegated.reset();store.transcripts?.reset();store.identity=null;store.quota=null;store.quotaAt=0;store.sessions.clear();store.clearUsagePersistenceErrors();store.serverPid=server.pid;}
      await store.refreshQuota(input.force);
      value={connection:'live',speed:null,groups:store.quota||[],quotaUpdatedAt:new Date(store.quotaAt).toISOString()};
    }catch{value={connection:'offline',speed:null,groups:[],error:'IDE local API unavailable'};}
  }
  if(input.usageSync===true)void usage.sync(true);
  return {...value,usage:await usage.snapshot({sync:input.usageSync===true}),enabled:true,preferences:await preferences.snapshot()};
};
const ui=new RuntimeUi({profile,source:adapter+source,owner,owns:()=>ownership.isOwner(),preferences,snapshot,dataDir:data,targetOrigin:()=> 'vscode-file://vscode-app',
  discover:async()=>{const result=await ideTargets(profile);debugPort=result.port;await client.discover();return result.targets;}});
await mkdir(data,{recursive:true});
await writeFile(join(data,'runtime.json'),JSON.stringify({pid:process.pid,startedAt:new Date().toISOString(),mode:'ide'}));
ui.start();
const keepAlive=setInterval(()=>{},60000);
async function stop(){usage.dispose();store.dispose();clearInterval(keepAlive);await ui.stop();ownership.stop();process.exit(0);}
ownership.watch(stop);
process.on('message',message=>{if(message?.type==='stop')void stop();});
if(process.connected)process.once('disconnect',()=>{void stop();});
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{void stop();});
