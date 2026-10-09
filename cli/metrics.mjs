// The CLI contract is independent of desktop ModelUsageStats semantics.
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const tokens = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
export const states = ['idle', 'thinking', 'working', 'tool_use', 'initializing'];

export function cleanText(value, limit = 120) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\|$)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/\s+/g, ' ').trim().slice(0, limit);
}

export function normalize(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid status payload');
  const context = object(payload.context_window), usage = object(context.current_usage);
  const model = object(payload.model);
  const used = number(context.used_percentage), remaining = number(context.remaining_percentage);
  const quotas = Object.entries(object(payload.quota)).slice(0, 16).map(([key, raw]) => {
    const value = object(raw), fraction = number(value.remaining_fraction);
    const reset = typeof value.reset_time === 'string' ? Date.parse(value.reset_time) : NaN;
    return {
      id: cleanText(key, 64), remaining: fraction !== null && fraction <= 1 ? fraction * 100 : null,
      resetInSeconds: number(value.reset_in_seconds), resetTime: Number.isFinite(reset) ? reset : null,
    };
  }).filter(value => value.id);
  return {
    model: cleanText(model.display_name || model.id) || null,
    state: states.includes(payload.agent_state) ? payload.agent_state : null,
    width: Number.isInteger(payload.terminal_width) && payload.terminal_width > 0 ? Math.min(500, payload.terminal_width) : 80,
    context: { usedPercentage: used ?? (remaining !== null && remaining <= 100 ? 100 - remaining : null),
      capacity: tokens(context.context_window_size) || null },
    cacheReadTokens: tokens(usage.cache_read_input_tokens),
    cacheCreationTokens: tokens(usage.cache_creation_input_tokens),
    inputTokens: tokens(usage.input_tokens), outputTokens: tokens(usage.output_tokens),
    quotas,
  };
}

export function compact(value) {
  if (value === null) return '--';
  const [scaled, suffix] = value >= 1e6 ? [value / 1e6, 'M'] : value >= 1e3 ? [value / 1e3, 'K'] : [value, ''];
  return `${Number(scaled.toFixed(suffix ? 1 : 0))}${suffix}`;
}

export function percentage(value) {
  return value === null ? '--' : `${Number(value.toFixed(1))}%`;
}

export function countdown(quota, now = Date.now()) {
  // Absolute time prevents a replayed reset_in_seconds from looking fresh.
  const seconds = quota.resetTime !== null ? Math.max(0, (quota.resetTime - now) / 1000) : quota.resetInSeconds;
  if (seconds === null) return null;
  if (seconds < 60) return '<1m';
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h${Math.floor(seconds % 3600 / 60)}m`;
  return `${Math.floor(seconds / 86400)}d${Math.floor(seconds % 86400 / 3600)}h`;
}
