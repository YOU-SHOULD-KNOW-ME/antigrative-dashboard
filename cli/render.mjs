import { compact, percentage, countdown } from './metrics.mjs';

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const clusters = text => [...segmenter.segment(text)].map(item => item.segment);
function cellWidth(cluster) {
  if (/^\p{Mark}+$/u.test(cluster)) return 0;
  if (/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(cluster)) return 2;
  const code = cluster.codePointAt(0);
  return code >= 0x1100 && (code <= 0x115f || code === 0x2329 || code === 0x232a ||
    (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) || (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) || (code >= 0xfe10 && code <= 0xfe19) ||
    (code >= 0xfe30 && code <= 0xfe6f) || (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) || (code >= 0x20000 && code <= 0x3fffd)) ? 2 : 1;
}
export const displayWidth = text => clusters(text).reduce((sum, item) => sum + cellWidth(item), 0);
export function truncate(text, width) {
  if (displayWidth(text) <= width) return text;
  let result = '', used = 0;
  for (const item of clusters(text)) {
    const size = cellWidth(item);
    if (used + size > width - 1) break;
    result += item; used += size;
  }
  return result + (width > 0 ? '…' : '');
}

const labels = {
  en: { context: 'Context', cache: 'Cache read', capacity: 'Capacity', created: 'Cache write', input: 'Input', output: 'Output',
    left: 'left', reset: 'reset', quota: 'Quota', week: 'week', unknown: 'Unknown', idle: 'Ready', thinking: 'Thinking',
    working: 'Working', tool_use: 'Tool', initializing: 'Starting' },
  'zh-CN': { context: '上下文', cache: '缓存读取', capacity: '容量', created: '缓存写入', input: '输入', output: '输出',
    left: '剩余', reset: '重置', quota: '额度', week: '周', unknown: '未知', idle: '就绪', thinking: '思考中',
    working: '生成中', tool_use: '工具', initializing: '启动中' },
};

export function render(metrics, { language = 'en', width = metrics.width, color = true, details = false, now = Date.now() } = {}) {
  const l = labels[language] || labels.en;
  width = Math.max(1, Math.min(500, width));
  const part = (text, code = 39, bold = false, dim = false) => ({ text, code, bold, dim });
  const subtle = text => part(text, 39, false, true);
  const plain = parts => parts.map(item => item.text).join('');
  const fit = parts => {
    if (displayWidth(plain(parts)) <= width) return parts;
    const result = []; let left = width - 1;
    for (const item of parts) {
      let text = '';
      for (const cluster of clusters(item.text)) {
        const size = cellWidth(cluster);
        if (size > left) break;
        text += cluster; left -= size;
      }
      if (text) result.push({ ...item, text });
      if (text !== item.text) break;
    }
    return [...result, subtle('…')];
  };
  const paint = parts => fit(parts).map(item => color
    ? `\x1b[${item.bold ? '1;' : item.dim ? '2;' : ''}${item.code}m${item.text}\x1b[0m` : item.text).join('');
  const bar = (value, code, size) => {
    if (value === null) return [];
    const filled = Math.min(size, Math.max(0, Math.round(value / 100 * size)));
    return [part('█'.repeat(filled), code), subtle('░'.repeat(size - filled))];
  };
  const used = metrics.context.usedPercentage;
  const level = used !== null && used >= 90 ? 31 : used !== null && used >= 60 ? 33 : 36;
  const main = [part(`${l.context} `), part(percentage(used), used === null ? 39 : level, true)];
  if (used !== null && used >= 90) main.push(part(' !', 31, true));
  if (width >= 60 && used !== null) main.push(subtle('  '), ...bar(used, level, 8));
  main.push(subtle('   │   '), part(`${l.cache} `), part(compact(metrics.cacheReadTokens), metrics.cacheReadTokens === null ? 39 : 35, true));
  const state = [subtle('   ·   '), part(l[metrics.state] || l.unknown, metrics.state === 'idle' ? 32 : 33)];
  if (displayWidth(plain([...main, ...state])) <= width) main.push(...state);

  // Group only exact contract IDs; unknown future buckets keep their identity.
  const known = { 'gemini-5h': ['gemini', 'Gemini', '5h', 36], 'gemini-weekly': ['gemini', 'Gemini', l.week, 36],
    '3p-5h': ['3p', 'Claude/GPT', '5h', 35], '3p-weekly': ['3p', 'Claude/GPT', l.week, 35] };
  const groups = new Map();
  for (const quota of metrics.quotas) {
    const [id, name, window, code] = known[quota.id] || [quota.id, quota.id, null, 36];
    if (!groups.has(id)) groups.set(id, { id, name, code, known: !!known[quota.id], windows: [] });
    groups.get(id).windows.push({ ...quota, window });
  }
  const active = /^gemini\b/i.test(metrics.model || '') ? 'gemini' : /^(claude\b|gpt\b|o[134](?:-|$))/i.test(metrics.model || '') ? '3p' : null;
  const sorted = [...groups.values()].sort((a, b) => (b.id === active ? 1 : 0) - (a.id === active ? 1 : 0) ||
    (b.known ? 1 : 0) - (a.known ? 1 : 0) || a.name.localeCompare(b.name));
  const quotaRow = (group, bars, resets) => {
    const row = [part((group.name + (group.known ? '' : ' ')).padEnd(group.known ? 11 : 0), group.code, true), subtle(`${l.left}  `)];
    const windows = [...group.windows].sort((a, b) => (a.window === '5h' ? -1 : 1) - (b.window === '5h' ? -1 : 1));
    for (const [index, quota] of windows.entries()) {
      if (index) row.push(subtle('   │   '));
      if (quota.window) row.push(part(`${quota.window} `));
      const alert = quota.remaining !== null && quota.remaining < 30;
      const code = quota.remaining === null ? 39 : quota.remaining >= 70 ? 32 : quota.remaining >= 30 ? 33 : 31;
      row.push(part(percentage(quota.remaining), code, true));
      if (alert) row.push(part(' !', code, true));
      if (bars && quota.remaining !== null) row.push(subtle(' '), ...bar(quota.remaining, code, 5));
      const reset = countdown(quota, now);
      if (resets && reset !== null) row.push(subtle(`  ↻ ${reset}`));
    }
    return row;
  };
  const lines = [paint(main)];
  if (!sorted.length) lines.push(paint([subtle(`${l.quota} --`)]));
  for (const group of sorted.slice(0, 2)) {
    let row = quotaRow(group, width >= 100, width >= 80);
    if (displayWidth(plain(row)) > width) row = quotaRow(group, false, width >= 80);
    if (displayWidth(plain(row)) > width) row = quotaRow(group, false, false);
    if (sorted.length > 2 && group === sorted[1]) row.push(subtle(`  … +${sorted.length - 2}`));
    lines.push(paint(row));
  }
  if (details) {
    const more = `${metrics.model || 'Antigravity'} · ${l.capacity} ${compact(metrics.context.capacity)} · ${l.input} ${compact(metrics.inputTokens)} · ${l.output} ${compact(metrics.outputTokens)} · ${l.created} ${compact(metrics.cacheCreationTokens)}`;
    lines.push(paint([subtle(more)]));
  }
  return lines.join('\n');
}
