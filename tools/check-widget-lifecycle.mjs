// Synthetic browser regression: retired widget callbacks must never remount.
// No native App processes, preferences, transcripts or usage ledgers are touched.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const repo=join(dirname(fileURLToPath(import.meta.url)),'..');
const extract=s=>s.slice(s.indexOf('module.exports = ')+17).trim().replace(/;$/,'');
const [i18n,theme,usage]=await Promise.all(['i18n','theme','usage-ui'].map(n=>readFile(join(repo,'compat',n+'.cjs'),'utf8')));
const widget=process.env.AG_PULSE_WIDGET_SOURCE?await readFile(process.env.AG_PULSE_WIDGET_SOURCE,'utf8'):
  process.argv.includes('--source-head')?execFileSync('git',['show','HEAD:compat/inline-widget.cjs'],{cwd:repo,encoding:'utf8'}):await readFile(join(repo,'compat/inline-widget.cjs'),'utf8');
const id='11111111-1111-1111-1111-111111111111';
const usageData={accountKey:'fixture',today:'2026-10-28',timeZone:'Asia/Shanghai',models:['Gemini'],days:[{date:'2026-10-28',models:{Gemini:{uncached:1000,cacheRead:3000,cacheWrite:0,output:200,total:4200,requests:1}}}],todayTokens:4200,weekTokens:4200,monthTokens:4200,totalTokens:4200,requests:1,firstDate:'2026-10-28',syncing:false,unknownRequests:0,partialRequests:0,unreadableFiles:0};
const html=`<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#17181a;color:#ddd;font:13px 'Segoe UI';padding:40px}.composer{width:980px;margin:220px auto 0;background:#27282a;padding:12px;border-radius:18px}.editor{height:48px}.actions{display:flex;align-items:center;gap:5px;height:32px}.left{display:flex;flex:none;min-width:0}.right{display:flex;gap:5px;margin-left:auto}button{background:transparent;border:0;color:inherit;height:28px;white-space:nowrap}
</style></head><body><section class="composer"><div class="editor" role="textbox" contenteditable="true"></div><div class="actions"><div class="left"><button id="native-add">＋</button><button data-testid="model-selector-trigger">Gemini</button></div><div class="right"><button id="native-mic" aria-label="Record voice memo">♩</button><button id="native-send" aria-label="Send message">➜</button></div></div></section><script>
history.replaceState({},'', '/c/${id}');window.__agPulseI18nFactory=(${extract(i18n)});window.__agPulseThemeFactory=(${extract(theme)});window.__agPulseUsageFactory=(${extract(usage)});window.fixtureFactory=(${extract(widget)});
window.fixtureReady=[];window.fixtureGeneration=0;window.fixtureCalls=[];window.nativeClicks=0;document.getElementById('native-send').onclick=()=>nativeClicks++;
window.fixtureHost=(generation,deferred=false)=>{
 const prefs={language:generation===0?'en':'zh-CN',languageGuideDismissed:true,usageGuideDismissed:true,revision:generation+1};
 const metrics={connection:'live',groups:[],usage:${JSON.stringify(usageData)},speed:{conversationId:'${id}',tps:100+generation,latestTps:100+generation,model:'Gemini',rounds:1,steps:1,measuredRequests:1,modelSeconds:2,toolSeconds:0,ttftSeconds:.2,counts:{responseOutput:200,thinkingOutput:0},cache:{hitRate:.75},tokens:{measuredRequests:1,totalTokens:4200,uncachedTokens:1000,cachedTokens:3000,cacheWriteTokens:0,outputTokens:200,inputRequests:1,outputRequests:1},context:{usedTokens:4000,maxTokens:100000,usedFraction:.04,remainingFraction:.96,model:'Gemini'}}};
 window.fixtureGeneration=generation;window.agPulseHost={getMetrics:async()=>{fixtureCalls.push(generation);return metrics;},getPreferences:()=>deferred?new Promise(resolve=>fixtureReady.push(()=>resolve(prefs))):Promise.resolve(prefs),setPreferences:async input=>Object.assign(prefs,input),report:()=>{}};
};
window.fixtureInstall=(generation,deferred=false)=>{fixtureHost(generation,deferred);fixtureFactory();};window.fixtureResolveOld=()=>{for(const resolve of fixtureReady.splice(0))resolve();};
</script></body></html>`;

