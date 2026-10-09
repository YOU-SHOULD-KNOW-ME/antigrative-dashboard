import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';
import { MetricsStore } from './store.mjs';
import { loadSidecarSdk } from './sdk.mjs';
import { RuntimeUi, makeRendererSource } from '../../compat/runtime-ui.mjs';
import { platformPaths } from '../../compat/platform.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const createTheme=createRequire(import.meta.url)('../../compat/theme.cjs');
const themeCss=()=>createTheme().css(':root');
const store = new MetricsStore();
const staticFiles = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'], '/format.mjs': ['format.mjs', 'text/javascript'] };
const inlineSource=()=>{
  const file=readFileSync(join(HERE,'..','..','compat','inline-widget.cjs'),'utf8');
  const i18n=readFileSync(join(HERE,'..','..','compat','i18n.cjs'),'utf8');
  const theme=readFileSync(join(HERE,'..','..','compat','theme.cjs'),'utf8');
  const extract=s=>s.slice(s.indexOf('module.exports = ')+'module.exports = '.length).trim().replace(/;$/,'');
  return `window.__agPulseI18nFactory=(${extract(i18n)});window.__agPulseThemeFactory=(${extract(theme)});(${extract(file)})();`;
};
const i18nModule=()=>{const s=readFileSync(join(HERE,'..','..','compat','i18n.cjs'),'utf8');return 'export const createI18n='+s.slice(s.indexOf('module.exports = ')+'module.exports = '.length);};
const themeModule=()=>{const s=readFileSync(join(HERE,'..','..','compat','theme.cjs'),'utf8');return 'export const createTheme='+s.slice(s.indexOf('module.exports = ')+'module.exports = '.length);};
const runtimeSettings = () => {
  let settings = {};
  try { settings = JSON.parse(readFileSync(platformPaths().settings,'utf8').replace(/^\uFEFF/,'')); } catch {}
  try { if (JSON.parse(readFileSync(join(homedir(),'.gemini','config','config.json'),'utf8').replace(/^\uFEFF/,'')).plugins?.['antigravity-pulse']?.enabled === false) settings.enabled = false; } catch {}
  return settings;
};
const integration = new RuntimeUi({
  snapshot: input => store.snapshot(input),
  source: makeRendererSource(readFileSync(join(HERE,'..','..','compat','i18n.cjs'),'utf8'),readFileSync(join(HERE,'..','..','compat','inline-widget.cjs'),'utf8'),readFileSync(join(HERE,'..','..','compat','theme.cjs'),'utf8')),
  dataDir: platformPaths().data,
  enabled: () => { const s = runtimeSettings(); return s.enabled !== false && s.inline !== false && s.mode !== 'legacy'; },
});
const metrics = async input => ({ ...await store.snapshot(input), integration: integration.health });

if (process.env.ANTIGRAVITY_SIDECAR_WEB_PORT) {
  const { SidecarApp, Response } = await loadSidecarSdk();
  const app = new SidecarApp();
  for (const [path, [file, type]] of Object.entries(staticFiles)) app.api(path, () => new Response(readFileSync(join(HERE, file), 'utf8'), { contentType: type }), 'GET');
  app.page('/i18n.js',i18nModule);
  app.page('/theme.js',themeModule);
  app.api('/theme.css',()=>new Response(themeCss(),{contentType:'text/css'}),'GET');
  app.api('/api/metrics', data => metrics({ conversationId: data.conversationId || null, force: data.force === true || data.force === '1' }), 'GET');
  app.api('/api/integration', () => integration.health, 'GET');
  app.run();
  integration.start();
  for (const signal of ['SIGTERM','SIGINT']) process.once(signal, () => {
    const exitTimer = setTimeout(() => process.exit(0), 2000); exitTimer.unref();
    void integration.stop().finally(() => process.exit(0));
  });
} else {
  // A dependency-free local preview uses the same collector and frontend.
  const port = Number(process.env.AG_PULSE_PORT || 17891);
  const server = createServer(async (req, res) => {
    const host = req.headers.host || '';
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) { res.writeHead(403); res.end(); return; }
    const url = new URL(req.url, `http://${host}`);
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
    if(url.pathname.startsWith('/toolbar-preview')){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(readFileSync(join(HERE,'toolbar-preview.html')));return;}
    const file = staticFiles[url.pathname];
    if (!file) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8` }); res.end(readFileSync(join(HERE, file[0])));
  });
  server.listen(port, '127.0.0.1', () => console.log(`Antigrative Dashboard: http://127.0.0.1:${port}`));
}
