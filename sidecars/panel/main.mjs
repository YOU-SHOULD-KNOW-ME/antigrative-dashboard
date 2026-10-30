import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { MetricsStore } from './store.mjs';
import { DesktopUsage } from './usage.mjs';
import { loadSidecarSdk } from './sdk.mjs';
import { RuntimeUi, makeRendererSource } from '../../compat/runtime-ui.mjs';
import { platformPaths } from '../../compat/platform.mjs';
import { PreferencesStore } from '../../compat/preferences.mjs';
import { SidecarOwner } from '../../compat/sidecar-owner.mjs';
import { readHostTheme } from '../../compat/host-theme.mjs';
import { panelAppSource,panelPageSource } from './panel-source.mjs';
import { AppUpdater, releaseRuntimeDirectory } from './updater.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
// The host starts this sidecar in sidecars/panel. Windows holds the process's
// current directory open; release that handle before an update renames sidecars.
try { releaseRuntimeDirectory(join(HERE,'..','..')); } catch {}
const createTheme=createRequire(import.meta.url)('../../compat/theme.cjs');
const themeCss=()=>createTheme().css(':root');
const paths=platformPaths();
const ownership=process.env.ANTIGRAVITY_SIDECAR_WEB_PORT?new SidecarOwner(paths.data):null;
let settingsCache={},settingsAt=-Infinity;
const owns=()=>(!ownership||ownership.owns())&&settingsCache.enabled!==false;
const store = new MetricsStore(undefined,{owns});
const usage=new DesktopUsage(store,undefined,{host:'app',owns});
store.onTrajectory=async(scope,id,raw)=>{if(!ownership||await ownership.isOwner())await usage.ingest(scope,id,raw);};
const preferences=new PreferencesStore();
const updater=new AppUpdater({pluginDir:join(HERE,'..','..'),dataDir:paths.data});
const metrics = async input => {
  if(ownership&&!await ownership.isOwner())throw Error('Sidecar ownership changed');
  runtimeSettings();
  const base=await store.snapshot(input);if(input?.usageSync===true)void usage.sync(true);
  return {...base,usage:await usage.snapshot({sync:input?.usageSync===true}),preferences:await preferences.snapshot(),theme:await readHostTheme(),integration:integration.health};
};
const usageSource=()=>{const s=readFileSync(join(HERE,'..','..','compat','usage-ui.cjs'),'utf8');return `window.__agPulseUsageFactory=(${s.slice(s.indexOf('module.exports = ')+17).trim().replace(/;$/,'')});`;};
const updateSource=()=>{const s=readFileSync(join(HERE,'..','..','compat','update-ui.cjs'),'utf8');return `window.__agPulseUpdateFactory=(${s.slice(s.indexOf('module.exports = ')+17).trim().replace(/;$/,'')});`;};
const staticFiles = { '/': ['index.html', 'text/html'], '/styles.css': ['styles.css', 'text/css'], '/format.mjs': ['format.mjs', 'text/javascript'] };
const inlineSource=()=>{
  const file=readFileSync(join(HERE,'..','..','compat','inline-widget.cjs'),'utf8');
  const i18n=readFileSync(join(HERE,'..','..','compat','i18n.cjs'),'utf8');
  const theme=readFileSync(join(HERE,'..','..','compat','theme.cjs'),'utf8');
  const extract=s=>s.slice(s.indexOf('module.exports = ')+'module.exports = '.length).trim().replace(/;$/,'');
  return updateSource()+usageSource()+`window.__agPulseI18nFactory=(${extract(i18n)});window.__agPulseThemeFactory=(${extract(theme)});(${extract(file)})();`;
};
const i18nModule=()=>{const s=readFileSync(join(HERE,'..','..','compat','i18n.cjs'),'utf8');return 'export const createI18n='+s.slice(s.indexOf('module.exports = ')+'module.exports = '.length);};
const themeModule=()=>{const s=readFileSync(join(HERE,'..','..','compat','theme.cjs'),'utf8');return 'export const createTheme='+s.slice(s.indexOf('module.exports = ')+'module.exports = '.length);};
const runtimeSettings = () => {
  if(Date.now()-settingsAt<1000)return settingsCache;
  let settings = {};
  try { settings = JSON.parse(readFileSync(paths.settings,'utf8').replace(/^\uFEFF/,'')); } catch {}
  try { if (JSON.parse(readFileSync(paths.pluginConfig,'utf8').replace(/^\uFEFF/,'')).plugins?.['antigravity-pulse']?.enabled === false) settings.enabled = false; } catch {}
  settingsCache=settings;settingsAt=Date.now();return settings;
};
const integration = new RuntimeUi({
  // Composer identity is authoritative. Unknown/new inline inputs request quota
  // only; SDK/HTTP panels keep the store's automatic most-recent selection.
  snapshot: input => metrics({...input,selectLatest:false}),
  preferences,
  updater,
  owner:ownership?.token,owns:()=>ownership?ownership.isOwner():true,
  source: makeRendererSource(readFileSync(join(HERE,'..','..','compat','i18n.cjs'),'utf8'),readFileSync(join(HERE,'..','..','compat','inline-widget.cjs'),'utf8'),readFileSync(join(HERE,'..','..','compat','theme.cjs'),'utf8'),ownership?.token,ownership?.startedAt,updateSource()+usageSource()),
  dataDir: paths.data,
  enabled: () => { const s = runtimeSettings(); return s.enabled !== false && s.inline !== false && s.mode !== 'legacy'; },
});

