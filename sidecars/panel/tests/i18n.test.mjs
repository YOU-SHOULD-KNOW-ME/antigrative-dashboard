import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const create=createRequire(import.meta.url)('../../../compat/i18n.cjs');

test('all locales have matching translation keys and interpolation parameters',()=>{
  const dictionaries=Function('return ('+create.toString().replace('let language=', 'return dictionary; let language=')+')')()();
  const keys=Object.keys(dictionaries.en).sort();
  const parameters=text=>[...text.matchAll(/\{(\w+)\}/g)].map(x=>x[1]).sort();
  for(const locale of ['zh-CN','zh-TW']){
    assert.deepEqual(Object.keys(dictionaries[locale]).sort(),keys);
    for(const key of keys)assert.deepEqual(parameters(dictionaries[locale][key]),parameters(dictionaries.en[key]),locale+':'+key);
  }
});

test('Traditional locale has safe error fallback, valid remembered toggle and UTC+8 display',()=>{
  const language=create('zh-TW');
  assert.equal(language.errorMessage('未知错误'),language.t('panelUnavailable'));
  assert.equal(language.t('not-a-translation-key'),'not-a-translation-key');
  assert.equal(language.resetDate('2026-10-06T17:15:00Z'),new Intl.DateTimeFormat('zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Shanghai'}).format(new Date('2026-10-06T17:15:00Z')));
  language.setLanguage('invalid');assert.equal(language.language,'en');assert.equal(language.toggle(),'zh-TW');
});

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
test('Traditional Chinese (zh-TW) provides accurate localized terminology and toggle support',()=>{
  const language=create('zh-TW'),now=Date.parse('2026-10-06T08:00:00Z');
  assert.equal(language.language,'zh-TW');
  assert.equal(language.t('cache'),'快取命中');
  assert.equal(language.t('cacheRate'),'快取命中率');
  assert.equal(language.t('cacheMiss'),'未快取輸入');
  assert.equal(language.t('panelSpeed'),'速率');
  assert.equal(language.t('panelCache'),'快取');
  assert.equal(language.t('panelSharedQuota'),'共用配額');
  assert.equal(language.t('sample',{rounds:2,steps:6,requests:3}),'2 輪 6 步 · 3 次取樣');
  assert.equal(language.countdown('2026-10-08T10:00:00Z',now),'2天 02:00:00');
  assert.equal(language.elapsed(90),'1 分 30 秒');
  assert.equal(language.errorMessage('请先打开 Antigravity'),'請先開啟 Antigravity');
  assert.equal(language.errorMessage('未找到 Antigravity 桌面后台'),'找不到 Antigravity 桌面背景程式');
  assert.equal(language.errorMessage('会话统计数据超过内存预算'),'對話統計資料超出記憶體預算');
  assert.equal(language.errorMessage('Antigravity 接口 GetUserStatus 返回 401'),'Antigravity API GetUserStatus 回傳 HTTP 401');
  const saved=language.toggle();assert.equal(saved,'en');
  assert.equal(language.toggle(),'zh-TW');
});
