import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize, countdown, cleanText } from '../metrics.mjs';
import { render, displayWidth, truncate } from '../render.mjs';

const script = fileURLToPath(new URL('../statusline.mjs', import.meta.url));
const sample = {
  model: { display_name: 'Gemini 3.5 Flash (High)' }, agent_state: 'working', terminal_width: 100,
  context_window: { total_input_tokens: 88244, total_output_tokens: 61074, context_window_size: 1048576,
    used_percentage: 14.24, current_usage: { input_tokens: 63382, output_tokens: 346,
      cache_read_input_tokens: 20857, cache_creation_input_tokens: 0 } },
  quota: { 'gemini-weekly': { remaining_fraction: 0.9378, reset_in_seconds: 560580 } },
};
const run = (input, args = [], env = {}) => spawnSync(process.execPath, [script, ...args], {
  input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8', env: { ...process.env, ...env }, timeout: 10000,
});

test('official contract uses explicit occupancy and current cache count, never cumulative counters', () => {
  const metrics = normalize(sample);
  assert.equal(metrics.context.usedPercentage, 14.24);
  assert.equal(metrics.cacheReadTokens, 20857);
  const text = render(metrics, { color: false });
  assert.match(text, /14\.2%/);
  assert.match(text, /20\.9K/);
  assert.doesNotMatch(text, /tok\/s|TPS|cache hit/i);
});

test('zero, missing and malformed values remain distinct; compaction and model switches are stateless', () => {
  const zero = normalize({ context_window: { used_percentage: 0, current_usage: { cache_read_input_tokens: 0 } },
    quota: { 'gemini-5h': { remaining_fraction: 0 } } });
  const text = render(zero, { color: false });
  assert.match(text, /Context 0%/); assert.match(text, /Cache read 0/); assert.match(text, /left\s+5h 0%/);
  const missing = normalize({ model: { id: 'Claude' }, context_window: { used_percentage: '50', current_usage: { cache_read_input_tokens: -1 } } });
  assert.equal(missing.context.usedPercentage, null); assert.equal(missing.cacheReadTokens, null);
  assert.match(render(missing, { color: false }), /Context --.*Cache read --.*Quota --/s);
  assert.equal(normalize({ context_window: { used_percentage: 2 } }).context.usedPercentage, 2);
  assert.equal(normalize({ context_window: { used_percentage: 120 } }).context.usedPercentage, 120);
  assert.equal(normalize({ context_window: { remaining_percentage: 70 } }).context.usedPercentage, 30);
  assert.equal(normalize({ context_window: { remaining_percentage: 120 } }).context.usedPercentage, null);
});

test('quota reset never fabricates restored balances; unknown IDs retain identity', () => {
  const now = Date.parse('2026-10-10T00:00:00Z');
  const metrics = normalize({ quota: { 'unknown-future-bucket': { remaining_fraction: 0,
    reset_time: '2026-10-09T00:00:00Z', reset_in_seconds: 100000 }, bad: { remaining_fraction: 2 } } });
  assert.equal(countdown(metrics.quotas[0], now), '<1m');
  const text = render(metrics, { color: false, width: 150, now });
  assert.match(text, /unknown-future-bucket left\s+0%/); assert.match(text, /bad left\s+--/);
});

test('render bounds account for CJK, emoji and combining clusters in both languages', () => {
  const metrics = normalize({ ...sample, model: { display_name: '中文模型👨‍👩‍👧‍👦é🧪很长的模型名称'.repeat(6) },
    quota: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`future-${i}`, { remaining_fraction: 0.5 }])) });
  for (const language of ['en', 'zh-CN']) for (const width of [1, 2, 10, 20, 39, 55, 79, 80, 100, 120, 500]) {
    const text = render(metrics, { width, language, color: false, details: true });
    assert.ok(text.split('\n').length <= 4);
    for (const line of text.split('\n')) assert.ok(displayWidth(line) <= width, `${width}: ${line}`);
  }
  assert.equal(displayWidth('中文'), 4); assert.equal(displayWidth('é'), 1);
  assert.equal(displayWidth('👨‍👩‍👧‍👦'), 2); assert.equal(truncate('A🧪B', 3), 'A…');
});

test('primary metrics stay on the first row; quota families and windows have stable independent rows', () => {
  const metrics = normalize({ ...sample, quota: {
    '3p-weekly': { remaining_fraction: 0.08 }, 'gemini-weekly': { remaining_fraction: 0.95 },
    'gemini-5h': { remaining_fraction: 1 }, '3p-5h': { remaining_fraction: 0.45 },
  } });
  for (const width of [55, 80, 100, 120]) {
    const rows = render(metrics, { width, color: false }).split('\n');
    assert.match(rows[0], /Context 14\.2%.*Cache read 20\.9K/);
    assert.doesNotMatch(rows[0], /Gemini|Claude|reset/);
    assert.match(rows[1], /^Gemini\s+left\s+5h 100%.*week 95%/);
    assert.match(rows[2], /^Claude\/GPT\s+left\s+5h 45%.*week 8% !/);
  }
  metrics.model = 'Claude Sonnet';
  assert.match(render(metrics, { color: false }).split('\n')[1], /^Claude\/GPT/);
});

