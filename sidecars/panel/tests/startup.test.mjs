import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const install=createRequire(import.meta.url)('../../../compat/inline-widget.cjs');

test('early preload waits for the DOM rather than aborting startup',()=>{
  let callback=null;
  globalThis.window={agPulseHost:{getMetrics(){}}};
  globalThis.document={documentElement:null,addEventListener(event,handler,options){assert.equal(event,'DOMContentLoaded');assert.equal(options.once,true);callback=handler;}};
  install();
  assert.equal(callback,install);
  assert.equal(window.__agPulseInlineInstalled,undefined);
  delete globalThis.window;delete globalThis.document;
});
test('unavailable host API leaves the renderer untouched and supports retry',()=>{
  globalThis.window={};globalThis.document={documentElement:{}};
  install();assert.equal(window.__agPulseInlineInstalled,undefined);
  delete globalThis.window;delete globalThis.document;
});
