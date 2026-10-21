// Production sidecar script under HTTP and an opaque sandboxed iframe. The
// iframe has no module CORS access; its fake SDK bridge serves synthetic data.
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {panelAppSource,panelPageSource} from '../sidecars/panel/panel-source.mjs';
import {trajectoryMetrics} from '../sidecars/panel/metrics.mjs';
const createTheme=createRequire(import.meta.url)('../compat/theme.cjs');
const repo=join(dirname(fileURLToPath(import.meta.url)),'..');
const preview=process.argv.includes('--preview');
const html=panelPageSource();
const code=panelAppSource(),requests=[],errors=[],results=[];
const id='11111111-1111-1111-1111-111111111111';
let prefs={language:'en',revision:1},metricsCalls=0,failMetrics=false,rate=38.7;
const transcriptSample={version:1,status:'ready',complete:true,userTokens:100,assistantTokens:200,toolTokens:50,systemTokens:10,totalTokens:360,matchedSteps:4,compactionMarkers:1,imageSteps:0};
const sample=()=>({connection:'live',serverTime:new Date().toISOString(),quotaUpdatedAt:new Date().toISOString(),preferences:prefs,groups:[{id:'gemini',name:'Gemini',windows:{'5h':{available:true,remaining:.8,resetAt:new Date(Date.now()+3600000).toISOString()},weekly:{available:true,remaining:.75,resetAt:new Date(Date.now()+86400000).toISOString()}}}],speed:{transcriptStats:transcriptSample,...trajectoryMetrics({trajectory:{cascadeId:id,steps:[{type:'USER_INPUT'}],generatorMetadata:Array.from({length:23},(_,i)=>({chatModel:{modelDisplayName:'Gemini 3.8 Flash',streamingDuration:(100/rate)+'s',timeToFirstToken:'1.2s',usage:{messageId:'fixture-'+i,inputTokens:100,cacheReadTokens:300,outputTokens:100,responseOutputTokens:100,cacheWriteTokens:0,apiProvider:'API_PROVIDER_GOOGLE_GEMINI'},chatStartMetadata:{contextWindowMetadata:{estimatedTokensUsed:20000,maxContextTokens:100000}}}}))}})}});
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost'),path=url.pathname;requests.push(path);
 if(path==='/api/metrics'||path==='/api/preferences'){
  res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  if(req.method==='OPTIONS'){res.end();return;}
  res.setHeader('Content-Type','application/json');
  if(path==='/api/metrics'){metricsCalls++;res.statusCode=failMetrics?503:200;res.end(JSON.stringify(failMetrics?{error:'Fixture unavailable'}:sample()));return;}
  if(req.method==='POST'){let text='';for await(const chunk of req)text+=chunk;prefs={...prefs,...JSON.parse(text),revision:prefs.revision+1};}
  res.end(JSON.stringify(prefs));return;
 }
 if(path==='/app.js'){res.setHeader('Content-Type','application/javascript');res.end(url.searchParams.has('v')?code:'throw new Error("Fixture stale unversioned script");');return;}
 if(path==='/styles.css'){res.setHeader('Content-Type','text/css');res.end(url.searchParams.has('v')?await readFile(join(repo,'sidecars/panel/styles.css')):'');return;}
 if(path==='/theme.css'){res.setHeader('Content-Type','text/css');res.end(createTheme().css(':root'));return;}
 if(path==='/preload.js'){res.setHeader('Content-Type','application/javascript');res.end(url.searchParams.has('sdk')?`window.sidecar={conversationId:${JSON.stringify(id)},fetch:(p,init)=>fetch(${JSON.stringify(base)}+p,init)};document.addEventListener('DOMContentLoaded',()=>document.body.style.background='#fafafa');`:'');return;}
 if(path==='/frame'){
  const inner=html.replace('<head>',`<head><base href="${base}/">`).replace('/preload.js','/preload.js?sdk');
  res.setHeader('Content-Type','text/html');res.end(`<iframe title="Dashboard sidecar" style="width:400px;height:640px;border:0" sandbox="allow-scripts" srcdoc="${inner.replaceAll('&','&amp;').replaceAll('"','&quot;')}"></iframe>`);return;
 }
 if(path==='/'){
  let content=url.searchParams.has('sync')?html.replace('<script defer src=','<script src='):html;
  if(preview){const light=url.searchParams.get('theme')==='light';content=content.replace('</head>',`<style>:root{--background:${light?'#f5f6f8':'#16181c'};--foreground:${light?'#242830':'#e2e4e8'}}.preview-note{position:fixed;top:12px;left:16px;font:12px sans-serif;color:${light?'#606978':'#9ca5b4'}}.preview-note a{color:inherit}</style></head>`).replace('<body>',`<body><aside class="preview-note">侧栏本地预览 · 示例数据 · <a href="/?theme=dark">Dark</a> / <a href="/?theme=light">Light</a></aside>`);}
  res.setHeader('Content-Type','text/html');res.end(content);return;
 }
 // Intentionally no CORS-enabled module endpoints.
 res.writeHead(404);res.end();
});
await new Promise(r=>server.listen(preview?17913:0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
if(preview){console.log('Side panel preview: '+base);await new Promise(()=>{});}
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch(process.platform==='win32'&&!process.env.CI?{channel:'msedge',headless:true}:{headless:true});
try{
 for(const mode of ['deferred','early-classic','opaque-iframe']){
  prefs={language:'en',revision:1};rate=38.7;
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+(mode==='opaque-iframe'?'/frame':mode==='early-classic'?'/?sync':''));
  const view=mode==='opaque-iframe'?page.frameLocator('iframe'):page;
  // Provider reference and unknown compaction must not change the fixture's
  // active 100K host window / 20% occupancy in either language.
  await view.locator('#strip-tps').waitFor();
  await view.locator('#strip-context').filter({hasText:'20%'}).waitFor();
  assert.equal(await view.locator('#context-tokens').textContent(),'20K / 100K tok');
  assert.equal(await view.locator('#context-provider-limit,#context-compaction-limit,#context-host-limit,#context-note,#transcript-details').count(),0,'Compact context omits duplicate capacities and diagnostic prose');
  await view.locator('#strip-tps').filter({hasText:'38.7'}).waitFor();
  assert.deepEqual(await view.locator('.metric-label span').allTextContents(),['Speed','Cache','Context']);
  assert.ok(await view.locator('#strip-tps').evaluate(e=>parseFloat(getComputedStyle(e).fontSize))>=18);
  assert.equal(await view.locator('#strip-cache').textContent(),'75.0%');assert.equal(await view.locator('#strip-context').textContent(),'20%');
  assert.equal(await view.locator('#five-balance').textContent(),'80.0%');assert.equal(await view.locator('#week-balance').textContent(),'75.0%');
  const frame=()=>view.locator('.widget').evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};});
  const initialFrame=await frame();assert.equal(await view.locator('#speed-card').isVisible(),true,'Default view shows statistics, not an empty hover prompt');
  for(const name of ['cache','context','speed']){
   await view.locator(`[data-card=${name}]`).click();assert.equal(await view.locator(`#${name}-card`).isVisible(),true);
   await page.mouse.move(0,0);await page.waitForTimeout(250);assert.equal(await view.locator(`#${name}-card`).isVisible(),true,'Selection remains after pointer leaves');
   assert.deepEqual(await frame(),initialFrame,'Metric selection must preserve the outer frame');
  }
  await view.locator('#speed-tab').focus();await page.keyboard.press('ArrowRight');assert.equal(await view.locator('#cache-tab').getAttribute('aria-selected'),'true');
  await page.keyboard.press('End');assert.equal(await view.locator('#context-tab').getAttribute('aria-selected'),'true');
  assert.equal(await view.locator('#context-card').evaluate(e=>e.scrollHeight>e.clientHeight),true,'Long context/quota details scroll inside the stable frame');
  await view.locator('#context-card').evaluate(e=>e.scrollTop=100);
  await view.locator('#cache-tab').click();await view.locator('#context-tab').click();assert.ok(await view.locator('#context-card').evaluate(e=>e.scrollTop)>0);
  if(mode==='opaque-iframe'){
   assert.equal(await view.locator('html').evaluate(()=>self.origin),'null');
   assert.equal(await view.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor===getComputedStyle(document.querySelector('.widget')).backgroundColor),true,'SDK inline body background follows the dashboard theme');
  }
  await view.locator('#language-toggle').click();await view.locator('[data-language-menu] [data-language="zh-CN"]').click();await view.locator('#language-toggle').filter({hasText:'中'}).waitFor();
  assert.equal(await view.locator('#context-tokens').textContent(),'20K / 100K tok');
  assert.equal(await view.locator('#strip-context').textContent(),'20%');
  assert.deepEqual(await view.locator('.metric-label span').allTextContents(),['速度','缓存','上下文']);
  assert.deepEqual(await frame(),initialFrame,'Language switches must not resize the frame');
  await view.locator('#language-toggle').click();await page.keyboard.press('End');await page.keyboard.press('Enter');
  await view.locator('#language-toggle').filter({hasText:'繁'}).waitFor();
  assert.deepEqual(await view.locator('.metric-label span').allTextContents(),['速率','快取','上下文']);
  assert.deepEqual(await frame(),initialFrame);assert.equal(await view.locator('#context-tokens').textContent(),'20K / 100K tok');
  await view.locator('#language-toggle').click();await page.keyboard.press('Escape');
  assert.equal(await view.locator('[data-language-menu]').evaluate(e=>e.matches(':popover-open')),false);
  await view.locator('#language-toggle').click();await view.locator('[data-language-menu] [data-language="zh-CN"]').click();
  await mkdir(join(repo,'.data/sidebar-design'),{recursive:true});
  for(const name of ['speed','cache','context']){await view.locator(`[data-card=${name}]`).click();await view.locator(`#${name}-card`).evaluate(e=>e.scrollTop=0);await page.waitForTimeout(180);await page.screenshot({path:join(repo,`.data/sidebar-design/${mode}-${name}-zh.png`)});}
  rate=51.2;await view.locator('#refresh-button').click();await view.locator('#strip-tps').filter({hasText:'51.2'}).waitFor();
  const installed=await view.locator('html').evaluate(()=>window.__agPulsePanelInstalled);assert.equal(installed,true);
  results.push({mode,tokens:true,context:true,language:true,manualRefresh:true});await page.close();
 }
 for(const width of [280,360,440]){
  const page=await browser.newPage({viewport:{width,height:800}});page.on('pageerror',e=>errors.push(e.message));prefs={language:'en',revision:1};
  await page.goto(base);await page.locator('#strip-tps').filter({hasText:'51.2'}).waitFor();
  const size=()=>page.locator('.widget').evaluate(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,overflow:e.scrollWidth>e.clientWidth}));const initial=await size();assert.equal(initial.overflow,false);
  for(const name of ['speed','cache','context']){await page.locator(`[data-card=${name}]`).click();assert.deepEqual(await size(),initial);}
  await page.screenshot({path:join(repo,`.data/sidebar-design/width-${width}.png`)});await page.close();
 }
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));prefs={language:'en',revision:1};failMetrics=true;
 await page.goto(base);await page.waitForFunction(()=>document.getElementById('health-note').textContent.length>0);
 failMetrics=false;rate=61.3;await page.locator('#strip-tps').filter({hasText:'61.3'}).waitFor();
 // A duplicate script must not start another poll/listener tree.
 const appUrl=await page.locator('script[src*="/app.js"]').getAttribute('src');await page.addScriptTag({url:base+appUrl});await page.waitForTimeout(300);
 const before=metricsCalls;rate=62.4;await page.locator('#refresh-button').click();await page.locator('#strip-tps').filter({hasText:'62.4'}).waitFor();
 assert.equal(metricsCalls-before,1);assert.deepEqual(errors,[]);
 assert.equal(requests.some(p=>['/format.mjs','/i18n.js','/theme.js'].includes(p)),false);
 await mkdir(join(repo,'.data/issue11'),{recursive:true});await page.screenshot({path:join(repo,'.data/issue11/panel-regression.png')});
 console.log(JSON.stringify({checks:results,automaticRecovery:true,duplicateInitSafe:true,moduleRequests:0,pageErrors:errors}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