const server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});res.end(html);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
let browser;
const results=[],errors=[];
async function settled(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
const count=page=>page.locator('[id="ag-pulse-status-bar"]').count();
async function verifyCurrent(page,generation){
 await settled(page);
 assert.equal(await count(page),1,'Exactly one live widget must remain after old async callbacks settle');
 const widget=page.locator('#ag-pulse-status-bar');
 await page.waitForFunction(g=>{const w=document.getElementById('ag-pulse-status-bar');return w?.lang==='zh-CN'&&w.shadowRoot.getElementById('tps').textContent===(100+g).toFixed(1);},generation,{timeout:5000});
 await widget.locator('[data-card=context]').click();await widget.locator('#context-card').waitFor({state:'visible'});
 assert.equal(await widget.locator('#context-percent').textContent(),'4%');await page.keyboard.press('Escape');
 await widget.locator('[data-card=cache]').click();await widget.locator('#cache-card').waitFor({state:'visible'});
 assert.equal(await widget.locator('#cache-rate').textContent(),'75.0%');
 assert.equal(await widget.locator('#usage-open-label').textContent(),'查看用量统计');
 await widget.locator('#open-usage').click();await widget.locator('#usage-dashboard').waitFor({state:'visible'});
 await page.keyboard.press('Escape');
 await page.locator('#native-send').click();assert.equal(await page.evaluate(()=>nativeClicks),1,'Native send must remain a functional control');
 assert.equal(await count(page),1);
}
try{
 browser=await chromium.launch(process.platform==='win32'&&!process.env.CI?{channel:'msedge',headless:true}:{headless:true});
 const base=`http://127.0.0.1:${server.address().port}`;
 for(const name of ['deferred-preferences','queued-layout-and-repeated-replacements','no-composer-retired-instance','orphan-recovery']){
  const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(base);
   if(name==='deferred-preferences'){
    await page.evaluate(()=>fixtureInstall(0,true));await page.locator('#ag-pulse-status-bar').waitFor();
    await page.evaluate(()=>{window.__agPulseDispose();fixtureInstall(1);fixtureResolveOld();});
    await verifyCurrent(page,1);
   }else if(name==='queued-layout-and-repeated-replacements'){
    await page.evaluate(()=>fixtureInstall(0,true));await page.locator('#ag-pulse-status-bar').waitFor();
    await page.evaluate(()=>{
     for(let g=1;g<=8;g++){window.dispatchEvent(new Event('resize'));window.__agPulseDispose();fixtureInstall(g,true);}
     window.dispatchEvent(new Event('resize'));window.__agPulseDispose();fixtureInstall(9);fixtureResolveOld();
    });
    await verifyCurrent(page,9);
   }else if(name==='no-composer-retired-instance'){
    await page.evaluate(()=>{document.querySelector('.composer').hidden=true;fixtureInstall(0,true);window.__agPulseDispose();document.querySelector('.composer').hidden=false;fixtureResolveOld();});
    await settled(page);assert.equal(await count(page),0,'Disposed instance must not remount when its first composer appears');
    await page.evaluate(()=>fixtureInstall(2));await verifyCurrent(page,2);
    await page.evaluate(()=>document.querySelector('.composer').hidden=true);await page.locator('#ag-pulse-status-bar').waitFor({state:'detached'});
    await page.evaluate(()=>document.querySelector('.composer').hidden=false);await settled(page);
    assert.equal(await count(page),1,'An active instance must recover normally when its composer returns');
   }else{
    await page.evaluate(()=>{
     for(let i=0;i<2;i++){const orphan=document.createElement('div');orphan.id='ag-pulse-status-bar';orphan.attachShadow({mode:'open'}).innerHTML='<div class="bar"><button class="chip" data-card="speed">old</button><button class="chip" data-card="cache">old</button><button class="chip" data-card="context">old</button></div>';document.querySelector('.actions').append(orphan);}
     const unrelated=document.createElement('div');unrelated.id='native-extra';unrelated.textContent='Native';document.querySelector('.actions').append(unrelated);fixtureInstall(3);
    });
    await verifyCurrent(page,3);assert.equal(await page.locator('#native-extra').count(),1,'Orphan cleanup must preserve unrelated host controls');
   }
   results.push({case:name,passed:true});
  }finally{await page.close();}
 }
 assert.deepEqual(errors,[],'Widget lifecycle must not produce uncaught page errors');
 console.log(JSON.stringify({source:process.argv.includes('--source-head')?'HEAD':'working-tree',results,errors},null,2));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
