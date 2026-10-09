import { percent, rate, count, elapsed, countdown, resetDate } from './format.mjs';
import { createI18n } from './i18n.js';
import { createTheme } from './theme.js';
const theme=createTheme();
let themeController=theme.attach(document.documentElement);
window.addEventListener('pagehide',()=>themeController.dispose());
window.addEventListener('pageshow',event=>{if(event.persisted)themeController=theme.attach(document.documentElement);});
const localGet=key=>{try{return localStorage.getItem(key);}catch{return null;}};
const localSet=(key,value)=>{try{localStorage.setItem(key,value);}catch{}};
const language=createI18n(localGet('ag-pulse-language'));
const t=language.t;

const $ = id => document.getElementById(id);
const compact=n=>typeof n!=='number'||!Number.isFinite(n)?'—':n>=1e9?`${(n/1e9).toFixed(1).replace(/\.0$/,'')}B`:n>=1e6?`${(n/1e6).toFixed(1).replace(/\.0$/,'')}M`:n>=1e3?`${(n/1e3).toFixed(1).replace(/\.0$/,'')}K`:String(n);
const chips = [...document.querySelectorAll('[data-card]')];
let snapshot = null, selectedGroup = localGet('ag-pulse-group'), group = null;
let pending = false, timer = null, leaveTimer = null, serverOffset = 0, lastExpiredRefresh = 0;
let refreshRequest=null,manualRequest=null;
const host = window.sidecar;
if (!host) document.body.classList.add('standalone');
const preferenceRequest=async(input)=>{
  const transport=host?.fetch?host.fetch.bind(host):fetch;
  const response=await transport('/api/preferences',input?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}:{cache:'no-store'});
  if(!response.ok)throw new Error('Preferences unavailable');return response.json();
};
const connectPreferences=()=>language.connectPreferences({read:()=>preferenceRequest(),write:preferenceRequest,
  cache:value=>localSet('ag-pulse-language',value),changed:()=>{localize();render();updateCountdowns();}});
let preferences=connectPreferences();

