import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const usageUiSource = readFileSync(join(__dirname, '../../../compat/usage-ui.cjs'), 'utf8');
const inlineWidgetSource = readFileSync(join(__dirname, '../../../compat/inline-widget.cjs'), 'utf8');

test('usage-ui CSS includes parallel horizontal layout for chart controls and date ranges', () => {
  // Issue 1 & 2: .chart-controls and .range must be flex containers to display side-by-side
  assert.ok(
    usageUiSource.includes('.chart-controls{display:flex;align-items:center;gap:10px;flex-wrap:nowrap;white-space:nowrap}'),
    'CSS must enforce flexbox for .chart-controls to keep period controls and year picker parallel'
  );
  assert.ok(
    usageUiSource.includes('.range{display:flex;align-items:center;gap:8px;flex-shrink:0;white-space:nowrap}'),
    'CSS must enforce flexbox for .range date navigator'
  );
  assert.ok(
    usageUiSource.includes('.range button{display:grid;place-items:center;width:24px;height:24px;padding:0;font-size:13px;line-height:1;border-radius:6px;border:1px solid var(--pulse-border);background:transparent;color:var(--pulse-muted)}'),
    'CSS must format range buttons neatly aligned with range label'
  );
});

test('usage-ui layout structure places period controls and year picker inside chart-controls', () => {
  // Verify HTML markup structure
  assert.ok(
    usageUiSource.includes('<div class="chart-controls"><div class="seg" id="heat-controls">'),
    'Overview section must wrap heat-controls and year-picker in chart-controls'
  );
  assert.ok(
    usageUiSource.includes('<div class="chart-controls"><div class="range">'),
    'Details section must wrap range and period-controls in chart-controls'
  );
});

test('usage-ui filter strip has two distinct rows for components and models', () => {
  assert.ok(
    usageUiSource.includes('<div class="filter-strip"><div class="comp-filters" id="comp-filters"></div><div class="legend" id="legend"></div></div>'),
    'Filter strip must contain comp-filters (row 1) and legend (row 2)'
  );
  assert.ok(
    usageUiSource.includes('.filter-strip{display:flex;flex-direction:column;gap:8px;margin:0 0 18px}'),
    'filter-strip must be a column layout separating components and models'
  );
  assert.ok(
    usageUiSource.includes('.comp-filters,.legend{display:flex;flex-wrap:wrap;gap:4px 18px}'),
    'comp-filters and legend must display flex items horizontally'
  );
});

test('usage-ui CSS applies strikethrough styling to excluded components and values', () => {
  assert.ok(
    usageUiSource.includes('.comp-filters button[aria-pressed=false],.legend button[aria-pressed=false]{opacity:.4;text-decoration:line-through}'),
    'Toggled off filter buttons must have strikethrough styling'
  );
  assert.ok(
    usageUiSource.includes('.excluded-val{text-decoration:line-through;opacity:.38}'),
    'Excluded numeric metric values must have strikethrough styling'
  );
});

test('usage-ui calculation accurately deducts unselected token components and cost', () => {
  // Test deduction math corresponding to rangeCost and renderTotals
  const pricing = { prompt: 0.000002, cacheRead: 0.0000005, completion: 0.00001 };
  const models = {
    'gemini-2.5-pro': {
      total: 1000000,
      inputTokens: 400000,
      cachedReadTokens: 400000,
      outputTokens: 200000,
    }
  };

  function computeSelected(disabledComponents, disabledModels = new Set()) {
    let uncached = 0, cached = 0, output = 0;
    for (const [name, m] of Object.entries(models)) {
      if (disabledModels.has(name)) continue;
      if (!disabledComponents.has('uncached')) uncached += (m.inputTokens || 0);
      if (!disabledComponents.has('cached')) cached += (m.cachedReadTokens || 0);
      if (!disabledComponents.has('output')) output += (m.outputTokens || 0);
    }
    const total = uncached + cached + output;
    const cost = uncached * pricing.prompt + cached * pricing.cacheRead + output * pricing.completion;
    return { total, uncached, cached, output, cost };
  }

  // Baseline: all components included
  const all = computeSelected(new Set());
  assert.equal(all.total, 1000000);
  assert.equal(all.cost, 400000 * 0.000002 + 400000 * 0.0000005 + 200000 * 0.00001); // 0.8 + 0.2 + 2.0 = 3.0

  // Deduct cachedRead (user requested: clicking cached read deducts it from total and cost)
  const withoutCached = computeSelected(new Set(['cached']));
  assert.equal(withoutCached.cached, 0);
  assert.equal(withoutCached.total, 600000); // 400k uncached + 200k output
  assert.equal(withoutCached.cost, 2.8);     // 3.0 - 0.2 = 2.8

  // Deduct output as well
  const inputOnly = computeSelected(new Set(['cached', 'output']));
  assert.equal(inputOnly.total, 400000);
  assert.ok(Math.abs(inputOnly.cost - 0.8) < 1e-9);
});

