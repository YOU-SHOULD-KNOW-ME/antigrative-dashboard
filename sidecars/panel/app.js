import { percent, rate, count, elapsed, countdown, resetDate } from './format.mjs';
import { createI18n } from './i18n.js';
import { createTheme } from './theme.js';
function initPanel(){
if(!document.querySelector('.widget')||window.__agPulsePanelInstalled)return;
window.__agPulsePanelInstalled=true;
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
let pending = false, timer = null, serverOffset = 0, lastExpiredRefresh = 0;
let selectedCard='speed',cardMotion=null;
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
let languagePicker=null;
let preferences=connectPreferences();

function showCard(name,animate=false) {
  if(!['speed','cache','context'].includes(name))return;
  const changed=selectedCard!==name;selectedCard=name;
  cardMotion?.cancel();cardMotion=null;
  for (const chip of chips){const selected=chip.dataset.card===name;chip.setAttribute('aria-selected',String(selected));chip.tabIndex=selected?0:-1;}
  for (const nameKey of ['speed','cache','context']) $(`${nameKey}-card`).hidden = name !== nameKey;
  if(changed&&animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches)cardMotion=$(`${name}-card`).animate([{opacity:.6,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],{duration:160,easing:'cubic-bezier(.23,1,.32,1)'});
}
for (const chip of chips) {
  chip.addEventListener('click', event => showCard(chip.dataset.card,event.detail>0));
  chip.addEventListener('keydown',event=>{
    const current=chips.indexOf(chip);let next;
    if(event.key==='ArrowRight')next=(current+1)%chips.length;else if(event.key==='ArrowLeft')next=(current+chips.length-1)%chips.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=chips.length-1;else return;
    event.preventDefault();showCard(chips[next].dataset.card);chips[next].focus();
  });
}
function localize(){
  document.documentElement.lang=language.language;
  for(const e of document.querySelectorAll('[data-i18n]'))e.textContent=t(e.dataset.i18n);
  for(const e of document.querySelectorAll('[data-i18n-aria]'))e.setAttribute('aria-label',t(e.dataset.i18nAria));
  for(const e of document.querySelectorAll('[data-i18n-aria][title]'))e.title=t(e.dataset.i18nAria);
  languagePicker?.update();$('language-toggle').dataset.saveFailed=String(preferences.error);if(preferences.error)$('language-toggle').title+=' · '+t('languageSaveFailed');
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
  $('speed-tab').title=rate(speed?.tps)+' tok/s';
  $('session-tps').textContent = rate(speed?.tps);
  $('latest-tps').textContent = speed?.latestRateStatus==='unreliable'?t('timingUnreliable'):speed?.latestRateStatus==='legacy'?t('ratePending'):rate(speed?.latestTps);
  $('request-count').textContent = t('sampleCount',{n:speed?.measuredRequests??0});
  $('session-steps').textContent = speed ? t('rounds',{rounds:speed.rounds,steps:speed.steps}) : '';
  $('strip-model').textContent = speed?.model || t('waitingRequest');
  $('strip-model').title=$('strip-model').textContent;
  $('model-time').textContent = language.elapsed(speed?.modelSeconds);
  $('tool-time').textContent = language.elapsed(speed?.toolSeconds);
  $('ttft').textContent = language.elapsed(speed?.ttftSeconds);
  $('token-detail').textContent = speed ? `${count(speed.counts.responseOutput)} / ${count(speed.counts.thinkingOutput)} tok` : '—';
  const savedNote=speed?.restoredFromHistory?' '+t('savedStats',{time:speed.savedAt?language.resetDate(speed.savedAt):'—'}):'';
  const saveWarning=snapshot.persistenceError?' '+t('saveFailed'):'';
  $('speed-basis').textContent = language.rateNote(speed)+savedNote+saveWarning;
  const cache=speed?.cache;
  const context=speed?.context,hasCapacity=typeof context?.usedFraction==='number';
  $('strip-context').textContent=hasCapacity?`${Math.round(context.usedFraction*100)}%`:'—';
  $('strip-context-size').textContent=context?`${compact(context.usedTokens)} / ${context.maxTokens===null?'—':compact(context.maxTokens)}`:'—';
  $('context-tab').title=context?t('contextTokens',{used:count(context.usedTokens),max:context.maxTokens===null?'—':count(context.maxTokens)}):t('contextUnknown');
  $('context-summary').textContent=hasCapacity?t('contextUsed',{used:Math.round(context.usedFraction*100),remaining:Math.round(context.remainingFraction*100)}):t('contextUnknown');
  $('context-tokens').textContent=context?t('contextTokens',{used:compact(context.usedTokens),max:context.maxTokens===null?'—':compact(context.maxTokens)}):'—';
  $('context-model').textContent=context?.model||'—';
  $('context-fill').style.width=hasCapacity?`${Math.min(1,context.usedFraction)*100}%`:'0%';
  $('context-fill').style.background=hasCapacity&&context.usedFraction>=.9?'var(--pulse-danger)':'';
  if(hasCapacity){$('context-track').setAttribute('aria-valuenow',String(Math.min(100,context.usedFraction*100)));$('context-track').setAttribute('aria-valuemin','0');$('context-track').setAttribute('aria-valuemax','100');}else $('context-track').removeAttribute('aria-valuenow');
  $('strip-cache').textContent=percent(cache?.hitRate);$('cache-rate').textContent=percent(cache?.hitRate);
  const tokens=speed?.tokens || cache;
  // Coverage remains available in raw statistics and documented separately.
  const hasTotal=tokens?.measuredRequests&&Number.isSafeInteger(tokens.totalTokens)&&tokens.totalTokens>=0;
  $('strip-cache-total').textContent=hasTotal?`${compact(tokens.totalTokens)} tok`:'— tok';
  const inputCoverage={uncachedTokens:'uncachedRequests',cachedTokens:'cachedRequests',cacheWriteTokens:'cacheWriteRequests'};
  for(const [field,id]of[['cachedTokens','cache-read'],['uncachedTokens','cache-miss'],['cacheWriteTokens','cache-write'],['outputTokens','cache-output']]) {
    const available=field==='outputTokens'?(tokens?.outputAvailable??(tokens?.outputRequests??tokens?.measuredRequests)):(tokens?.[inputCoverage[field]]??tokens?.inputRequests??tokens?.measuredRequests);
    const known=Number.isSafeInteger(tokens?.[field])&&tokens[field]>=0;
    $(id).textContent=available&&known?`${count(tokens[field])} tok`:'—';
  }
  $('cache-coverage').textContent=hasTotal?`${count(tokens.totalTokens)} tok`:'— tok';
  $('cache-write-row').hidden=!(tokens?.cacheWriteTokens>0);
  $('cache-note').hidden=true;
  $('connection-dot').className = `connection-dot ${snapshot.connection}`;
  $('connection-dot').title = t(snapshot.connection === 'live'?'live':snapshot.connection === 'stale'?'stale':'offline');
  const timestamp = snapshot.quotaUpdatedAt ? new Date(snapshot.quotaUpdatedAt).toLocaleTimeString(language.language,{hour12:false}) : null;
  $('health-note').textContent = language.errorMessage(snapshot.error||snapshot.sessionError) || (timestamp ? t('health',{time:timestamp}) : t('firstUpdate'));
  $('health-note').classList.toggle('warning', snapshot.connection !== 'live' || !!snapshot.sessionError);
  const integration = snapshot.integration;
  $('integration-note').textContent = integration && !['mounted','disabled'].includes(integration.state)
    ? (language.language === 'zh-TW' ? '內嵌狀態列正在自動重新連線；此面板仍可檢視統計資料。' : (language.language === 'zh-CN' ? '内嵌栏正在自动重连；此面板仍可查看统计。' : 'Inline widget is reconnecting automatically; statistics remain available in this panel.')) : '';
  updateCountdowns();
}

function updateCountdowns() {
  const now = Date.now() + serverOffset;
  for (const [window,prefix] of [['5h','five'],['weekly','week']]) {
    const bucket = group?.windows?.[window];
    $(`${prefix}-countdown`).textContent = language.countdown(bucket?.resetAt,now);
    $(`${prefix}-summary-countdown`).textContent=language.countdown(bucket?.resetAt,now,true);
    $(`${prefix}-summary-balance`).textContent=percent(bucket?.remaining);
    $(`${prefix}-summary-fill`).style.width=typeof bucket?.remaining==='number'?`${Math.min(100,Math.max(0,bucket.remaining*100))}%`:'0%';
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
    else { $('health-note').textContent = language.errorMessage(error.message); $('health-note').classList.add('warning'); }
  } finally {
    pending = false; refreshRequest=null;
    clearTimeout(timer); timer = setTimeout(refresh, document.hidden ? 10000 : 2200);
  }
  })();
  return refreshRequest;
}
$('quota-group').addEventListener('change', event => { selectedGroup = event.target.value; localSet('ag-pulse-group',selectedGroup); render(); });
$('refresh-button').addEventListener('click', refreshManually);
languagePicker=language.mountLanguagePicker({button:$('language-toggle'),parent:document.body,choose:value=>preferences.choose(value)});
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
window.addEventListener('pagehide',()=>{preferences.dispose();languagePicker.close(false);});
window.addEventListener('pageshow',event=>{if(event.persisted)preferences=connectPreferences();});
setInterval(updateCountdowns,1000);
localize();
showCard('speed');
refresh();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initPanel,{once:true});
else initPanel();