function showCard(name) {
  clearTimeout(leaveTimer);
  for (const chip of chips) chip.setAttribute('aria-expanded', String(chip.dataset.card === name));
  for (const nameKey of ['speed','cache','context']) $(`${nameKey}-card`).hidden = name !== nameKey;
  document.querySelector('.rest-state').style.visibility = name ? 'hidden' : '';
}
for (const chip of chips) {
  chip.addEventListener('mouseenter', () => showCard(chip.dataset.card));
  chip.addEventListener('focus', () => showCard(chip.dataset.card));
  chip.addEventListener('click', () => showCard(chip.dataset.card));
}
const widget = document.querySelector('.widget');
widget.addEventListener('mouseleave', () => { leaveTimer = setTimeout(() => { if (!widget.contains(document.activeElement)) showCard(null); }, 100); });
widget.addEventListener('focusout', () => { setTimeout(() => { if (!widget.contains(document.activeElement) && !widget.matches(':hover')) showCard(null); }, 0); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') { showCard(null); document.activeElement?.blur(); } });
function localize(){
  document.documentElement.lang=language.language;
  for(const e of document.querySelectorAll('[data-i18n]'))e.textContent=t(e.dataset.i18n);
  for(const e of document.querySelectorAll('[data-i18n-aria]'))e.setAttribute('aria-label',t(e.dataset.i18nAria));
  for(const e of document.querySelectorAll('[data-i18n-aria][title]'))e.title=t(e.dataset.i18nAria);
  $('language-toggle').textContent=language.language==='en'?'EN':'中';$('language-toggle').title=t('switchLanguage')+(preferences.error?' · '+t('languageSaveFailed'):'');$('language-toggle').dataset.saveFailed=String(preferences.error);
}

function chooseGroup(groups, speed) {
  if (selectedGroup && groups.some(g => g.id === selectedGroup)) return groups.find(g => g.id === selectedGroup);
  const model = String(speed?.model || '').toLowerCase();
  return groups.find(g => /gemini/.test(model) ? /gemini/i.test(g.id) : /claude|gpt/.test(model) ? /3p|claude|gpt/i.test(g.id) : false) || groups[0] || null;
}
function groupLabel(value) {
  return /gemini/i.test(value.name) ? 'Gemini' : /claude|gpt/i.test(value.name) ? 'Claude / GPT' : value.name;
}

function renderQuota(window, prefix) {
  const bucket = group?.windows?.[window];
  const remaining = bucket?.remaining;
  $(`${prefix}-balance`).textContent = percent(remaining);
  const fill = $(`${prefix}-fill`), track = $(`${prefix}-track`);
  fill.style.width = typeof remaining === 'number' ? `${remaining * 100}%` : '0%';
  fill.style.background = remaining !== null && remaining < .05 ? 'var(--pulse-danger)' : remaining !== null && remaining < .2 ? 'var(--pulse-warning)' : '';
  if (typeof remaining === 'number') { track.setAttribute('aria-valuenow', String(remaining * 100)); track.setAttribute('aria-valuemin','0'); track.setAttribute('aria-valuemax','100'); }
  else track.removeAttribute('aria-valuenow');
  $(`${prefix}-reset`).textContent = language.resetDate(bucket?.resetAt);
  $(`${prefix}-note`).textContent = !bucket?.available ? t('noQuota') : bucket.disabled ? t('disabledQuota') : remaining === null ? t('noFraction') : t('sharedQuota')+' '+t('quotaSource');
}

function render() {
  if (!snapshot) return;
  const groups = snapshot.groups || [], speed = snapshot.speed;
  group = chooseGroup(groups, speed);
  const optionsKey = groups.map(g => g.id).join('|');
  const select = $('quota-group');
  if (select.dataset.options !== optionsKey) {
    select.replaceChildren(...(groups.length ? groups.map(g => new Option(groupLabel(g),g.id)) : [new Option(t('unavailableQuota'),'')]));
    select.dataset.options = optionsKey;
  }
  if (group) select.value = group.id;
  for (const element of document.querySelectorAll('.group-name')) element.textContent = group ? groupLabel(group) : '—';
  renderQuota('5h','five'); renderQuota('weekly','week');
  $('strip-tps').textContent = rate(speed?.tps);
  $('session-tps').textContent = rate(speed?.tps);
  $('latest-tps').textContent = rate(speed?.latestTps);
  $('request-count').textContent = t('sampleCount',{n:speed?.measuredRequests??0});
  $('session-steps').textContent = speed ? t('rounds',{rounds:speed.rounds,steps:speed.steps}) : '';
  $('strip-model').textContent = speed?.model || t('waitingRequest');
  $('model-time').textContent = language.elapsed(speed?.modelSeconds);
  $('tool-time').textContent = language.elapsed(speed?.toolSeconds);
  $('ttft').textContent = language.elapsed(speed?.ttftSeconds);
  $('token-detail').textContent = speed ? `${count(speed.counts.responseOutput)} / ${count(speed.counts.thinkingOutput)} tok` : '—';
  const basis=t(speed?.rateBasis==='all-output'?'allBasis':'responseBasis');
  const savedNote=speed?.restoredFromHistory?' '+t('savedStats',{time:speed.savedAt?language.resetDate(speed.savedAt):'—'}):'';
  const saveWarning=snapshot.persistenceError?' '+t('saveFailed'):'';
  $('speed-basis').textContent = basis+(speed?.missingTiming?' '+t('missingTime',{n:speed.missingTiming}):'')+(speed?.latestShortSample?' '+t('shortSample'):'')+savedNote+saveWarning;
  const cache=speed?.cache;
  const context=speed?.context,hasCapacity=typeof context?.usedFraction==='number';
  $('strip-context').textContent=hasCapacity?`${Math.round(context.usedFraction*100)}%`:'—';
  $('context-summary').textContent=hasCapacity?t('contextUsed',{used:Math.round(context.usedFraction*100),remaining:Math.round(context.remainingFraction*100)}):t('contextUnknown');
  $('context-tokens').textContent=context?t('contextTokens',{used:compact(context.usedTokens),max:context.maxTokens===null?'—':compact(context.maxTokens)}):'—';
  $('context-model').textContent=context?.model||'—';
  const restored=context&&(speed.contextRestored===true||speed.restoredFromHistory&&speed.contextRestored!==false);
  $('context-note').textContent=(context?t('contextBasis'):t('contextUnavailable'))+(restored?' '+t('contextSaved',{time:speed.savedAt?language.resetDate(speed.savedAt):'—'}):'')+(hasCapacity&&context.usedFraction>1?' '+t('contextExceeded'):'');
  $('context-fill').style.width=hasCapacity?`${Math.min(1,context.usedFraction)*100}%`:'0%';
  $('context-fill').style.background=hasCapacity&&context.usedFraction>=.9?'var(--pulse-danger)':'';
  if(hasCapacity){$('context-track').setAttribute('aria-valuenow',String(Math.min(100,context.usedFraction*100)));$('context-track').setAttribute('aria-valuemin','0');$('context-track').setAttribute('aria-valuemax','100');}else $('context-track').removeAttribute('aria-valuenow');
  $('strip-cache').textContent=percent(cache?.hitRate);$('cache-rate').textContent=percent(cache?.hitRate);
  $('strip-cache-total').textContent=cache?.measuredRequests?`${compact(cache.totalTokens)} tok`:'— tok';
  for(const [field,id]of[['cachedTokens','cache-read'],['uncachedTokens','cache-miss'],['cacheWriteTokens','cache-write'],['outputTokens','cache-output']])$(id).textContent=cache?.measuredRequests?`${count(cache[field])} tok`:'—';
  $('cache-coverage').textContent=cache?.measuredRequests?`${count(cache.totalTokens)} tok`:'— tok';
  $('cache-write-row').hidden=!(cache?.cacheWriteTokens>0);
  $('cache-note').textContent=(cache?.measuredRequests?t('cacheBasis')+(cache.missingRequests?' '+t('cacheMissing',{n:cache.missingRequests}):''):t('cacheUnavailable'))+savedNote+saveWarning;
  $('connection-dot').className = `connection-dot ${snapshot.connection}`;
  $('connection-dot').title = t(snapshot.connection === 'live'?'live':snapshot.connection === 'stale'?'stale':'offline');
  $('rest-title').textContent = snapshot.connection === 'offline' ? t('waitingApp') : speed ? `${rate(speed.tps)} tok/s` : t('waitingModel');
  $('rest-subtitle').textContent = t(snapshot.connection === 'offline'?'autoConnect':'hover');
  const timestamp = snapshot.quotaUpdatedAt ? new Date(snapshot.quotaUpdatedAt).toLocaleTimeString(language.language,{hour12:false}) : null;
  $('health-note').textContent = language.errorMessage(snapshot.error||snapshot.sessionError) || (timestamp ? t('health',{time:timestamp}) : t('firstUpdate'));
  $('health-note').classList.toggle('warning', snapshot.connection !== 'live' || !!snapshot.sessionError);
  const integration = snapshot.integration;
  $('integration-note').textContent = integration && !['mounted','disabled'].includes(integration.state)
    ? (language.language === 'zh-CN' ? '内嵌栏正在自动重连；此面板仍可查看统计。' : 'Inline widget is reconnecting automatically; statistics remain available in this panel.') : '';
  updateCountdowns();
}

function updateCountdowns() {
  const now = Date.now() + serverOffset;
  for (const [window,prefix] of [['5h','five'],['weekly','week']]) {
    const bucket = group?.windows?.[window];
    $(`${prefix}-countdown`).textContent = language.countdown(bucket?.resetAt,now);
    if (bucket?.resetAt && Date.parse(bucket.resetAt) <= now && snapshot?.connection === 'live' && now - lastExpiredRefresh > 30000) {
      lastExpiredRefresh = now; setTimeout(() => refresh(true),0);
    }
  }
}

function refreshBusy(busy){
  const button=$('refresh-button');button.setAttribute('aria-busy',String(busy));button.setAttribute('aria-disabled',String(busy));
  button.dataset.i18nAria=busy?'refreshing':'refreshStats';button.title=t(button.dataset.i18nAria);button.setAttribute('aria-label',button.title);
}
function refreshManually(){
  if(manualRequest)return;
  refreshBusy(true);const started=performance.now();
  manualRequest=(async()=>{
    try{if(pending)await refreshRequest;await refresh(true);}
    finally{
      const remaining=250-(performance.now()-started);
      if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));
      refreshBusy(false);manualRequest=null;
    }
  })();
}
function refresh(force = false) {
  if (pending) return refreshRequest;
  pending = true;
  refreshRequest=(async()=>{
  try {
    const params = new URLSearchParams();
    if (host?.conversationId) params.set('conversationId',host.conversationId);
    if (force) params.set('force','1');
    const transport = host?.fetch ? host.fetch.bind(host) : fetch;
    const response = await transport(`/api/metrics?${params}`,{cache:'no-store'});
    if (!response.ok) throw new Error(t('panelUnavailable'));
    const value = await response.json();
    if (!['live','stale','offline'].includes(value.connection)) throw new Error(t('invalidData'));
    snapshot = value;
    if(Object.hasOwn(value,'theme'))themeController.setHostTheme(value.theme);
    if(value.preferences)preferences.sync(value.preferences);
    serverOffset = Date.parse(value.serverTime) - Date.now();
    if (!Number.isFinite(serverOffset)) serverOffset = 0;
    render();
  } catch (error) {
    if (snapshot) { snapshot.connection = 'stale'; snapshot.error = error.message; render(); }
    else { $('rest-title').textContent = t('connecting'); $('health-note').textContent = language.errorMessage(error.message); $('health-note').classList.add('warning'); }
  } finally {
    pending = false; refreshRequest=null;
    clearTimeout(timer); timer = setTimeout(refresh, document.hidden ? 10000 : 2200);
  }
  })();
  return refreshRequest;
}
$('quota-group').addEventListener('change', event => { selectedGroup = event.target.value; localSet('ag-pulse-group',selectedGroup); render(); });
$('refresh-button').addEventListener('click', refreshManually);
$('language-toggle').addEventListener('click',()=>{void preferences.toggle();});
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
window.addEventListener('pagehide',()=>preferences.dispose());
window.addEventListener('pageshow',event=>{if(event.persisted)preferences=connectPreferences();});
setInterval(updateCountdowns,1000);
localize();
refresh();