test('ANSI foreground and weight distinguish key values, alerts and secondary metadata without backgrounds', () => {
  const metrics = normalize({ ...sample, context_window: { used_percentage: 95, current_usage: { cache_read_input_tokens: 24000 } },
    quota: { 'gemini-5h': { remaining_fraction: 0.08, reset_in_seconds: 3600 } } });
  const colored = render(metrics, { color: true, width: 120 });
  const plain = render(metrics, { color: false, width: 120 });
  assert.match(colored, /\x1b\[1;31m95%/);
  assert.match(colored, /\x1b\[1;35m24K/);
  assert.match(colored, /\x1b\[1;31m8%/);
  assert.match(colored, /\x1b\[2;39m.*↻/);
  assert.equal(colored.replace(/\x1b\[[\d;]+m/g, ''), plain);
  assert.doesNotMatch(colored, /\x1b\[(?:\d+;)*4\d(?:;|m)/);
});

test('remaining quota uses green at 70+, yellow at 30..70, red below 30 for both numbers and bars', () => {
  for (const [remaining, code, alert] of [[0, 31, true], [29.9, 31, true], [30, 33, false],
    [69.9, 33, false], [70, 32, false], [100, 32, false]]) {
    const metrics = normalize({ quota: { 'gemini-5h': { remaining_fraction: remaining / 100 } } });
    const row = render(metrics, { width: 120, color: true }).split('\n')[1];
    assert.ok(row.includes(`\x1b[1;${code}m${remaining}%`), `${remaining}: wrong number color`);
    if (remaining >= 29.9) assert.match(row, new RegExp(`\\x1b\\[${code}m█`));
    assert.equal(row.includes(' !'), alert);
  }
  const missing = render(normalize({ quota: { 'gemini-5h': {} } }), { width: 120, color: true });
  assert.doesNotMatch(missing, /\x1b\[1;31m/);
});

test('model and bucket labels cannot inject ANSI, control characters or bidi overrides', () => {
  const hostile = '\x1b]0;SECRET_TITLE\x07\x1b[31mGemini\n\r\x08\u202e';
  assert.equal(cleanText(hostile), 'Gemini');
  const output = render(normalize({ model: { id: hostile }, quota: { [hostile]: {} } }), { color: false });
  assert.doesNotMatch(output, /SECRET|[\x00-\x09\x0b-\x1f\x7f\u202e]/);
});

test('process accepts stdin and whitelists output without accessing transcripts or exposing account metadata', () => {
  const result = run({ ...sample, email: 'SECRET_EMAIL', transcript_path: 'SECRET_PATH', cwd: 'SECRET_DIR', api_key: 'SECRET_KEY' }, ['--json']);
  assert.equal(result.status, 0); assert.equal(result.stderr, '');
  assert.doesNotMatch(result.stdout, /SECRET|email|transcript|cwd|session/);
  assert.equal(JSON.parse(result.stdout).cacheReadTokens, 20857);
});

test('malformed and oversized inputs fail quietly without leaking data', () => {
  for (const input of ['{SECRET', 'null', '[]', '"SECRET"', ' '.repeat(262145)]) {
    const result = run(input);
    assert.equal(result.status, 1); assert.equal(result.stderr, '');
    assert.equal(result.stdout, 'Antigrative Dashboard: --\n');
  }
  assert.equal(run({}, ['--language', 'SECRET']).status, 1);
  assert.equal(run({}, ['--width', '0']).status, 1);
});

test('NO_COLOR and TERM=dumb disable foreground ANSI even when stdout is piped', () => {
  assert.doesNotMatch(run(sample, [], { NO_COLOR: '' }).stdout, /\x1b/);
  assert.doesNotMatch(run(sample, [], { TERM: 'dumb' }).stdout, /\x1b/);
  assert.doesNotMatch(run(sample, ['--no-color']).stdout, /\x1b/);
  const env = { ...process.env }; delete env.NO_COLOR; env.TERM = 'xterm';
  const result = spawnSync(process.execPath, [script], { input: JSON.stringify(sample), encoding: 'utf8', env });
  assert.match(result.stdout, /\x1b\[36m/); assert.doesNotMatch(result.stdout, /\x1b\[4[0-9]m/);
});

test('language survives separate process runs and explicit override; preview writes no history', () => {
  const root = mkdtempSync(join(tmpdir(), 'pulse-cli-'));
  try {
    const local = join(root, 'AntigravityPulse'); mkdirSync(local);
    writeFileSync(join(local, 'preferences.json'), JSON.stringify({ schema: 1, language: 'zh-CN', revision: 1 }));
    const env = { LOCALAPPDATA: root, XDG_DATA_HOME: root, HOME: root };
    // macOS has a fixed Application Support path.
    const mac = join(root, 'Library', 'Application Support', 'AntigravityPulse'); mkdirSync(mac, { recursive: true });
    writeFileSync(join(mac, 'preferences.json'), JSON.stringify({ schema: 1, language: 'zh-CN', revision: 1 }));
    for (let i = 0; i < 2; i++) assert.match(run({}, ['--preview', '--no-color'], env).stdout, /上下文/);
    assert.match(run({}, ['--preview', '--language', 'en', '--no-color'], env).stdout, /Context/);
    assert.equal(JSON.parse(run({}, ['--json', '--preview'], env).stdout).context.usedPercentage, 44.2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
