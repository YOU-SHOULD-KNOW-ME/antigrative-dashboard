import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const create=createRequire(import.meta.url)('../../../compat/i18n.cjs');

test('English is the first-use default, regardless of browser/host language',()=>{
  for(const initial of [undefined,null,'','zh','fr']){
    const language=create(initial);assert.equal(language.language,'en');assert.equal(language.t('cacheTitle'),'Token usage');
  }
});
test('saved Chinese selection is restored and toggling translates text and countdowns immediately',()=>{
  const language=create('zh-CN'),now=Date.parse('2026-10-06T08:00:00Z');
  assert.equal(language.t('cacheTitle'),'Token 用量');
  assert.equal(language.countdown('2026-10-08T10:00:00Z',now),'2天 02:00:00');
  const saved=language.toggle();assert.equal(saved,'en');assert.equal(create(saved).t('cacheTitle'),'Token usage');
  assert.equal(language.countdown('2026-10-08T10:00:00Z',now),'2d 02:00:00');
  assert.equal(language.t('sample',{rounds:2,steps:6,requests:3}),'2 turns · 6 steps · 3 samples');
  language.toggle();assert.equal(language.t('sample',{rounds:2,steps:6,requests:3}),'2轮 6步 · 3 次采样');
});
test('expired resets do not imply refilled quota in either language',()=>{
  const language=create();const now=Date.parse('2026-10-06T08:00:00Z');
  assert.equal(language.countdown('2026-10-06T08:00:00Z',now),'Waiting for refresh');
  language.toggle();assert.equal(language.countdown('2026-10-06T08:00:00Z',now),'等待刷新');
  assert.equal(language.countdown(null,now),'—');
});
test('English errors do not leak untranslated Chinese backend messages',()=>{
  const language=create();assert.equal(language.errorMessage('请先打开 Antigravity'),'Open Antigravity to connect.');
  assert.equal(language.errorMessage('Antigravity 接口 GetUserStatus 返回 401'),'Antigravity GetUserStatus returned HTTP 401.');
  assert.equal(language.errorMessage('未知错误'),'Statistics are temporarily unavailable.');
  language.toggle();assert.equal(language.errorMessage('请先打开 Antigravity'),'请先打开 Antigravity');
  assert.equal(language.errorMessage('Waiting to reconnect'),'等待控件重新连接');
});
