import { percent, rate, count, elapsed, countdown, resetDate } from './format.mjs';

const $ = id => document.getElementById(id);
const chips = [...document.querySelectorAll('[data-card]')];
let snapshot = null, selectedGroup = localStorage.getItem('ag-pulse-group'), group = null;
let pending = false, timer = null, leaveTimer = null, serverOffset = 0, lastExpiredRefresh = 0;
const host = window.sidecar;
if (!host) document.body.classList.add('standalone');

function showCard(name) {
  clearTimeout(leaveTimer);
  for (const chip of chips) chip.setAttribute('aria-expanded', String(chip.dataset.card === name));
  for (const nameKey of ['speed','five','week']) $(`${nameKey}-card`).hidden = name !== nameKey;
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
  $(`${prefix}-reset`).textContent = resetDate(bucket?.resetAt);
  $(`${prefix}-note`).textContent = !bucket?.available ? '当前账户未提供此窗口。' : bucket.disabled ? '此额度窗口已停用。' : remaining === null ? '账户未返回剩余比例。' : '同组模型共享额度；余额与重置时间来自账户接口。';
}

function render() {
  if (!snapshot) return;
  const groups = snapshot.groups || [], speed = snapshot.speed;
  group = chooseGroup(groups, speed);
  const optionsKey = groups.map(g => g.id).join('|');
  const select = $('quota-group');
  if (select.dataset.options !== optionsKey) {
    select.replaceChildren(...(groups.length ? groups.map(g => new Option(groupLabel(g),g.id)) : [new Option('额度暂不可用','')]));
    select.dataset.options = optionsKey;
  }
  if (group) select.value = group.id;
  for (const element of document.querySelectorAll('.group-name')) element.textContent = group ? groupLabel(group) : '—';
  renderQuota('5h','five'); renderQuota('weekly','week');
  $('strip-tps').textContent = rate(speed?.tps);
  $('session-tps').textContent = rate(speed?.tps);
  $('latest-tps').textContent = rate(speed?.latestTps);
  $('request-count').textContent = `${speed?.measuredRequests ?? 0} 次采样`;
  $('session-steps').textContent = speed ? `${speed.rounds}轮 ${speed.steps}步 ·` : '';
  $('strip-model').textContent = speed?.model || '等待会话请求';
  $('model-time').textContent = elapsed(speed?.modelSeconds);
  $('tool-time').textContent = elapsed(speed?.toolSeconds);
  $('ttft').textContent = elapsed(speed?.ttftSeconds);
  $('token-detail').textContent = speed ? `${count(speed.counts.responseOutput)} / ${count(speed.counts.thinkingOutput)} tok` : '—';
  const basis = speed?.rateBasis === 'all-output' ? '输出 token ÷ 流式生成时长；该模型未拆分正文与思考。' : '正文输出 token ÷ 流式生成时长；会话值按总时长加权。';
  $('speed-basis').textContent = basis + (speed?.missingTiming ? ` ${speed.missingTiming} 次请求缺少时长，未计入 TPS。` : '') + (speed?.latestShortSample ? ' 最近请求不足 1 秒，单次速率波动较大。' : '');
  $('connection-dot').className = `connection-dot ${snapshot.connection}`;
  $('connection-dot').title = snapshot.connection === 'live' ? '已连接 Antigravity' : snapshot.connection === 'stale' ? '显示上次成功读取的额度' : 'Antigravity 未连接';
  $('rest-title').textContent = snapshot.connection === 'offline' ? '等待 Antigravity' : speed ? `${rate(speed.tps)} tok/s` : '等待模型生成';
  $('rest-subtitle').textContent = snapshot.connection === 'offline' ? '打开应用后自动连接' : '悬停状态条，查看详细统计';
  const timestamp = snapshot.quotaUpdatedAt ? new Date(snapshot.quotaUpdatedAt).toLocaleTimeString('zh-CN',{hour12:false}) : null;
  $('health-note').textContent = snapshot.error || snapshot.sessionError || (timestamp ? `额度更新于 ${timestamp} · TPS 来自真实请求统计` : '等待首次更新');
  $('health-note').classList.toggle('warning', snapshot.connection !== 'live' || !!snapshot.sessionError);
  updateCountdowns();
}

function updateCountdowns() {
  const now = Date.now() + serverOffset;
  for (const [window,prefix] of [['5h','five'],['weekly','week']]) {
    const bucket = group?.windows?.[window];
    $(`${prefix}-countdown`).textContent = countdown(bucket?.resetAt,now);
    $(`strip-${prefix}-timer`).textContent = countdown(bucket?.resetAt,now,true);
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
    if (!response.ok) throw new Error('统计面板暂时无法连接');
    const value = await response.json();
    if (!['live','stale','offline'].includes(value.connection)) throw new Error('统计数据格式不兼容');
    snapshot = value;
    serverOffset = Date.parse(value.serverTime) - Date.now();
    if (!Number.isFinite(serverOffset)) serverOffset = 0;
    render();
  } catch (error) {
    if (snapshot) { snapshot.connection = 'stale'; snapshot.error = error.message; render(); }
    else { $('rest-title').textContent = '等待连接'; $('health-note').textContent = error.message; $('health-note').classList.add('warning'); }
  } finally {
    pending = false; $('refresh-button').disabled = false;
    clearTimeout(timer); timer = setTimeout(refresh, document.hidden ? 10000 : 2200);
  }
}
$('quota-group').addEventListener('change', event => { selectedGroup = event.target.value; localStorage.setItem('ag-pulse-group',selectedGroup); render(); });
$('refresh-button').addEventListener('click', () => refresh(true));
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
setInterval(updateCountdowns,1000);
refresh();
