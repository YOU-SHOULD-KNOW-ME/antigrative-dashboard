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
const theme = await read('compat/theme.cjs');
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
    else if (path === '/inline-widget.js') { content = `window.__agPulseI18nFactory=(${extract(i18n)});window.__agPulseThemeFactory=(${extract(theme)});(${extract(widget)})();`; type = 'text/javascript'; }
    else if (path.startsWith('/toolbar-preview')) { content = await read('sidecars/panel/toolbar-preview.html'); type = 'text/html'; }
    else { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': type + '; charset=utf-8' }); res.end(content);
  } catch { res.writeHead(500); res.end(); }
});
server.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge', headless: true } : { headless: true });
const output = join(root, 'docs', 'assets'); await mkdir(output, { recursive: true });
const errors = [];
// Crop live DOM geometry, including the fixed hover card, without raster edits.
async function captureDetails(page, host, card, file, includeComposer) {
  const isolation=!includeComposer?await page.addStyleTag({content:'.rounded-composer{background:transparent!important;border-color:transparent!important}.editor,.actions>:not(#ag-pulse-status-bar){visibility:hidden}'}):null;
  if(!includeComposer) await host.locator('.bar').evaluate(bar=>{for(const element of bar.children)if(element.dataset.card!=='context')element.style.visibility='hidden';});
  const boxes=await Promise.all([
    (includeComposer?page.locator('.rounded-composer'):host.locator('[data-card="context"]')).boundingBox(),
    host.locator(`#${card}-card`).boundingBox(),
  ]);
  const pad=20, left=Math.max(0,Math.min(...boxes.map(box=>box.x))-pad), top=Math.max(0,Math.min(...boxes.map(box=>box.y))-pad);
  const right=Math.min(page.viewportSize().width,Math.max(...boxes.map(box=>box.x+box.width))+pad);
  const bottom=Math.min(page.viewportSize().height,Math.max(...boxes.map(box=>box.y+box.height))+pad);
  await page.screenshot({path:file,clip:{x:left,y:top,width:right-left,height:bottom-top}});
  if(isolation){await isolation.evaluate(element=>element.remove());await host.locator('.bar').evaluate(bar=>{for(const element of bar.children)element.style.visibility='';});}
}
try {
  for (const mode of ['dark','light']) for (const chinese of [false, true]) {
    const languageSuffix = chinese ? '-zh' : '';
    const suffix = languageSuffix + (mode==='light'?'-light':'');
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 2 });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/toolbar-preview`);
    await page.evaluate(mode=>document.body.dataset.theme=mode,mode);
    await page.addStyleTag({content:`.project{display:none}body{padding-top:65px;background:${mode==='light'?'#f5f6f8':'#111'};color:${mode==='light'?'#505867':'#aaa'}}.rounded-composer{background:${mode==='light'?'#fff':'#202020'};border-color:${mode==='light'?'#cdd3dc':'#303030'}}button{color:${mode==='light'?'#4e5969':'#bbb'}}.send{background:${mode==='light'?'#e7ebf2':'#303030'}}`});
    const host = page.locator('#ag-pulse-status-bar');
    await host.locator('#context-percent').waitFor();
    await page.waitForFunction(() => document.querySelector('#ag-pulse-status-bar')?.shadowRoot?.getElementById('context-percent')?.textContent === '44%');
    if (chinese) await host.locator('#language-toggle').click();
    await host.locator('[data-card="context"]').hover();
    await captureDetails(page,host,'context',join(output,`context${suffix}.png`),false);
    await host.locator('[data-card="cache"]').hover();
    await captureDetails(page,host,'cache',join(output,`widget${suffix}.png`),true);

    if(mode==='light'||process.argv.includes('--details-only')){await page.close();continue;}

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
  console.log('Generated compact English/Chinese widget and context assets in dark/light themes.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
