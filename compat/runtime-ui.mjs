// The plugin owns this adapter. App upgrades never need to preserve app.asar edits.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { join } from 'node:path';
import { platformPaths } from './platform.mjs';
import { createHash } from 'node:crypto';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BINDING = '__agPulseRuntimeCall';
const offline = message => ({ connection: 'offline', error: message, speed: null, groups: [] });

export function validTarget(target, port) {
  try {
    const page = new URL(target.url), ws = new URL(target.webSocketDebuggerUrl);
    return target.type === 'page' && ['http:', 'https:'].includes(page.protocol) && LOOPBACK.has(page.hostname)
      && ws.protocol === 'ws:' && LOOPBACK.has(ws.hostname) && Number(ws.port) === port;
  } catch { return false; }
}

export function validatedInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid metrics request');
  if (value.conversationId != null && !GUID.test(value.conversationId)) throw new Error('Invalid conversation ID');
  return { conversationId: value.conversationId || null, force: value.force === true };
}

function jsonGet(port, path) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method: 'GET' }, res => {
      let body = ''; res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; if (body.length > 1048576) req.destroy(new Error('Discovery response too large')); });
      res.on('end', () => { try { if (res.statusCode !== 200) throw new Error('Renderer discovery unavailable'); resolve(JSON.parse(body)); } catch (error) { reject(error); } });
    });
    req.on('error', reject); req.setTimeout(2000, () => req.destroy(new Error('Renderer discovery timeout'))); req.end();
  });
}

export async function discoverTargets(profile) {
  const text = await readFile(join(profile, 'DevToolsActivePort'), 'utf8');
  if (text.length > 1024) throw new Error('Invalid renderer discovery file');
  const port = Number(text.split(/\r?\n/)[0]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid renderer port');
  const targets = await jsonGet(port, '/json/list');
  if (!Array.isArray(targets)) throw new Error('Invalid renderer discovery response');
  return targets.filter(target => validTarget(target, port));
}

export class CdpConnection {
  constructor(url, { WebSocketImpl = globalThis.WebSocket, timeout = 5000, onEvent = () => {}, onClose = () => {} } = {}) {
    this.url = url; this.WebSocketImpl = WebSocketImpl; this.timeout = timeout; this.onEvent = onEvent; this.onClose = onClose;
    this.pending = new Map(); this.nextId = 0; this.closed = false;
  }
  async open() {
    if (!this.WebSocketImpl) throw new Error('This Node runtime has no WebSocket support');
    this.ws = new this.WebSocketImpl(this.url);
    this.ws.addEventListener('message', event => {
      try {
        if (typeof event.data !== 'string' || event.data.length > 2097152) return;
        const message = JSON.parse(event.data);
        if (message.id) {
          const item = this.pending.get(message.id); if (!item) return;
          this.pending.delete(message.id); clearTimeout(item.timer);
          if (message.error) item.reject(new Error('Renderer command failed: ' + message.error.code)); else item.resolve(message.result || {});
        } else if (message.method) this.onEvent(message);
      } catch { /* Ignore unrelated/malformed renderer events, without logging page data. */ }
    });
    this.ws.addEventListener('close', () => this.disconnect());
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.close(); reject(new Error('Renderer connection timeout')); }, this.timeout);
      this.ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.ws.addEventListener('error', () => { clearTimeout(timer); this.close(); reject(new Error('Renderer connection failed')); }, { once: true });
    });
    return this;
  }
  command(method, params = {}) {
    if (this.closed || this.ws?.readyState !== 1) return Promise.reject(new Error('Renderer disconnected'));
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Renderer command timeout')); }, this.timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.ws.send(JSON.stringify({ id, method, params })); } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  disconnect() {
    if (this.closed) return;
    this.closed = true;
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(new Error('Renderer disconnected')); }
    this.pending.clear(); this.onClose();
  }
  close() { this.disconnect(); this.ws?.close(); }
}

