import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { MetricsStore } from './store.mjs';
import { loadSidecarSdk } from './sdk.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const store = new MetricsStore();
const staticFiles = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'], '/format.mjs': ['format.mjs', 'text/javascript'] };
const inlineSource=()=>{
  const file=readFileSync(join(HERE,'..','..','compat','inline-widget.cjs'),'utf8');
  return `(${file.slice(file.indexOf('module.exports = ')+'module.exports = '.length).trim().replace(/;$/,'')})();`;
};

if (process.env.ANTIGRAVITY_SIDECAR_WEB_PORT) {
  const { SidecarApp, Response } = await loadSidecarSdk();
  const app = new SidecarApp();
  for (const [path, [file, type]] of Object.entries(staticFiles)) app.api(path, () => new Response(readFileSync(join(HERE, file), 'utf8'), { contentType: type }), 'GET');
  app.api('/api/metrics', data => store.snapshot({ conversationId: data.conversationId || null, force: data.force === true || data.force === '1' }), 'GET');
  app.run();
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
      try { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(await store.snapshot({ conversationId: url.searchParams.get('conversationId'), force: url.searchParams.get('force') === '1' }))); }
      catch { res.writeHead(500); res.end('{"error":"数据暂时不可用"}'); }
      return;
    }
    if (url.pathname === '/preload.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end('// Standalone preview: no host bridge.'); return; }
    if(url.pathname==='/inline-widget.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});res.end(inlineSource());return;}
    if(url.pathname.startsWith('/toolbar-preview')){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(readFileSync(join(HERE,'toolbar-preview.html')));return;}
    const file = staticFiles[url.pathname];
    if (!file) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8` }); res.end(readFileSync(join(HERE, file[0])));
  });
  server.listen(port, '127.0.0.1', () => console.log(`Antigrative Dashboard: http://127.0.0.1:${port}`));
}
