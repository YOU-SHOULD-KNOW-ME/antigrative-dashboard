// Read-only diagnostic of the installed plugin's own UI bridge. No titles, URLs, credentials or raw RPC records are printed.
import { join } from 'node:path';
import { homedir } from 'node:os';
import { discoverTargets, CdpConnection } from '../compat/runtime-ui.mjs';

const profile=join(process.env.APPDATA || join(homedir(),'AppData','Roaming'),'Antigravity');
const selected=process.argv[2] || null;
if(selected && !/^[0-9a-f-]{36}$/i.test(selected))throw new Error('Invalid diagnostic conversation');
for (const target of await discoverTargets(profile)) {
  const connection=await new CdpConnection(target.webSocketDebuggerUrl,{timeout:20000}).open();
  try {
    const result=await connection.command('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
      const widget=document.getElementById('ag-pulse-status-bar');
      const active=location.pathname.match(new RegExp('/c/([0-9a-f-]{36})','i'))?.[1] || null;
      const id=${JSON.stringify(selected)} || active;
      const data=await window.agPulseHost?.getMetrics({conversationId:/^[0-9a-f-]{36}$/i.test(id||'')?id:null,force:true});
      return {mounted:Boolean(widget?.isConnected),bridge:Boolean(window.__agPulseRuntimeBridge),activeConversation:Boolean(active),connection:data?.connection,error:data?.error,tps:data?.speed?.tps,cacheHit:data?.speed?.cache?.hitRate,restored:data?.speed?.restoredFromHistory,persistenceError:data?.persistenceError,uiTps:widget?.shadowRoot?.getElementById('tps')?.textContent,uiCache:widget?.shadowRoot?.getElementById('cache-rate')?.textContent};
    })()`});
    if(result.exceptionDetails)throw new Error('Installed plugin diagnostic failed');
    console.log(JSON.stringify(result.result?.value));
  } finally {connection.close();}
}
