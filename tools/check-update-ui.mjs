// Production menu in a real browser, using synthetic update responses only.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const repo=join(dirname(fileURLToPath(import.meta.url)),'..');
const names=['compat/i18n.cjs','compat/theme.cjs','compat/inline-widget.cjs','compat/update-ui.cjs'];
const sources=await Promise.all(names.map(name=>readFile(join(repo,name),'utf8'))),extract=s=>s.slice(s.indexOf('module.exports = ')+17).trim().replace(/;$/,'');
const html=`<!doctype html><meta charset="utf-8"><style>:root{--primary:#bc714e}body{margin:0;background:#151311;color:#eee;font:12px 'Segoe UI';padding:32px}.composer{margin:340px auto 0;max-width:860px;background:#27221f;border-radius:16px;padding:12px}.editor{height:42px}.row{display:flex;gap:6px;align-items:center}.left{display:flex;flex:1;min-width:0}.right{display:flex;flex:none}button{background:transparent;border:0;color:inherit}</style><div class="rounded-composer composer"><div class="editor" contenteditable="true" role="combobox" aria-label="Message input"></div><div class="row"><div class="left"><button aria-label="Add context">＋</button><button data-testid="model-selector-trigger">Gemini 3.8 Flash</button></div><div class="right"><button aria-label="Send message">➤</button></div></div></div><script>
history.replaceState({},'', '/c/11111111-1111-1111-1111-111111111111');window.calls=[];window.nextUpdate='current';window.prefs={language:'zh-CN',languageGuideDismissed:true,usageGuideDismissed:true,revision:1};
window.agPulseHost={getPreferences:async()=>prefs,setPreferences:async input=>(prefs={...prefs,...input,revision:prefs.revision+1}),getMetrics:async()=>({connection:'live',preferences:prefs,groups:[],speed:{conversationId:'11111111-1111-1111-1111-111111111111',tps:32,rounds:1,steps:2,measuredRequests:1,counts:{responseOutput:100,thinkingOutput:0},context:{usedTokens:20000,maxTokens:100000,usedFraction:.2,remainingFraction:.8,model:'Gemini'}}}),updatePlugin:async input=>{calls.push(input);if(input.action==='apply')return {state:'installing',host:'app',currentVersion:'0.8.6',latestVersion:'0.8.7',progress:{phase:'download',received:524288,total:1048576}};if(input.action==='status')return {state:'installed',host:'app',currentVersion:'0.8.7',latestVersion:'0.8.7'};if(input.action==='reload')return {state:'reloading',host:'app',currentVersion:'0.8.7',latestVersion:'0.8.7'};await new Promise(r=>setTimeout(r,200));return {state:nextUpdate,host:'app',currentVersion:'0.8.6',latestVersion:nextUpdate==='available'?'0.8.7':'0.8.6',notes:nextUpdate==='available'?'Preview changes\\n<img src="https://invalid.example/private">':'',error:nextUpdate==='error'?'network':undefined};}};
window.__agPulseI18nFactory=(${extract(sources[0])});window.__agPulseThemeFactory=(${extract(sources[1])});window.__agPulseUpdateFactory=(${extract(sources[3])});(${extract(sources[2])})();
</script>`;
await mkdir(join(repo,'.data/update-ui'),{recursive:true});
await writeFile(join(repo,'.data/update-ui/updater-fixture.html'),html);
const {Script}=await import('node:vm');new Script(html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>')));
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');const browser=await chromium.launch(process.platform==='win32'&&!process.env.CI?{channel:'msedge',headless:true}:{headless:true});
try{
 const page=await browser.newPage({viewport:{width:1100,height:860}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);

 await page.locator('[data-card=context]').click();await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>calls.length),0,'Mounting and quota refresh must not check for updates');
 await page.locator('#plugin-menu-button').click();assert.equal(await page.locator('#check-update').textContent(),'检查更新');await page.locator('#check-update').click();
 await page.locator('#update-status').filter({hasText:'已是最新版本'}).waitFor();assert.equal(await page.locator('#update-current').textContent(),'v0.8.6');assert.equal(await page.locator('#update-latest').textContent(),'v0.8.6');assert.equal(await page.locator('#update-action').isVisible(),false);assert.equal(await page.evaluate(()=>calls.length),1);
 // Check the icon against its actual button, including zoom and both themes.
 for(const zoom of [1,1.25,1.5])for(const theme of ['dark','light']){
  await page.evaluate(({zoom,theme})=>{document.body.style.zoom=zoom;document.body.dataset.theme=theme;},{zoom,theme});
  const geometry=await page.locator('#update-close').evaluate(button=>{const b=button.getBoundingClientRect(),i=button.querySelector('svg').getBoundingClientRect();return {dx:Math.abs((b.left+b.right-i.left-i.right)/2),dy:Math.abs((b.top+b.bottom-i.top-i.bottom)/2),width:b.width,height:b.height};});
  assert.ok(geometry.dx<.6&&geometry.dy<.6,`Close icon must be centered at ${zoom} in ${theme}: ${JSON.stringify(geometry)}`);
  assert.ok(Math.abs(geometry.width-geometry.height)<.6,'Close button must remain square');
 }
 await page.evaluate(()=>{document.body.style.zoom=1;document.body.dataset.theme='dark';});
 await mkdir(join(repo,'.data/update-ui'),{recursive:true});await page.screenshot({path:join(repo,'.data/update-ui/current-zh.png')});
 await page.locator('#update-close').click();await page.locator('[data-card=context]').click();await page.locator('#card-language-en').click();await page.locator('#plugin-menu-button').click();await page.locator('#check-update').click();await page.locator('#update-status').filter({hasText:'up to date'}).waitFor();assert.equal(await page.locator('#update-title').textContent(),'Plugin update');
 await page.locator('#update-close').click();await page.evaluate(()=>{nextUpdate='available';});await page.locator('[data-card=context]').click();await page.locator('#plugin-menu-button').click();await page.locator('#check-update').click();await page.locator('#update-status').filter({hasText:'Update available'}).waitFor();assert.equal(await page.locator('#update-notes img').count(),0);assert.ok((await page.locator('#update-notes').textContent()).includes('<img'));
 await page.screenshot({path:join(repo,'.data/update-ui/available-en.png')});await page.locator('#update-action').click();assert.equal(await page.locator('#plugin-update-dialog').getAttribute('aria-busy'),'true');assert.equal(await page.locator('#update-progress-track').getAttribute('aria-valuenow'),'50');assert.match(await page.locator('#update-progress-value').textContent(),/0.5 \/ 1.0 MB.*50%/);await page.screenshot({path:join(repo,'.data/update-ui/downloading-en.png')});await page.locator('#update-status').filter({hasText:'Update installed'}).waitFor();assert.equal(await page.locator('#update-progress-track').getAttribute('aria-valuenow'),'100');assert.equal(await page.locator('#update-action').textContent(),'Reload plugin');await page.locator('#update-action').click();await page.locator('#update-status').filter({hasText:'Reloading'}).waitFor();
 await page.locator('#update-close').click();await page.evaluate(()=>{nextUpdate='error';});await page.locator('[data-card=context]').click();await page.locator('#plugin-menu-button').click();await page.locator('#check-update').click();await page.locator('#update-status').filter({hasText:'Update incomplete'}).waitFor();assert.match(await page.locator('#update-feedback').textContent(),/Connection failed/);assert.equal(await page.locator('#update-action').textContent(),'Retry');
 // The production backend returns checking immediately, then the UI polls.
 await page.evaluate(()=>{const original=agPulseHost.updatePlugin;window.checkReady=false;agPulseHost.updatePlugin=async input=>{if(input.action==='check'){calls.push(input);return {state:'checking',host:'app',currentVersion:'0.8.6'};}if(input.action==='status'){calls.push(input);return {state:checkReady?'current':'checking',host:'app',currentVersion:'0.8.6',latestVersion:'0.8.6'};}return original(input);};});
 await page.locator('#update-action').click();await page.locator('#update-status').filter({hasText:'Checking'}).waitFor();
 assert.equal(await page.locator('#plugin-update-dialog').getAttribute('aria-busy'),'true');assert.equal(await page.locator('#update-progress-track').getAttribute('aria-valuenow'),null);assert.equal(await page.locator('#plugin-update-dialog').getAttribute('data-progress'),'unknown');
 await page.locator('#update-close').click();await page.evaluate(()=>{checkReady=true;});
 await page.locator('[data-card=context]').click();await page.locator('#plugin-menu-button').click();await page.locator('#check-update').click();
 await page.locator('#update-status').filter({hasText:'up to date'}).waitFor();
 assert.equal(await page.locator('#update-action').isVisible(),false);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({manualOnly:true,currentVersion:true,bilingual:true,plainTextNotes:true,installationPolling:true,reload:true,retry:true,pageErrors:errors}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
