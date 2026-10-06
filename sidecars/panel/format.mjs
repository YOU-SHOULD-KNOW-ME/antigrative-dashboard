export function percent(fraction) {
  return typeof fraction === 'number' && Number.isFinite(fraction) ? `${(fraction * 100).toFixed(1)}%` : '—';
}
export function rate(number) {
  return typeof number === 'number' && Number.isFinite(number) ? number.toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) : '—';
}
export function count(number) {
  return typeof number === 'number' && Number.isFinite(number) ? number.toLocaleString('en-US') : '—';
}
export function elapsed(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '—';
  if (seconds < 60) return `${seconds.toFixed(2)} 秒`;
  const whole = Math.round(seconds), h = Math.floor(whole / 3600), m = Math.floor(whole % 3600 / 60), s = whole % 60;
  return `${h ? `${h}小时` : ''}${m}分${s}秒`;
}
export function countdown(resetAt, now = Date.now(), compact = false) {
  const end = Date.parse(resetAt);
  if (!Number.isFinite(end)) return '—';
  if (end <= now) return '等待刷新';
  const left = Math.ceil((end - now) / 1000), d = Math.floor(left / 86400), h = Math.floor(left % 86400 / 3600), m = Math.floor(left % 3600 / 60), s = left % 60;
  const pad = n => String(n).padStart(2, '0');
  return `${d ? `${d}天 ` : ''}${pad(h)}:${pad(m)}${compact && d ? '' : `:${pad(s)}`}`;
}
export function resetDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' }).format(date) : '—';
}
