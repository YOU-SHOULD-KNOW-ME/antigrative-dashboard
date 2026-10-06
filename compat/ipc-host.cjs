// Serialized into Antigravity's main process. Only the app's own local renderer
// can obtain sanitized Antigrative Dashboard metrics; no API credentials enter the renderer.
module.exports = function installAgPulseIpc(electron, authorities) {
  const http = require('node:http');
  const fs = require('node:fs');
  const path = require('node:path');
  const os = require('node:os');
  const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const offline = message => ({ connection:'offline', error:message, groups:[],speed:null,serverTime:new Date().toISOString() });
  electron.ipcMain.on('ag-pulse:diagnostic',(event,state={})=>{
    try {
      const origin=new URL(event.senderFrame?.url||event.sender.getURL());
      if(!['127.0.0.1','localhost','[::1]'].includes(origin.hostname))return;
      if(!['boot','mounted','mount-error'].includes(state.stage))return;
      const dir=path.join(os.homedir(),'.gemini','antigravity','sidecar_data','antigravity-pulse','panel','logs');
      fs.mkdirSync(dir,{recursive:true});
      const safe={stage:state.stage,hostFound:state.hostFound===true,editorFound:state.editorFound===true,composerFound:state.composerFound===true};
      fs.appendFileSync(path.join(dir,'widget.log'),`${new Date().toISOString()} ${JSON.stringify(safe)}\n`);
    }catch{}
  });
  electron.ipcMain.handle('ag-pulse:metrics', async (event, input={}) => {
    let origin;
    try { origin = new URL(event.senderFrame?.url || event.sender.getURL()); } catch { return offline('来源不可用'); }
    if (!['127.0.0.1','localhost','[::1]'].includes(origin.hostname) || !['http:','https:'].includes(origin.protocol)) return offline('仅允许 Antigravity 本地界面');
    for(const [file,disabled] of [
      [path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'AntigravityPulse','settings.json'),s=>s.enabled===false],
      [path.join(os.homedir(),'.gemini','config','config.json'),s=>s.plugins?.['antigravity-pulse']?.enabled===false],
    ]) {
      try {if(disabled(JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''))))return {...offline('Antigrative Dashboard 已停用'),enabled:false};}catch{}
    }
    if (input.conversationId && !GUID.test(input.conversationId)) return offline('会话标识无效');
    let endpoint = [...authorities].find(([key])=>key.startsWith('antigravity-pulse--panel-'))?.[1];
    if (!endpoint) {
      // The native UI feature may be hidden, but the installed plugin process
      // still runs. Its own SDK log announces the loopback port.
      try {
        const file=path.join(os.homedir(),'.gemini','antigravity','sidecar_data','antigravity-pulse','panel','logs','sidecar.log');
        const log=fs.readFileSync(file,'utf8').slice(-262144);
        const port=[...log.matchAll(/\[sidecar\] listening on 127\.0\.0\.1:(\d+)/g)].at(-1)?.[1];
        if(port)endpoint=`http://127.0.0.1:${port}/`;
      } catch {}
    }
    if (!endpoint) return offline('等待 Antigrative Dashboard 后台启动');
    const url=new URL(endpoint);
    if (!['127.0.0.1','localhost','[::1]'].includes(url.hostname) || url.protocol!=='http:') return offline('控件接口地址无效');
    url.hostname='127.0.0.1'; url.pathname='/api/metrics';url.search='';
    if(input.conversationId)url.searchParams.set('conversationId',input.conversationId);
    if(input.force===true)url.searchParams.set('force','1');
    return await new Promise(resolve=>{
      const req=http.get(url,res=>{
        let body='';res.setEncoding('utf8');
        res.on('data',chunk=>{body+=chunk;if(body.length>1048576)req.destroy(new Error('Metrics too large'));});
        res.on('end',()=>{try{if(res.statusCode!==200)throw new Error();const metrics=JSON.parse(body);if(!['live','stale','offline'].includes(metrics.connection))throw new Error();resolve(metrics);}catch{resolve(offline('控件暂时不可用'));}});
      });
      req.on('error',()=>resolve(offline('等待 Antigrative Dashboard 重新连接')));
      req.setTimeout(15000,()=>req.destroy(new Error('Metrics timeout')));
    });
  });
};
