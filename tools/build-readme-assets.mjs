// Documentation screenshots use the actual widget source and synthetic metrics.
// Optional developer dependency: Playwright, or PLAYWRIGHT_MODULE (absolute path).
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { trajectoryMetrics } from '../sidecars/panel/metrics.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(join(root, file), 'utf8');
const extract = source => source.slice(source.indexOf('module.exports = ') + 17).trim().replace(/;$/, '');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const i18n = await read('compat/i18n.cjs'), widget = await read('compat/inline-widget.cjs');
const id = '11111111-1111-1111-1111-111111111111';
function sample() {
  const now = Date.now();
  const metrics = trajectoryMetrics({ trajectory: { cascadeId: id, generatorMetadata: [{ chatModel: {
    modelDisplayName: 'Gemini 3.8 Flash High', streamingDuration: '50s', timeToFirstToken: '0.6s',
    chatStartMetadata: { contextWindowMetadata: { estimatedTokensUsed: 112000, maxContextTokens: 256000 } },
    usage: { inputTokens: 13441, cacheReadTokens: 614458, outputTokens: 7259,
      responseOutputTokens: 5230, thinkingOutputTokens: 2029, apiProvider: 'API_PROVIDER_GOOGLE_GEMINI' },
  } }] } });
  return { connection: 'live', serverTime: new Date(now).toISOString(), quotaUpdatedAt: new Date(now).toISOString(),
    speed: metrics, groups: [{ id: 'gemini', name: 'Gemini', windows: {
      '5h': { available: true, remaining: .834, resetAt: new Date(now + 9978000).toISOString() },
      weekly: { available: true, remaining: .617, resetAt: new Date(now + 393246000).toISOString() },
    } }] };
}
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://127.0.0.1').pathname;
    let content, type;
    if (path === '/api/metrics') { content = JSON.stringify(sample()); type = 'application/json'; }
    else if (path === '/inline-widget.js') { content = `window.__agPulseI18nFactory=(${extract(i18n)});(${extract(widget)})();`; type = 'text/javascript'; }
    else if (path.startsWith('/toolbar-preview')) { content = await read('sidecars/panel/toolbar-preview.html'); type = 'text/html'; }
    else { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': type + '; charset=utf-8' }); res.end(content);
  } catch { res.writeHead(500); res.end(); }
});
server.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge', headless: true } : { headless: true });
const output = join(root, 'docs', 'assets'); await mkdir(output, { recursive: true });
const errors = [];
try {
  for (const chinese of [false, true]) {
    const suffix = chinese ? '-zh' : '';
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 2 });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/toolbar-preview`);
    const host = page.locator('#ag-pulse-status-bar');
    await host.locator('#context-percent').waitFor();
    await page.waitForFunction(() => document.querySelector('#ag-pulse-status-bar')?.shadowRoot?.getElementById('context-percent')?.textContent === '44%');
    if (chinese) await host.locator('#language-toggle').click();
    await host.locator('[data-card="context"]').hover();
    await page.screenshot({ path: join(output, `context${suffix}.png`) });

    await page.setViewportSize({ width: 1000, height: 680 });
    await page.addStyleTag({ content: '.project{display:none}body{padding-top:450px}' });
    await page.evaluate(chinese => {
      const heading = document.createElement('header'); heading.id = 'docs-heading';
      heading.style.cssText = 'position:absolute;left:110px;top:34px;font:28px "Segoe UI","Microsoft YaHei",sans-serif;color:#eef1f7';
      heading.textContent = chinese ? '三个控件，完整详情。' : 'Three controls. All the details.';
      const caption = document.createElement('div'); caption.style.cssText = 'font-size:13px;color:#929eaf;margin-top:12px';
      caption.textContent = chinese ? '当前插件源码渲染 · 示意数据 · 悬停上下文查看 5h 和周额度' : 'Rendered from the current widget · Illustrative data · Hover context for both quotas';
      heading.append(caption); document.body.prepend(heading);
    }, chinese);
    await host.locator('[data-card="cache"]').hover();
    await page.screenshot({ path: join(output, `widget${suffix}.png`) });

    await page.setViewportSize({ width: 1400, height: 680 });
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.querySelector('#ag-pulse-status-bar')?.shadowRoot?.activeElement?.blur());
    await page.mouse.move(20, 20);
    await page.addStyleTag({ content: 'body{padding:0;min-height:680px;background:linear-gradient(135deg,#10131a,#161a24)}.rounded-composer{position:absolute;left:305px;top:321px;width:790px;margin:0;transform:scale(1.55);transform-origin:center top}.editor{height:52px}.actions{height:35px}#docs-heading{display:none}' });
    await page.evaluate(chinese => {
      const header = document.createElement('header');
      header.style.cssText = 'position:absolute;left:85px;top:60px;color:#eef1f7;font-family:"Segoe UI","Microsoft YaHei",sans-serif';
      const brand = document.createElement('div'); brand.textContent = 'ANTIGRATIVE DASHBOARD · v0.5'; brand.style.cssText = 'color:#93b1ff;font-weight:650;font-size:16px';
      const title = document.createElement('h1'); title.textContent = chinese ? '速度、缓存、上下文。就在模型选择旁。' : 'Speed. Cache. Context. Beside your model.'; title.style.cssText = 'font-size:43px;line-height:1.3;margin:28px 0;color:#f0f3fa';
      const subtitle = document.createElement('div'); subtitle.textContent = chinese ? '悬停上下文，一并查看 5 小时和周额度。' : 'Hover context for five-hour and weekly quotas together.'; subtitle.style.cssText = 'font-size:24px;color:#a9b7ce';
      header.append(brand,title,subtitle); document.body.append(header);
      const footer = document.createElement('div'); footer.style.cssText = 'position:absolute;left:85px;right:85px;top:522px;display:grid;grid-template-columns:1fr 1fr 1fr;color:#dce4f4;font:22px "Segoe UI","Microsoft YaHei",sans-serif';
      const columns = chinese ? [['三个常驻控件','更多空间留给对话'],['悬停，一并查看','上下文与两种额度'],['Windows · Linux · macOS','同一安装包，数据保存在本地']] : [['Three visible controls','Keep room for your conversation'],['One combined hover card','Context and both quota windows'],['Windows · Linux · macOS','One package. Local statistics.']];
      for (const [title,subtitle] of columns) { const box = document.createElement('div'); const heading = document.createElement('strong'); heading.textContent=title; const note = document.createElement('div'); note.textContent=subtitle;note.style.cssText='font-size:16px;color:#91a0b9;margin-top:12px';box.append(heading,note);footer.append(box); }
      const note = document.createElement('div'); note.textContent = chinese ? '当前源码渲染 · 示意数据 · MIT' : 'Rendered from current source · Illustrative data · MIT';note.style.cssText='position:absolute;left:85px;bottom:32px;color:#71819a;font:14px "Segoe UI","Microsoft YaHei",sans-serif';
      document.body.append(footer,note);
    }, chinese);
    await page.screenshot({ path: join(output, `hero${suffix}.png`) });
    await page.close();
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Generated current English/Chinese README assets: hero, widget, context.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
