#!/usr/bin/env node
import { normalize } from './metrics.mjs';
import { render } from './render.mjs';
import { PreferencesStore } from '../compat/preferences.mjs';

const MAX_INPUT = 256 * 1024;
const help = `Antigrative Dashboard for Antigravity CLI (Node.js 20+)
Reads the official statusLine JSON from stdin. No network or transcript access.
  --preview           Render synthetic data; does not write statistics
  --language en|zh-CN  Override shared desktop language preference
  --width 1..500       Override terminal columns
  --details           Include capacity and current request token counts
  --no-color          Disable ANSI (also honors NO_COLOR and TERM=dumb)
  --json              Print only normalized, whitelisted metrics
  --help              Show this help
`;

function options(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (['--preview', '--details', '--json', '--help', '--no-color'].includes(arg)) result[arg.slice(2)] = true;
    else if (arg === '--language') {
      const value = args[++i];
      if (!['en', 'zh-CN'].includes(value)) throw new Error('Invalid option');
      result.language = value;
    } else if (arg === '--width') {
      const value = Number(args[++i]);
      if (!Number.isInteger(value) || value < 1 || value > 500) throw new Error('Invalid option');
      result.width = value;
    } else throw new Error('Invalid option');
  }
  return result;
}

async function input() {
  let size = 0; const chunks = [];
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_INPUT) throw new Error('Oversized input');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, ''));
}

function preview() {
  return {
    model: { display_name: 'Gemini 3.5 Flash (High)' }, agent_state: 'working', terminal_width: 100,
    context_window: { used_percentage: 44.2, context_window_size: 1048576,
      current_usage: { input_tokens: 63382, output_tokens: 346, cache_read_input_tokens: 20857, cache_creation_input_tokens: 0 } },
    quota: { 'gemini-5h': { remaining_fraction: 0.72, reset_in_seconds: 8100 },
      'gemini-weekly': { remaining_fraction: 0.9378, reset_in_seconds: 560580 } },
  };
}

try {
  const opts = options(process.argv.slice(2));
  if (opts.help) process.stdout.write(help);
  else {
    const metrics = normalize(opts.preview ? preview() : await input());
    const saved = await new PreferencesStore().snapshot();
    const language = opts.language || saved.language || 'en';
    process.stdout.write((opts.json ? JSON.stringify(metrics) : render(metrics, {
      language, width: opts.width || metrics.width, details: opts.details,
      color: !opts['no-color'] && !Object.hasOwn(process.env, 'NO_COLOR') && process.env.TERM !== 'dumb',
    })) + '\n');
  }
} catch {
  // Never echo raw payload/exception text into the terminal or logs.
  process.stdout.write('Antigrative Dashboard: --\n');
  process.exitCode = 1;
}
