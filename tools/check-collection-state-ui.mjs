// Issue #25 synthetic states against the production widget. No personal data.
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,join} from 'node:path';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {trajectoryMetrics} from '../sidecars/panel/metrics.mjs';
const repo=join(dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url),preview=process.argv.includes('--preview');
const source=['i18n','theme','usage-ui','inline-widget'].map(n=>require(join(repo,'compat',n+'.cjs')).toString());
const install=`window.__agPulseI18nFactory=${source[0]};window.__agPulseThemeFactory=${source[1]};window.__agPulseUsageFactory=${source[2]};(${source[3]})();`;
const id='11111111-1111-1111-1111-111111111111';
const speed=trajectoryMetrics({trajectory:{cascadeId:id,steps:[],generatorMetadata:[{chatModel:{modelDisplayName:'Gemini',streamingDuration:'2s',usage:{inputTokens:1000,cacheReadTokens:600,responseOutputTokens:100,outputTokens:100,apiProvider:'API_PROVIDER_GOOGLE_GEMINI'},chatStartMetadata:{contextWindowMetadata:{estimatedTokensUsed:24000,maxContextTokens:256000}}}}]}});
const usage={accountKey:'collection-fixture',today:'2026-10-30',timeZone:'Asia/Shanghai',models:[],days:[],todayTokens:0,weekTokens:0,monthTokens:0,totalTokens:0,requests:0,syncing:false};
const server=createServer((req,res)=>{if(req.url==='/widget.js'){res.setHeader('Content-Type','text/javascript');res.end(install);return;}
 const url=new URL(req.url,'http://localhost'),lang=['en','zh-CN','zh-TW'].includes(url.searchParams.get('lang'))?url.searchParams.get('lang'):'zh-CN';
 res.setHeader('Content-Type','text/html;charset=utf-8');res.end(`<!doctype html><meta charset="utf-8"><title>Collection limit preview</title><style>:root{--primary:#c58b32;--background:#1e201c}body[data-theme=light]{--background:#f3efe3;background:#f3efe3;color:#302d23}body[data-theme=light] .composer{background:#e5dfcf}body[data-theme=light] button,body[data-theme=light] select{background:#e5dfcf;color:#302d23}body{background:#1e201c;color:#f1eadd;font:14px system-ui;margin:0;padding:30px}button,select{color:inherit;background:#35382e;border:1px solid #77755e;border-radius:7px;padding:6px}.composer{margin:290px auto 0;max-width:1000px;padding:12px;border:1px solid #696856;border-radius:14px;background:#292c24}.editor{height:64px;outline:0}.actions,.left,.right{display:flex;gap:5px;align-items:center}.left{flex:1;min-width:0}.right{flex:none}.actions button{white-space:nowrap;border:0;height:28px;padding:2px 5px}.review{line-height:1.7}a{color:#d9b96d}</style><header class="review"><h2>统计受限 · 本地验收</h2><p>合成会话与示例数据，使用真实控件代码；不会读取你的历史。</p><select id="scenario"><option value="processing">后台补全（自动完成）</option><option value="processing-saved">后台补全（保留旧统计）</option><option value="limited" selected>无法继续统计</option><option value="saved">保留上次完整统计</option><option value="serialized">序列化统计超限</option><option value="field">单字段超限</option><option value="empty">尚无请求</option><option value="normal">正常统计</option></select> <select id="language"><option value="en">English</option><option value="zh-CN">简体中文</option><option value="zh-TW">繁體中文</option></select> <button id="theme" onclick="document.body.dataset.theme=document.body.dataset.theme==='light'?'dark':'light';document.documentElement.style.setProperty('--background',document.body.dataset.theme==='light'?'#f3efe3':'#1e201c')">切换深浅主题</button> <button onclick="document.querySelector('.composer').style.maxWidth=document.querySelector('.composer').style.maxWidth?'':'260px'">切换窄栏</button></header><main data-cascade-id="${id}"><section class="composer" data-testid="agent-input-box"><div role="textbox" contenteditable="true" class="editor">输入框（仅用于预览）</div><div class="actions"><div class="left"><button data-testid="model-selector-trigger">Gemini</button></div><div class="right"><button aria-label="Voice">○</button><button data-testid="send-button">➜</button></div></div></section></main><script>
 history.replaceState({},'', '/c/${id}');window.mode='limited';window.processingStarted=0;window.base=${JSON.stringify(speed)};window.usage=${JSON.stringify(usage)};window.testPrefs={language:'${lang}',revision:1,languageGuideDismissed:true,usageGuideDismissed:true};window.calls=[];
 window.agPulseHost={report:()=>{},getPreferences:async()=>({...testPrefs}),setPreferences:async value=>(testPrefs={...testPrefs,...value,revision:testPrefs.revision+1}),getMetrics:async input=>{calls.push(input);if(mode==='processing'&&processingStarted&&Date.now()-processingStarted>6000)mode='normal';const processing=mode.startsWith('processing'),limited=!['normal','empty'].includes(mode),saved=mode==='saved'||mode==='processing-saved';const collection=processing?{state:'processing',code:'background-collection',stage:'steps',processedSteps:Math.floor((Date.now()-processingStarted)/100),processedGenerators:0,freshness:saved?'saved':'unavailable',lastSuccessAt:saved?'2026-10-30T01:00:00Z':null}:limited?{state:'limited',code:'budget-exceeded',kind:mode==='serialized'?'projected-json':mode==='field'?'field':'retained-fields',...(mode==='field'?{unit:'characters',limit:16384,observed:16385}:{unit:'bytes',limitBytes:8388608,observedBytes:8388672}),complete:false,retryAt:new Date(Date.now()+30000).toISOString(),freshness:saved?'saved':'unavailable',lastSuccessAt:saved?'2026-10-30T01:00:00Z':null}:null;return {connection:'live',groups:[{id:'gemini',name:'Gemini',windows:{'5h':{available:true,remaining:.7,resetAt:new Date(Date.now()+18000000).toISOString()},weekly:{available:true,remaining:.8,resetAt:new Date(Date.now()+604800000).toISOString()}}}],speed:saved?{...base,restoredFromHistory:true,savedAt:'2026-10-30T01:00:00Z'}:mode==='normal'?base:null,collection,usage,preferences:{...testPrefs}}}};
 window.refreshFixture=()=>document.getElementById('ag-pulse-status-bar').shadowRoot.querySelector('.refresh').click();document.getElementById('scenario').onchange=e=>{mode=e.target.value;processingStarted=Date.now();refreshFixture()};document.getElementById('language').value=testPrefs.language;document.getElementById('language').onchange=e=>{testPrefs={...testPrefs,language:e.target.value,revision:testPrefs.revision+1};refreshFixture()};
 </script><script src="/widget.js"></script>`);
});
await new Promise(r=>server.listen(preview?17918:0,'127.0.0.1',r));
if(preview){console.log('Synthetic collection preview: http://127.0.0.1:17918/?lang=zh-CN');await new Promise(()=>{});}
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch(process.platform==='win32'&&!process.env.CI?{channel:'msedge',headless:true}:{headless:true});
const errors=[],results=[];
try{for(const lang of ['en','zh-CN','zh-TW']){
 const page=await browser.newPage({viewport:{width:1280,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 try{
 await page.goto(`http://127.0.0.1:${server.address().port}/?lang=${lang}`);
 const strip=page.locator('#ag-pulse-status-bar');await strip.waitFor();await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar')?.dataset.collection==='limited');
 const label=lang==='en'?'Statistics limited':lang==='zh-CN'?'统计受限':'統計受限';
 assert.equal(await strip.locator('[data-card=cache]').getAttribute('aria-label'),label);
 assert.equal(await strip.locator('#samples').textContent(),'—');
 await strip.locator('[data-card=cache]').click();const notice=strip.locator('#cache-card .collection-notice');await notice.waitFor({state:'visible'});
 await notice.locator('summary').click();assert.match(await notice.locator('.collection-budget-size').textContent(),/8\.00 MiB/);assert.equal(await notice.locator('a').getAttribute('href'),'https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/blob/main/docs/LONG_CONVERSATIONS.md');
 for(const mode of ['saved','serialized','field','empty','normal','limited']){
  await page.keyboard.press('Escape');await page.selectOption('#scenario',mode);
  await page.waitForFunction(mode=>{const r=document.getElementById('ag-pulse-status-bar').shadowRoot;return ['empty','normal'].includes(mode)?!document.getElementById('ag-pulse-status-bar').dataset.collection:mode==='saved'?r.getElementById('tps').textContent==='50.0':r.getElementById('tps').textContent==='—';},mode);
  await strip.locator('[data-card=cache]').click();
  if(mode==='saved'){assert.match(await notice.locator('.collection-state').textContent(),/Last complete|上次完整/);assert.equal(await strip.locator('#tps').textContent(),'50.0');}
  if(mode==='field'){await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar').shadowRoot.querySelector('#cache-card .collection-budget-size').textContent.includes('16,385'));assert.doesNotMatch(await notice.locator('.collection-budget-size').textContent(),/MiB/);}
  if(['empty','normal'].includes(mode)){assert.equal(await notice.isVisible(),false);assert.equal(await strip.locator('.bar .collection-warning').isVisible(),false);}
 }
 // Completion is delivered by the existing polling loop, without any refresh click.
 await page.keyboard.press('Escape');await page.selectOption('#scenario','processing');
 await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar')?.dataset.collection==='processing');
 const processingLabel=lang==='en'?'Completing statistics':lang==='zh-CN'?'正在补全统计':'正在補全統計';
 assert.equal(await strip.locator('[data-card=cache]').getAttribute('aria-label'),processingLabel);
 assert.equal(await strip.locator('.collection-warning').isVisible(),false);
 await strip.locator('[data-card=cache]').click();await notice.locator('summary').click();
 assert.doesNotMatch(await notice.locator('.collection-budget-size').textContent(),/%|MiB/);
 assert.equal(await notice.locator('a').isVisible(),false);
 await page.waitForFunction(()=>!document.getElementById('ag-pulse-status-bar')?.dataset.collection,null,{timeout:12000});
 assert.equal(await strip.locator('#tps').textContent(),'50.0');assert.equal(await notice.isVisible(),false);
 await page.keyboard.press('Escape');await page.selectOption('#scenario','processing-saved');
 await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar')?.dataset.collection==='processing');
 assert.equal(await strip.locator('#tps').textContent(),'50.0');
 await strip.locator('[data-card=cache]').click();assert.match(await notice.locator('.collection-state').textContent(),/Last complete|上次完整/);
 await page.keyboard.press('Escape');await page.evaluate(()=>document.querySelector('.composer').style.maxWidth='260px');
 await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar').classList.contains('icons-only'));
 assert.equal(await strip.locator('.bar .collection-processing').isVisible(),true);assert.equal(await strip.locator('.bar .collection-label').isVisible(),false);
 assert.equal(await strip.locator('#five-balance').textContent(),'70.0%');
 await page.evaluate(()=>document.querySelector('.composer').style.maxWidth='');await page.selectOption('#scenario','limited');
 await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar')?.dataset.collection==='limited');
 await page.keyboard.press('Escape');await page.evaluate(()=>document.querySelector('.composer').style.maxWidth='260px');await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar')?.classList.contains('icons-only'));
 assert.equal(await strip.locator('.bar .collection-warning').isVisible(),true);assert.equal(await strip.locator('.bar .collection-label').isVisible(),false);assert.equal(await strip.locator('.bar .chip').count(),3);
 await strip.locator('[data-card=context]').click();assert.equal(await strip.locator('#context-summary').textContent(),'—');assert.equal(await strip.locator('#five-balance').textContent(),'70.0%');
 await page.keyboard.press('Escape');await page.click('#theme');await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar')?.getAttribute('data-pulse-theme')==='light');await strip.locator('[data-card=context]').click();assert.equal(await strip.locator('#context-card .collection-notice').isVisible(),true);

 await mkdir(join(repo,'.data/issue25-validation'),{recursive:true});await page.screenshot({path:join(repo,'.data/issue25-validation',`collection-${lang}.png`)});
 results.push({lang,limited:true,saved:true,fieldUnits:true,normalRecovery:true,narrow:true,quotaUnaffected:true,automaticBackgroundCompletion:true,processingSaved:true,processingNarrow:true});
 }finally{await page.close();}
}assert.deepEqual(errors,[]);console.log(JSON.stringify({results,pageErrors:errors},null,2));}finally{await browser.close();await new Promise(r=>server.close(r));}