// Only sanitized metrics cross the bridge. No API credential or conversation text is exposed.
function rendererBridge() {
  if (window !== window.top) return;
  if (window.__agPulseRuntimeBridge && window.agPulseHost) return;
  window.__agPulseRuntimeBridge?.dispose();
  const pending = new Map(); let sequence = 0;
  const empty = () => ({ connection: 'offline', error: '等待 Antigrative Dashboard 重新连接', speed: null, groups: [], enabled: false });
  const call = (type, input) => new Promise(resolve => {
    if (pending.size >= 8) { resolve(empty()); return; }
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); resolve(empty()); }, 15000);
    pending.set(id, { resolve, timer });
    try { window.__agPulseRuntimeCall(JSON.stringify({ id, type, input })); } catch { clearTimeout(timer); pending.delete(id); resolve(empty()); }
  });
  window.__agPulseRuntimeBridge = {
    resolve(id, result) { const item = pending.get(id); if (!item) return; clearTimeout(item.timer); pending.delete(id); item.resolve(result); },
    dispose() { for (const item of pending.values()) { clearTimeout(item.timer); item.resolve(empty()); } pending.clear(); delete window.__agPulseRuntimeBridge; },
  };
  if (!window.agPulseHost) window.agPulseHost = { getMetrics: input => call('metrics', input), report: input => { void call('diagnostic', input); } };
}

export function makeRendererSource(i18n, widget) {
  const extract = source => {
    const prefix = 'module.exports = ', index = source.indexOf(prefix);
    if (index < 0) throw new Error('Widget source format changed');
    return source.slice(index + prefix.length).trim().replace(/;$/, '');
  };
  const version = createHash('sha256').update(i18n + widget + rendererBridge.toString()).digest('hex');
  const upgrade = 'if(window.__agPulseRuntimeVersion!==' + JSON.stringify(version) + '){window.__agPulseDispose?.();window.__agPulseRuntimeBridge?.dispose();delete window.agPulseHost;window.__agPulseRuntimeVersion=' + JSON.stringify(version) + ';}';
  return upgrade + '(' + rendererBridge.toString() + ')();window.__agPulseI18nFactory=(' + extract(i18n) + ');(' + extract(widget) + ')();';
}

