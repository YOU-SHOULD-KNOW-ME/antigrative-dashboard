import { percent, rate, count, elapsed, countdown, resetDate } from './format.mjs';
import { createI18n } from './i18n.js';
const language=createI18n(localStorage.getItem('ag-pulse-language'));
const t=language.t;

const $ = id => document.getElementById(id);
const compact=n=>typeof n!=='number'||!Number.isFinite(n)?'—':n>=1e9?`${(n/1e9).toFixed(1).replace(/\.0$/,'')}B`:n>=1e6?`${(n/1e6).toFixed(1).replace(/\.0$/,'')}M`:n>=1e3?`${(n/1e3).toFixed(1).replace(/\.0$/,'')}K`:String(n);
const chips = [...document.querySelectorAll('[data-card]')];
let snapshot = null, selectedGroup = localStorage.getItem('ag-pulse-group'), group = null;
let pending = false, timer = null, leaveTimer = null, serverOffset = 0, lastExpiredRefresh = 0;
const host = window.sidecar;
if (!host) document.body.classList.add('standalone');

function showCard(name) {
  clearTimeout(leaveTimer);
  for (const chip of chips) chip.setAttribute('aria-expanded', String(chip.dataset.card === name));
  for (const nameKey of ['speed','cache','five','week']) $(`${nameKey}-card`).hidden = name !== nameKey;
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
  $('language-toggle').textContent=language.language==='en'?'EN':'中';$('language-toggle').title=t('switchLanguage');
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
  $(`strip-${prefix === 'five' ? 'five' : 'week'}`).textContent = percent(remaining);
  const fill = $(`${prefix}-fill`), track = $(`${prefix}-track`);
  fill.style.width = typeof remaining === 'number' ? `${remaining * 100}%` : '0%';
  fill.style.background = remaining !== null && remaining < .05 ? '#e79696' : remaining !== null && remaining < .2 ? '#d7b078' : '';
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
  $('speed-basis').textContent = basis+(speed?.missingTiming?' '+t('missingTime',{n:speed.missingTiming}):'')+(speed?.latestShortSample?' '+t('shortSample'):'');
  const cache=speed?.cache;
  $('strip-cache').textContent=percent(cache?.hitRate);$('cache-rate').textContent=percent(cache?.hitRate);
  $('strip-cache-total').textContent=cache?.measuredRequests?`${compact(cache.totalTokens)} tok`:'— tok';
  for(const [field,id]of[['cachedTokens','cache-read'],['uncachedTokens','cache-miss'],['cacheWriteTokens','cache-write'],['outputTokens','cache-output']])$(id).textContent=cache?.measuredRequests?`${count(cache[field])} tok`:'—';
  $('cache-coverage').textContent=cache?.measuredRequests?`${count(cache.totalTokens)} tok`:'— tok';
  $('cache-write-row').hidden=!(cache?.cacheWriteTokens>0);
  $('cache-note').textContent=cache?.measuredRequests?t('cacheBasis')+(cache.missingRequests?' '+t('cacheMissing',{n:cache.missingRequests}):''):t('cacheUnavailable');
  $('connection-dot').className = `connection-dot ${snapshot.connection}`;
  $('connection-dot').title = t(snapshot.connection === 'live'?'live':snapshot.connection === 'stale'?'stale':'offline');
  $('rest-title').textContent = snapshot.connection === 'offline' ? t('waitingApp') : speed ? `${rate(speed.tps)} tok/s` : t('waitingModel');
  $('rest-subtitle').textContent = t(snapshot.connection === 'offline'?'autoConnect':'hover');
  const timestamp = snapshot.quotaUpdatedAt ? new Date(snapshot.quotaUpdatedAt).toLocaleTimeString(language.language,{hour12:false}) : null;
  $('health-note').textContent = language.errorMessage(snapshot.error||snapshot.sessionError) || (timestamp ? t('health',{time:timestamp}) : t('firstUpdate'));
  $('health-note').classList.toggle('warning', snapshot.connection !== 'live' || !!snapshot.sessionError);
  updateCountdowns();
}

function updateCountdowns() {
  const now = Date.now() + serverOffset;
  for (const [window,prefix] of [['5h','five'],['weekly','week']]) {
    const bucket = group?.windows?.[window];
    $(`${prefix}-countdown`).textContent = language.countdown(bucket?.resetAt,now);
    $(`strip-${prefix}-timer`).textContent = language.countdown(bucket?.resetAt,now,true);
    if (bucket?.resetAt && Date.parse(bucket.resetAt) <= now && snapshot?.connection === 'live' && now - lastExpiredRefresh > 30000) {
      lastExpiredRefresh = now; setTimeout(() => refresh(true),0);
    }
  }
}

async function refresh(force = false) {
  if (pending) return;
  pending = true; $('refresh-button').disabled = true;
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
    serverOffset = Date.parse(value.serverTime) - Date.now();
    if (!Number.isFinite(serverOffset)) serverOffset = 0;
    render();
  } catch (error) {
    if (snapshot) { snapshot.connection = 'stale'; snapshot.error = error.message; render(); }
    else { $('rest-title').textContent = t('connecting'); $('health-note').textContent = language.errorMessage(error.message); $('health-note').classList.add('warning'); }
  } finally {
    pending = false; $('refresh-button').disabled = false;
    clearTimeout(timer); timer = setTimeout(refresh, document.hidden ? 10000 : 2200);
  }
}
$('quota-group').addEventListener('change', event => { selectedGroup = event.target.value; localStorage.setItem('ag-pulse-group',selectedGroup); render(); });
$('refresh-button').addEventListener('click', () => refresh(true));
$('language-toggle').addEventListener('click',()=>{localStorage.setItem('ag-pulse-language',language.toggle());localize();render();});
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
window.addEventListener('storage',event=>{if(event.key==='ag-pulse-language'){language.setLanguage(event.newValue);localize();render();}});
setInterval(updateCountdowns,1000);
localize();
refresh();