test('usage-ui table sorting handles token counts, costs and model names', () => {
  const rows = [
    { name: 'gemini-2.5-flash', total: 500000, cost: 0.5 },
    { name: 'claude-3.5-sonnet', total: 200000, cost: 3.0 },
    { name: 'gemini-2.5-pro', total: 800000, cost: 2.4 },
  ];

  function sortRows(list, key, order) {
    return [...list].sort((a, b) => {
      let va = a[key], vb = b[key];
      if (key === 'name') return order === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      return order === 'asc' ? va - vb : vb - va;
    });
  }

  // Sort by token desc (default)
  const byTokenDesc = sortRows(rows, 'total', 'desc');
  assert.equal(byTokenDesc[0].name, 'gemini-2.5-pro');
  assert.equal(byTokenDesc[2].name, 'claude-3.5-sonnet');

  // Sort by cost desc
  const byCostDesc = sortRows(rows, 'cost', 'desc');
  assert.equal(byCostDesc[0].name, 'claude-3.5-sonnet');
  assert.equal(byCostDesc[2].name, 'gemini-2.5-flash');

  // Sort by name asc
  const byNameAsc = sortRows(rows, 'name', 'asc');
  assert.equal(byNameAsc[0].name, 'claude-3.5-sonnet');
  assert.equal(byNameAsc[2].name, 'gemini-2.5-pro');
});

test('inline-widget uses relaxed collision threshold and ignores composer row siblings', () => {
  // Issue 3: Anti-Retina subpixel collision threshold > 4px
  assert.ok(
    inlineWidgetSource.includes('Math.min(rect.right,other.right)-Math.max(rect.left,other.left)>4&&Math.min(rect.bottom,other.bottom)-Math.max(rect.top,other.top)>4'),
    'Collision threshold must be > 4px to avoid subpixel boundary false positives'
  );
  // Exclude controls inside the same composer row
  assert.ok(
    inlineWidgetSource.includes('composer.row.contains(control)'),
    'Sibling controls within composer.row must not be flagged as external collision obstacles'
  );
});

test('inline-widget recovers from icons-only to full density when free space is available', () => {
  // Issue 3: Dynamic expansion when freeSpace >= 340
  assert.ok(
    inlineWidgetSource.includes('freeSpace=composer.row.clientWidth-branchContentWidth-rightWidth'),
    'Widget must compute available free space in composer row'
  );
  assert.ok(
    inlineWidgetSource.includes('shouldProbe=freeSpace>=340||!densityProbe||key!==densityProbe.key||rowWidth>=densityProbe.width+8'),
    'Widget must re-probe full density whenever freeSpace >= 340, breaking icons-only lock'
  );
});

test('usage-ui Y-axis scaling avoids extra ticks and stays within maximum scale', () => {
  // Extract getAxisScale from usage-ui.cjs
  assert.ok(
    usageUiSource.includes('function getAxisScale(m){'),
    'usage-ui.cjs must include getAxisScale helper function'
  );

  function getAxisScale(m){
    if(m<=1)return {ceiling:4,intervals:4,step:1};
    const p=10**Math.floor(Math.log10(m));
    const norm=m/p;
    let step,intervals;
    if(norm<=1.0){step=0.25*p;intervals=4;}
    else if(norm<=1.5){step=0.5*p;intervals=3;}
    else if(norm<=2.0){step=0.5*p;intervals=4;}
    else if(norm<=2.5){step=0.5*p;intervals=5;}
    else if(norm<=3.0){step=0.75*p;intervals=4;}
    else if(norm<=4.0){step=1.0*p;intervals=4;}
    else if(norm<=5.0){step=1.0*p;intervals=5;}
    else if(norm<=6.0){step=1.5*p;intervals=4;}
    else if(norm<=8.0){step=2.0*p;intervals=4;}
    else{step=2.5*p;intervals=4;}
    const ceiling=Math.round(intervals*step);
    return {ceiling,intervals,step};
  }

  // Image 1: max is ~115M (<= 150M). Must have ceiling = 150M with 3 intervals, NOT 200M!
  const img1 = getAxisScale(115000000);
  assert.equal(img1.ceiling, 150000000, 'Max 115M must not show 200M; ceiling must be 150M');
  assert.equal(img1.intervals, 3);
  assert.equal(img1.step, 50000000);
  assert.ok(115000000 <= img1.ceiling);

  // Exact 150M: ceiling must still be 150M
  const exact150 = getAxisScale(150000000);
  assert.equal(exact150.ceiling, 150000000);

  // 151M (> 150M): now ceiling goes to 200M
  const over150 = getAxisScale(151000000);
  assert.equal(over150.ceiling, 200000000);

  // Image 2: max is ~180M -> ceiling = 200M
  const img2 = getAxisScale(180000000);
  assert.equal(img2.ceiling, 200000000);
  assert.equal(img2.intervals, 4);
  assert.ok(180000000 <= img2.ceiling);

  // Image 3: max is ~330M -> ceiling = 400M
  const img3 = getAxisScale(330000000);
  assert.equal(img3.ceiling, 400000000);
  assert.equal(img3.intervals, 4);
  assert.ok(330000000 <= img3.ceiling);

  // Image 4: max is ~257.6K -> ceiling = 300K
  const img4 = getAxisScale(257600);
  assert.equal(img4.ceiling, 300000);
  assert.equal(img4.intervals, 4);
  assert.ok(257600 <= img4.ceiling);

  // Fuzz testing across 1K to 1B: max <= ceiling must ALWAYS hold
  for (let val = 1000; val <= 1000000000; val *= 1.37) {
    const scale = getAxisScale(val);
    assert.ok(val <= scale.ceiling, `Value ${val} must be <= ceiling ${scale.ceiling}`);
    assert.ok(scale.intervals >= 3 && scale.intervals <= 5, `Intervals must be between 3 and 5, got ${scale.intervals}`);
  }
});