export class RuntimeUi {
  constructor({ snapshot, source, profile = platformPaths().profile,
    dataDir, enabled = async () => true, discover = discoverTargets, connect = (url, options) => new CdpConnection(url, options), interval = 3000 } = {}) {
    this.snapshot = snapshot; this.source = source; this.profile = profile; this.dataDir = dataDir; this.enabled = enabled;
    this.discover = discover; this.connect = connect; this.interval = interval; this.sessions = new Map(); this.running = false;
    this.health = { state: 'waiting', mode: 'runtime', message: 'Waiting for the app renderer', windows: 0 };
  }
  async setHealth(state, message) {
    this.health = { state, mode: 'runtime', message, windows: this.sessions.size, checkedAt: new Date().toISOString() };
    if (this.dataDir) { try { await mkdir(this.dataDir, { recursive: true }); await writeFile(join(this.dataDir, 'integration-state.json'), JSON.stringify(this.health)); } catch { /* Read-only state reporting must not crash collection. */ } }
  }
  async event(connection, message) {
    const p = message.params || {};
    if (message.method === 'Runtime.executionContextCreated') {
      if (p.context?.auxData?.isDefault && p.context.auxData.frameId === connection.frameId && p.context.origin === connection.origin) connection.contexts.add(p.context.id);
      return;
    }
    if (message.method === 'Runtime.executionContextsCleared') { connection.contexts.clear(); return; }
    if (message.method === 'Runtime.executionContextDestroyed') { connection.contexts.delete(p.executionContextId); return; }
    if (message.method !== 'Runtime.bindingCalled' || p.name !== BINDING || !connection.contexts.has(p.executionContextId)) return;
    if (typeof p.payload !== 'string' || p.payload.length > 4096 || connection.inflight >= 8) return;
    let input;
    try { input = JSON.parse(p.payload); if (!Number.isSafeInteger(input.id) || input.id < 1) return; } catch { return; }
    connection.inflight++;
    try {
      let result = {};
      if (input.type === 'metrics') result = await this.enabled() ? await this.snapshot(validatedInput(input.input)) : { ...offline('Antigrative Dashboard 已停用'), enabled: false };
      else if (input.type === 'diagnostic' && ['boot', 'mounted', 'mount-error'].includes(input.input?.stage)) {
        if (input.input.stage === 'mounted' && input.input.editorFound && input.input.composerFound) connection.mounted = true;
      } else return;
      if (JSON.stringify(result).length > 1048576) result = offline('Metrics response too large');
      await connection.command('Runtime.evaluate', { expression: 'window.__agPulseRuntimeBridge?.resolve(' + input.id + ',' + JSON.stringify(result) + ')', contextId: p.executionContextId });
    } catch {
      try { await connection.command('Runtime.evaluate', { expression: 'window.__agPulseRuntimeBridge?.resolve(' + input.id + ',' + JSON.stringify(offline('等待 Antigrative Dashboard 重新连接')) + ')', contextId: p.executionContextId }); } catch { /* The next poll reconnects. */ }
    } finally { connection.inflight--; }
  }
  async attach(target) {
    let connection;
    connection = this.connect(target.webSocketDebuggerUrl, { onEvent: message => { void this.event(connection, message); } });
    connection.origin = new URL(target.url).origin;
    connection.contexts = new Set(); connection.inflight = 0; connection.mounted = false;
    try {
      await connection.open();
      const frame = await connection.command('Page.getFrameTree'); connection.frameId = frame.frameTree?.frame?.id;
      if (!connection.frameId) throw new Error('Main renderer frame unavailable');
      await connection.command('Runtime.enable');
      await connection.command('Runtime.addBinding', { name: BINDING });
      const guardedSource = 'if (location.origin === ' + JSON.stringify(connection.origin) + ') {' + this.source + '}';
      connection.guardedSource = guardedSource;
      connection.script = (await connection.command('Page.addScriptToEvaluateOnNewDocument', { source: guardedSource })).identifier;
      const result = await connection.command('Runtime.evaluate', { expression: guardedSource });
      if (result.exceptionDetails) throw new Error('Widget initialization failed');
      return connection;
    } catch (error) { connection.close(); throw error; }
  }
  async tick() {
    if (this.busy || this.stopping) return;
    this.busy = true;
    try {
      if (!await this.enabled()) { await this.detachAll(); await this.setHealth('disabled', 'Dashboard is disabled'); return; }
      const targets = await this.discover(this.profile), active = new Set(targets.map(t => t.webSocketDebuggerUrl));
      if (this.stopping) return;
      for (const [url, connection] of this.sessions) if (!active.has(url) || connection.closed) { connection.close(); this.sessions.delete(url); }
      for (const target of targets) {
        const connection = this.sessions.get(target.webSocketDebuggerUrl);
        if (connection && connection.origin !== new URL(target.url).origin) { connection.close(); this.sessions.delete(target.webSocketDebuggerUrl); }
      }
      for (const target of targets) if (!this.sessions.has(target.webSocketDebuggerUrl)) this.sessions.set(target.webSocketDebuggerUrl, await this.attach(target));
      if (this.stopping) { await this.detachAll(); return; }
      for (const [url, connection] of this.sessions) {
        try {
          const result = await connection.command('Runtime.evaluate', { returnByValue: true,
            expression: '({mounted:Boolean(document.getElementById("ag-pulse-status-bar")?.isConnected),installed:Boolean(window.__agPulseInlineInstalled),bridge:Boolean(window.__agPulseRuntimeBridge && window.agPulseHost)})' });
          const status = result.result?.value;
          connection.mounted = status?.mounted === true;
          // Startup can swap the document between discovery and first injection.
          // Reinstall missing hooks rather than waiting forever for a composer.
          if (status && (!status.installed || !status.bridge)) {
            const recovery = await connection.command('Runtime.evaluate', { expression: connection.guardedSource });
            if (recovery.exceptionDetails) throw new Error('Widget recovery failed');
          }
        } catch { connection.close(); this.sessions.delete(url); }
      }
      await this.setHealth([...this.sessions.values()].some(c => c.mounted) ? 'mounted' : this.sessions.size ? 'waiting-for-composer' : 'waiting',
        this.sessions.size ? 'Renderer connected; waiting for a conversation composer if needed' : 'Waiting for the app renderer');
    } catch { await this.setHealth('reconnecting', 'Inline connection unavailable; the side panel remains available. Retrying automatically.'); }
    finally { this.busy = false; }
  }
  async detachAll() {
    for (const connection of this.sessions.values()) {
      try {
        await connection.command('Runtime.evaluate', { expression: 'window.__agPulseDispose?.();window.__agPulseRuntimeBridge?.dispose();delete window.agPulseHost;' });
        if (connection.script) await connection.command('Page.removeScriptToEvaluateOnNewDocument', { identifier: connection.script });
        await connection.command('Runtime.removeBinding', { name: BINDING });
      } catch { /* A closed renderer has already removed its widget. */ }
      connection.close();
    }
    this.sessions.clear();
  }
  start() {
    if (this.running) return; this.running = true; this.stopping = false;
    void this.tick(); this.timer = setInterval(() => { void this.tick(); }, this.interval); this.timer.unref?.();
  }
  async stop() { this.running = false; this.stopping = true; clearInterval(this.timer); await this.detachAll(); }
}
