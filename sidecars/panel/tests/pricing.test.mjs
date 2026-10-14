import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  PricingService,
  resolveModelPricing,
  computeCost,
  formatCostValue,
  normalizeKey,
  BUILTIN_MODELS,
  BUILTIN_EXCHANGE_RATE
} from '../pricing.mjs';

test('normalizeKey handles prefixes, suffixes, and punctuation consistently', () => {
  assert.equal(normalizeKey('google/gemini-3.8-flash-n'), 'gemini-3.8-flash');
  assert.equal(normalizeKey('anthropic/claude-opus-4-6-thinking'), 'claude-opus-4-6');
  assert.equal(normalizeKey('gemini-4-argon:batch'), 'gemini-4-argon');
  assert.equal(normalizeKey('~anthropic/claude-opus-latest'), 'claude-opus');
  assert.equal(normalizeKey('Claude 3.5 Sonnet'), 'claude-3.5-sonnet');
});

test('resolveModelPricing matches diverse model IDs and variations dynamically', () => {
  const catalog = {
    'google/gemini-4-argon': { prompt: 0.000002, completion: 0.00001, cacheRead: 0.0000001 },
    'google/gemini-3.8-flash': { prompt: 0.00000075, completion: 0.00000375, cacheRead: 0.000000075 },
    'anthropic/claude-opus-5.5': { prompt: 0.000004, completion: 0.00002, cacheRead: 0.0000002 },
    'anthropic/claude-opus-4.6': { prompt: 0.000005, completion: 0.000025, cacheRead: 0.0000005 },
    'anthropic/claude-3.5-haiku': { prompt: 0.0000008, completion: 0.000004, cacheRead: 0.00000008 }
  };

  // Exact & normalized
  assert.equal(resolveModelPricing('google/gemini-4-argon', catalog)?.prompt, 0.000002);
  assert.equal(resolveModelPricing('gemini-3.8-flash-n', catalog)?.prompt, 0.00000075);
  assert.equal(resolveModelPricing('claude-opus-4-6-thinking', catalog)?.prompt, 0.000005);
  assert.equal(resolveModelPricing('claude-opus-5.5', catalog)?.prompt, 0.000004);

  // Dash/dot variations
  assert.equal(resolveModelPricing('claude-opus-4-6', catalog)?.prompt, 0.000005);
  assert.equal(resolveModelPricing('claude-opus-4.6', catalog)?.prompt, 0.000005);

  // Unknown model returns null cleanly
  assert.equal(resolveModelPricing('unknown-future-model-xyz', catalog), null);
});

test('computeCost computes formula accurately for USD and CNY with currency switching', () => {
  const pricing = { prompt: 0.000001, cacheRead: 0.0000001, cacheWrite: 0, completion: 0.000005 };
  const counts = { uncached: 1000000, cacheRead: 2000000, cacheWrite: 0, output: 500000 };

  // USD = 1M * 1e-6 + 2M * 1e-7 + 500K * 5e-6 = 1.0 + 0.2 + 2.5 = 3.70 USD
  const en = computeCost(counts, pricing, { currency: 'en', exchangeRate: 7.2 });
  assert.equal(en.usd, 3.7);
  assert.equal(en.amount, 3.7);
  assert.equal(en.symbol, '$');

  // CNY = 3.7 * 7.2 = 26.64 CNY
  const zh = computeCost(counts, pricing, { currency: 'zh-CN', exchangeRate: 7.2 });
  assert.equal(zh.usd, 3.7);
  assert.equal(Math.round(zh.amount * 100) / 100, 26.64);
  assert.equal(zh.symbol, '¥');
});

test('formatCostValue handles zeros, tiny fractions and regular currency amounts', () => {
  assert.equal(formatCostValue(null), '—');
  assert.equal(formatCostValue(0, '¥'), '¥0.00');
  assert.equal(formatCostValue(0, '$'), '$0.00');
  assert.equal(formatCostValue(0.0005, '¥'), '< ¥0.01');
  assert.equal(formatCostValue(0.0005, '$'), '< $0.01');
  assert.equal(formatCostValue(12.345, '¥'), '¥12.35');
  assert.equal(formatCostValue(262.95, '¥'), '¥262.95');
  assert.equal(formatCostValue(1234.5, '$'), '$1,234.50');
});

test('PricingService strictly restores lastExchangeRate from cache when offline', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-pricing-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  // Simulate a previous online session where the exchange rate was 6.885
  const cachePayload = {
    lastExchangeRate: 6.885,
    exchangeRateUpdatedAt: '2026-10-14T08:00:00.000Z',
    lastSyncedAt: '2026-10-14T08:00:00.000Z',
    models: {
      'custom/ultra-gemini-4': { prompt: 0.000003, completion: 0.000015, cacheRead: 0.00000015 }
    }
  };
  await writeFile(join(dir, 'pricing-cache.json'), JSON.stringify(cachePayload), 'utf8');

  const service = new PricingService(dir);
  await service.loadCache();

  assert.equal(service.exchangeRate, 6.885);
  assert.equal(service.models['custom/ultra-gemini-4'].prompt, 0.000003);

  const snapshot = service.snapshot();
  assert.equal(snapshot.exchangeRate, 6.885);
  assert.equal(snapshot.exchangeRateUpdatedAt, '2026-10-14T08:00:00.000Z');
  assert.ok(snapshot.models['custom/ultra-gemini-4']);
});
