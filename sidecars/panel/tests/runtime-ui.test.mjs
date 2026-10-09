import test from 'node:test';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { CdpConnection, RuntimeUi, validTarget, validatedInput, makeRendererSource } from '../../../compat/runtime-ui.mjs';

const target = (id = 'one', port = 9123) => ({ type: 'page', url: 'https://127.0.0.1:5000/c/chat', webSocketDebuggerUrl: 'ws://127.0.0.1:' + port + '/devtools/page/' + id });
class FakeConnection {
  constructor(options) { this.options = options; this.calls = []; this.closed = false; }
  async open() { return this; }
  async command(method, params = {}) {
    this.calls.push({ method, params });
    if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'main' } } };
    if (method === 'Runtime.enable') this.options.onEvent({ method: 'Runtime.executionContextCreated', params: { context: { id: 7, origin: 'https://127.0.0.1:5000', auxData: { isDefault: true, frameId: 'main' } } } });
    if (method === 'Page.addScriptToEvaluateOnNewDocument') return { identifier: 'script' };
    if (method === 'Runtime.evaluate') return { result: { value: {mounted:true,installed:true,bridge:true} } };
    return {};
  }
  close() { this.closed = true; }
}
function fixture() {
  const connections = [], state = { targets: [target()], enabled: true, calls: 0 };
  const ui = new RuntimeUi({ snapshot: async input => { state.calls++; return { connection: 'live', groups: [], speed: null, input }; },
    source: 'safe-widget', discover: async () => state.targets, enabled: () => state.enabled,
    connect: (_, options) => { const c = new FakeConnection(options); connections.push(c); return c; } });
  return { ui, connections, state };
}

test('discovery rejects remote pages, iframe targets, wrong transports and ports', () => {
  assert.equal(validTarget(target(), 9123), true);
  for (const changed of [{ url: 'https://example.com/' }, { type: 'iframe' }, { webSocketDebuggerUrl: 'ws://example.com:9123/x' },
    { webSocketDebuggerUrl: 'wss://127.0.0.1:9123/x' }, { webSocketDebuggerUrl: 'ws://127.0.0.1:9999/x' }]) assert.equal(validTarget({ ...target(), ...changed }, 9123), false);
  assert.equal(validTarget({}, 9123), false);
});

test('binding requests accept only a conversation identifier and force flag', () => {
  assert.deepEqual(validatedInput({ conversationId: null, force: 1, apiKey: 'must-not-forward' }), { conversationId: null, force: false });
  assert.throws(() => validatedInput({ conversationId: "');fetch('https://example.com')" }));
  assert.throws(() => validatedInput([]));
});

test('app update replaces the renderer port and reconnects without archive edits', async () => {
  const { ui, connections, state } = fixture();
  await ui.tick(); await ui.tick(); assert.equal(connections.length, 1); assert.equal(ui.health.state, 'mounted');
  state.targets = [target('new-build', 9222)]; await ui.tick();
  assert.equal(connections.length, 2); assert.equal(connections[0].closed, true); assert.equal(ui.health.state, 'mounted');
  connections[1].closed = true; await ui.tick(); assert.equal(connections.length, 3);
  await ui.stop();
});

test('renderer absence and incompatible transport keep collection alive and recover', async () => {
  const { ui, state } = fixture(); state.targets = []; await ui.tick(); assert.equal(ui.health.state, 'waiting');
  ui.discover = async () => { throw new Error('updater is replacing files'); }; await ui.tick(); assert.equal(ui.health.state, 'reconnecting');
  ui.discover = async () => [target()]; await ui.tick(); assert.equal(ui.health.state, 'mounted'); await ui.stop();
});

test('a startup document replacement reinstalls missed hooks on the next heartbeat', async () => {
  const { ui, connections } = fixture(); await ui.tick(); const c = connections[0];
  const original = c.command.bind(c); let missing = true;
  c.command = async (method, params = {}) => {
    if (method === 'Runtime.evaluate' && params.returnByValue) return {result:{value:{mounted:!missing,installed:!missing,bridge:!missing}}};
    const result = await original(method, params);
    if (method === 'Runtime.evaluate' && params.expression === c.guardedSource) missing = false;
    return result;
  };
  const before = c.calls.filter(x=>x.params.expression === c.guardedSource).length;
  await ui.tick(); await ui.tick();
  assert.equal(c.calls.filter(x=>x.params.expression === c.guardedSource).length, before + 1);
  assert.equal(ui.health.state, 'mounted'); assert.equal(connections.length, 1);
  await ui.stop();
});

test('disable disposes UI, intervals and navigation hooks; reenable attaches once', async () => {
  const { ui, state, connections } = fixture(); await ui.tick(); state.enabled = false; await ui.tick();
  assert.equal(ui.sessions.size, 0); assert.equal(connections[0].closed, true); assert.equal(ui.health.state, 'disabled');
  assert.ok(connections[0].calls.some(c => c.method === 'Page.removeScriptToEvaluateOnNewDocument'));
  assert.ok(connections[0].calls.some(c => c.method === 'Runtime.removeBinding'));
  assert.ok(connections[0].calls.some(c => c.params.expression?.includes('__agPulseDispose')));
  state.enabled = true; await ui.tick(); assert.equal(connections.length, 2); await ui.stop();
});