if (process.env.ANTIGRAVITY_SIDECAR_WEB_PORT) {
  const { SidecarApp, Response } = await loadSidecarSdk();
  if(!await ownership.claim())process.exit(0);
  const app = new SidecarApp();
  for (const [path, [file, type]] of Object.entries(staticFiles)) app.api(path, () => new Response(path==='/'?panelPageSource():readFileSync(join(HERE, file), 'utf8'), { contentType: type,headers:{'Cache-Control':'no-store'} }), 'GET');
  app.page('/app.js',()=>new Response(panelAppSource(),{contentType:'application/javascript',headers:{'Cache-Control':'no-store'}}));
  app.page('/i18n.js',i18nModule);
  app.page('/theme.js',themeModule);
  app.api('/theme.css',()=>new Response(themeCss(),{contentType:'text/css'}),'GET');
  app.api('/api/metrics', data => metrics({ conversationId: data.conversationId || null, force: data.force === true || data.force === '1' }), 'GET');
  app.api('/api/integration', () => integration.health, 'GET');
  app.api('/api/preferences',()=>preferences.snapshot(),'GET');
  app.api('/api/preferences',async data=>{try{return await preferences.set(data);}catch{return new Response(JSON.stringify({error:'Language preference could not be saved'}),{status:400,contentType:'application/json'});}},'POST');
  app.run();
  integration.start();
  const shutdown=async()=>{
    usage.dispose();store.dispose();
    const exitTimer=setTimeout(()=>process.exit(0),2000);exitTimer.unref();
    await integration.stop();ownership.stop();process.exit(0);
  };
  ownership.watch(shutdown);
  updater.onReload=()=>void shutdown();
  for (const signal of ['SIGTERM','SIGINT']) process.once(signal, () => {
    void shutdown();
  });
} else {
  // A dependency-free local preview uses the same collector and frontend.
  const port = Number(process.env.AG_PULSE_PORT || 17891);
  const server = createServer(async (req, res) => {
    const host = req.headers.host || '';
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) { res.writeHead(403); res.end(); return; }
    const url = new URL(req.url, `http://${host}`);
    if (url.pathname === '/api/preferences') {
      const sameOrigin=req.headers.origin===`http://${host}`;
      if(req.headers.origin&&!sameOrigin){res.writeHead(403);res.end();return;}
      res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
      if(req.method==='GET'){res.end(JSON.stringify(await preferences.snapshot()));return;}
      if(req.method==='POST'&&sameOrigin&&String(req.headers['content-type']).startsWith('application/json')){
        let body='';
        try {for await(const chunk of req){body+=chunk;if(body.length>1024)throw new Error('Preference payload too large');}
          res.end(JSON.stringify(await preferences.set(JSON.parse(body))));
        }catch{res.writeHead(400);res.end(JSON.stringify({error:'Language preference could not be saved'}));}
        return;
      }
      res.writeHead(405);res.end();return;
    }
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (url.pathname === '/api/metrics') {
      if (req.headers.origin && req.headers.origin !== `http://${host}`) { res.writeHead(403); res.end(); return; }
      try { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(await metrics({ conversationId: url.searchParams.get('conversationId'), force: url.searchParams.get('force') === '1' }))); }
      catch { res.writeHead(500); res.end('{"error":"数据暂时不可用"}'); }
      return;
    }
    if (url.pathname === '/api/integration') { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(integration.health)); return; }
    if (url.pathname === '/preload.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end('// Standalone preview: no host bridge.'); return; }
    if(url.pathname==='/i18n.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});res.end(i18nModule());return;}
    if(url.pathname==='/theme.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});res.end(themeModule());return;}
    if(url.pathname==='/theme.css'){res.writeHead(200,{'Content-Type':'text/css; charset=utf-8'});res.end(themeCss());return;}
    if(url.pathname==='/inline-widget.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});res.end(inlineSource());return;}
    if(url.pathname==='/app.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});res.end(panelAppSource());return;}
    if(url.pathname.startsWith('/toolbar-preview')){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(readFileSync(join(HERE,'toolbar-preview.html')));return;}
    const file = staticFiles[url.pathname];
    if (!file) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8` }); res.end(url.pathname==='/'?panelPageSource():readFileSync(join(HERE, file[0])));
  });
  server.listen(port, '127.0.0.1', () => console.log(`Antigrative Dashboard: http://127.0.0.1:${port}`));
}