test('iframe and malformed binding events never reach metric collection', async () => {
  const { ui, state, connections } = fixture(); await ui.tick(); const c = connections[0];
  const message = { method: 'Runtime.bindingCalled', params: { name: '__agPulseRuntimeCallV2', executionContextId: 8,
    payload: JSON.stringify({ id: 1, type: 'metrics', input: { conversationId: null } }) } };
  await ui.event(c, message); assert.equal(state.calls, 0);
  message.params.executionContextId = 7; message.params.payload = 'not-json'; await ui.event(c, message); assert.equal(state.calls, 0);
  message.params.payload = JSON.stringify({ id: 2, type: 'metrics', input: { conversationId: null } }); await ui.event(c, message); assert.equal(state.calls, 1);
  await ui.stop();
});

test('a sidecar left running before an update cannot answer the new protocol binding', async () => {
  const { ui, state, connections } = fixture(); await ui.tick(); const c = connections[0];
  const message = { method: 'Runtime.bindingCalled', params: { name: '__agPulseRuntimeCall', executionContextId: 7,
    payload: JSON.stringify({ id: 1, type: 'metrics', input: { conversationId: null } }) } };
  await ui.event(c, message); assert.equal(state.calls, 0);
  message.params.name = '__agPulseRuntimeCallV2'; await ui.event(c, message); assert.equal(state.calls, 1);
  const source = makeRendererSource('module.exports = function(){return {};};', 'module.exports = function(){};');
  assert.ok(source.includes('window.__agPulseRuntimeCallV2('));
  assert.equal(source.includes('window.__agPulseRuntimeCall('), false);
  await ui.stop();
});

test('stopping during renderer discovery prevents a late attach', async () => {
  const { ui, connections } = fixture(); let release;
  ui.discover = () => new Promise(resolve => { release = resolve; });
  const tick = ui.tick(); await new Promise(resolve => setImmediate(resolve)); await ui.stop(); release([target()]); await tick;
  assert.equal(connections.length, 0); assert.equal(ui.sessions.size, 0);
});

test('navigation to a remote origin cannot obtain metrics before the next discovery tick', async () => {
  const { ui, state, connections } = fixture(); await ui.tick(); const c = connections[0];
  await ui.event(c, { method: 'Runtime.executionContextsCleared' });
  await ui.event(c, { method: 'Runtime.executionContextCreated', params: { context: { id: 9, origin: 'https://example.com', auxData: { isDefault: true, frameId: 'main' } } } });
  await ui.event(c, { method: 'Runtime.bindingCalled', params: { name: '__agPulseRuntimeCallV2', executionContextId: 9,
    payload: JSON.stringify({ id: 1, type: 'metrics', input: { conversationId: null } }) } });
  assert.equal(state.calls, 0); assert.equal(c.contexts.size, 0); await ui.stop();
});

test('WebSocket disconnect rejects outstanding commands instead of hanging', async () => {
  class Socket extends EventEmitter {
    readyState = 1;
    constructor() { super(); Socket.last = this; queueMicrotask(() => this.emit('open')); }
    addEventListener(name, fn, options) { options?.once ? this.once(name, fn) : this.on(name, fn); }
    send() {}
    close() { this.readyState = 3; this.emit('close'); }
  }
  const c = await new CdpConnection('ws://127.0.0.1:1/', { WebSocketImpl: Socket }).open();
  const pending = c.command('Runtime.enable'); c.close(); await assert.rejects(pending, /disconnected/);
  assert.equal(c.pending.size, 0);
});

test('renderer injection does not depend on a particular host version or expose credentials', () => {
  const source = makeRendererSource('module.exports = function(){return {};};', 'module.exports = function(){};');
  assert.ok(source.includes('__agPulseRuntimeCallV2')); assert.ok(source.includes('window.top'));
  assert.equal(source.includes('csrf'), false); assert.equal(source.includes('access_token'), false);
  assert.throws(() => makeRendererSource('changed format', 'module.exports = function(){};'));
});

test('plugin source updates replace old hooks once and keep identical reinjections idempotent', () => {
  const window={};window.top=window;window.mounted=0;window.disposed=0;
  const i18n='module.exports = function(){return {};};';
  const widget='module.exports = function(){if(window.__agPulseInlineInstalled)return;window.__agPulseInlineInstalled=true;window.mounted++;window.__agPulseDispose=()=>{window.disposed++;window.__agPulseInlineInstalled=false;};};';
  const context={window,setTimeout,clearTimeout};
  const source=makeRendererSource(i18n,widget);runInNewContext(source,context);runInNewContext(source,context);
  assert.equal(window.mounted,1);assert.equal(window.disposed,0);
  runInNewContext(makeRendererSource(i18n,widget.replace('window.mounted++;','window.mounted++;window.updated=true;')),context);
  assert.equal(window.mounted,2);assert.equal(window.disposed,1);
});

test('palette-only updates replace the installed theme controller without stacking widgets', () => {
  const window={};window.top=window;window.mounted=0;window.disposed=0;
  const i18n='module.exports = function(){return {};};';
  const widget='module.exports = function(){window.mounted++;window.theme=window.__agPulseThemeFactory();window.__agPulseDispose=()=>{window.disposed++;};};';
  const context={window,setTimeout,clearTimeout};
  runInNewContext(makeRendererSource(i18n,widget,'module.exports = function(){return "old";};'),context);
  runInNewContext(makeRendererSource(i18n,widget,'module.exports = function(){return "new";};'),context);
  assert.equal(window.mounted,2);assert.equal(window.disposed,1);assert.equal(window.theme,'new');
});
