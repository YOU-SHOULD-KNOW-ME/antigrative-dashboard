// Production renderer: composer ownership, route isolation and subagent layout.
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {trajectoryMetrics} from '../sidecars/panel/metrics.mjs';
const repo=join(dirname(fileURLToPath(import.meta.url)),'..');
const sources=await Promise.all(['i18n.cjs','theme.cjs','inline-widget.cjs'].map(f=>readFile(f==='inline-widget.cjs'&&process.env.AG_PULSE_SUBAGENT_SOURCE?process.env.AG_PULSE_SUBAGENT_SOURCE:join(repo,'compat',f),'utf8')));
const extract=s=>s.slice(s.indexOf('module.exports = ')+17).trim().replace(/;$/,'');
const install=`window.__agPulseI18nFactory=(${extract(sources[0])});window.__agPulseThemeFactory=(${extract(sources[1])});(${extract(sources[2])})();`;
const parent='11111111-1111-1111-1111-111111111111',child='22222222-2222-2222-2222-222222222222';
function sample(id){const sub=id===child;return {connection:'live',groups:[{id:'3p',name:'Claude / GPT',windows:{'5h':{available:true,remaining:.7},weekly:{available:true,remaining:.6}}}],speed:trajectoryMetrics({trajectory:{cascadeId:id,generatorMetadata:[{chatModel:{modelDisplayName:'Claude Sonnet',chatStartMetadata:{contextWindowMetadata:{estimatedTokensUsed:sub?12000:44000,maxContextTokens:100000}},usage:{inputTokens:400,cacheReadTokens:600,responseOutputTokens:sub?180:100,outputTokens:sub?180:100,apiProvider:'API_PROVIDER_GOOGLE_GEMINI'},streamingDuration:'2s'}}]}})};}
function composer(sub=true){return `<section class="composer" data-testid="agent-input-box"><div><div role="textbox" contenteditable="true" class="editor" aria-label="任意翻译"></div></div><div class="actions"><div class="left"><button class="protected">＋</button>${sub?'<div class="identity" title="任意语言"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/></svg><span>ui-layout-probe</span></div>':'<div><button data-testid="model-selector-trigger">Claude Sonnet</button></div>'}</div><div class="right"><button class="protected">○</button><button class="protected" data-testid="send-button" disabled>➜</button></div></div></section>`;}
const css=`body{margin:0;padding:20px;background:#14161b;color:#eee;font:14px sans-serif}.composer{padding:6px;max-width:850px;margin:60px auto;border:1px solid #444;border-radius:14px}.editor{height:60px}.actions,.left,.right{display:flex;align-items:center;gap:4px}.left{flex:1;min-width:0}.right{flex:none}.identity{display:flex;gap:4px;font-size:12px;white-space:nowrap;padding:4px 8px}.identity svg{width:14px;fill:none;stroke:currentColor}button{height:28px;background:none;border:0;color:inherit;white-space:nowrap}.protected{width:28px;flex:none}.decoy{position:fixed;right:20px;top:10px;display:flex;gap:6px}`;
const server=createServer((req,res)=>{
  if(req.url==='/widget.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(install);return;}
  const lang=req.url.includes('lang=en')?'en':'zh-CN';
  res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});
  res.end(`<!doctype html><style>${css}</style><div class="decoy"><button role="combobox" aria-haspopup="listbox">Uncommitted</button><button class="protected">⛶</button></div><main>${composer()}</main><script>
    history.replaceState({},'', '/c/${child}');window.samples=${JSON.stringify({[parent]:sample(parent),[child]:sample(child)})};window.markup=${JSON.stringify({parent:composer(false),child:composer()})};window.testRequests=[];window.testPending=[];window.testFailures=[];window.testHold=false;window.testWrong=false;
    window.agPulseHost={getMetrics:input=>{testRequests.push(input.conversationId);const result=structuredClone(samples[testWrong?'${parent}':input.conversationId]||{connection:'live',groups:[],speed:null});return testHold?new Promise((resolve,reject)=>{testPending.push(()=>resolve(result));testFailures.push(()=>reject(new Error('Old request failed')))}):Promise.resolve(result)},getPreferences:async()=>({language:'${lang}',languageGuideDismissed:true,revision:1}),setPreferences:async x=>({...x,revision:2}),report:()=>{}};
    window.switchConversation=(id,kind)=>{history.pushState({},'', '/c/'+id);document.querySelector('main').innerHTML=markup[kind]};
  </script><script src="/widget.js"></script>`);
});
server.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch(process.platform==='win32'&&!process.env.CI?{channel:'msedge',headless:true}:{headless:true});
const errors=[],results=[];
try{
 for(const lang of ['en','zh']){
  const page=await browser.newPage({viewport:{width:1100,height:800}});page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(`http://127.0.0.1:${server.address().port}/?lang=${lang}`);
   const strip=page.locator('#ag-pulse-status-bar');await strip.waitFor();
   await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar')?.shadowRoot.getElementById('tps').textContent==='90.0');
   assert.equal(await strip.getAttribute('data-scope'),'subagent');assert.equal(await strip.getAttribute('data-layout'),'ready');
   assert.equal(await strip.locator('#context-percent').textContent(),'12%');assert.equal(await strip.locator('#cache-rate').textContent(),'60.0%');
   assert.equal(await strip.evaluate(e=>e.parentElement.closest('[data-testid=agent-input-box]')!==null),true);
   await strip.locator('[data-card=context]').hover();await strip.locator('#context-card').waitFor({state:'visible'});
   assert.match(await strip.locator('#context-card .scope-note').textContent(),lang==='en'?/Current subagent/:/当前子代理/);
   assert.match(await strip.locator('#five-note').textContent(),lang==='en'?/Account quota/:/账号共享额度/);
   assert.ok((await strip.locator('.group-trigger').textContent()).includes('Claude / GPT'),'Quota group comes from child sampled model');
   await page.keyboard.press('Escape');
   for(const width of [700,500,370,1100]){
    await page.setViewportSize({width,height:800});await page.waitForTimeout(100);
    const state=await strip.evaluate(e=>{const r=e.getBoundingClientRect();return {state:e.dataset.layout,iconsOnly:e.classList.contains('icons-only'),safe:[...document.querySelectorAll('.protected')].every(b=>{const q=b.getBoundingClientRect();return !(Math.min(q.right,r.right)-Math.max(q.left,r.left)>1&&Math.min(q.bottom,r.bottom)-Math.max(q.top,r.top)>1)})};});
    assert.ok(state.state==='blocked'||state.safe,'Never cover host actions');
    if(width===370){assert.equal(state.iconsOnly,true);assert.equal(state.state,'ready',JSON.stringify(await strip.evaluate(e=>{const rect=x=>{const r=x.getBoundingClientRect();return [r.x,r.y,r.width,r.height]};return {node:rect(e),badge:rect(document.querySelector('.identity')),row:rect(e.parentElement),bar:rect(e.shadowRoot.querySelector('.bar')),scrollWidth:e.shadowRoot.querySelector('.bar').scrollWidth,controls:[...document.querySelectorAll('.protected')].map(rect)};})));assert.equal(await strip.locator('.chip:visible').count(),3);}
    if(width===1100)assert.equal(state.state,'ready');
   }
   // Real host labels wrap at hyphens and its SVGs are allowed to shrink.
   // No nowrap/min-width protection is supplied by the fixture here.
   await page.addStyleTag({content:'.identity{white-space:normal;min-width:0}.identity svg{width:14px;height:14px;flex-shrink:1}'});
   const nativeCases=[];
   for(const width of [1100,700,535,480,370,340,300,320,535,1100]){
    await page.setViewportSize({width,height:800});await page.waitForTimeout(120);
    const geometry=await strip.evaluate(e=>{
     const badge=document.querySelector('.identity'),label=badge.querySelector('span'),range=document.createRange();range.selectNodeContents(label);
     const lines=new Set([...range.getClientRects()].filter(r=>r.width>0).map(r=>Math.round(r.top)));
     return {lines:lines.size,iconWidth:badge.querySelector('svg').getBoundingClientRect().width,badgeHeight:badge.getBoundingClientRect().height,stripWidth:e.getBoundingClientRect().width,layout:e.dataset.layout,density:e.dataset.density};
    });
    assert.equal(geometry.lines,1,`Native subagent label wrapped at ${width}: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.iconWidth>=13.5,`Native badge icon shrank at ${width}: ${JSON.stringify(geometry)}`);
    if(width===300){assert.equal(geometry.layout,'blocked');assert.equal(geometry.stripWidth,0,'Hidden strip must release native flex space');}
    if(width===370){
     await mkdir(join(repo,'.data','issue6'),{recursive:true});
     await page.locator('.composer').screenshot({path:join(repo,'.data','issue6',`native-badge-fixed-${lang}.png`)});
    }
    nativeCases.push({width,...geometry});
   }
   assert.equal(nativeCases.at(-1).density,'full','Full statistics restore after closing sidebar');
   // A child request may finish after navigation. It cannot replace parent data.
   await page.evaluate(()=>{testHold=true;document.getElementById('ag-pulse-status-bar').shadowRoot.querySelector('.refresh').click()});
   await page.waitForFunction(()=>testPending.length>0);
   await page.evaluate(([id,kind])=>{testHold=false;switchConversation(id,kind)},[parent,'parent']);
   await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar')?.dataset.scope==='main');
   // The child request remains unresolved: the parent must refresh without
   // waiting for that promise or the previous route's 2.2s polling budget.
   await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar')?.shadowRoot.getElementById('tps').textContent==='50.0',{},{timeout:750});
   assert.equal(await page.evaluate(()=>testPending.length),1,'Old child request is still held');
   await page.evaluate(()=>testPending.splice(0).forEach(resolve=>resolve()));
   await page.waitForTimeout(50);
   assert.equal(await strip.locator('#tps').textContent(),'50.0','Late child result cannot overwrite parent');
   assert.equal(await strip.locator('#context-percent').textContent(),'44%');assert.equal(await strip.locator('.scope-note').first().isVisible(),false);
   await page.evaluate(([id,kind])=>switchConversation(id,kind),[child,'child']);
   await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar')?.shadowRoot.getElementById('tps').textContent==='90.0');
   assert.equal(await strip.locator('#context-percent').textContent(),'12%');assert.equal(await strip.count(),1);
   // A -> B -> A cannot accept a response from the first visit to A, even
   // though its conversation ID matches the current URL again.
   await page.evaluate(()=>{testHold=true;document.getElementById('ag-pulse-status-bar').shadowRoot.querySelector('.refresh').click()});
   await page.waitForFunction(()=>testPending.length>0);
   await page.evaluate(([id,kind])=>{testHold=false;switchConversation(id,kind)},[parent,'parent']);
   await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar')?.shadowRoot.getElementById('tps').textContent==='50.0',{},{timeout:750});
   await page.evaluate(([id,kind])=>{samples[id].speed.tps=120;switchConversation(id,kind)},[child,'child']);
   await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar')?.shadowRoot.getElementById('tps').textContent==='120.0',{},{timeout:750});
   await page.evaluate(()=>{testPending.splice(0).forEach(resolve=>resolve());testFailures=[]});
   await page.waitForTimeout(50);
   assert.equal(await strip.locator('#tps').textContent(),'120.0','Old same-ID response is still obsolete');
   // A late failure is also isolated: it cannot turn the new parent's live
   // connection stale or clear its own in-flight bookkeeping.
   await page.evaluate(()=>{testHold=true;document.getElementById('ag-pulse-status-bar').shadowRoot.querySelector('.refresh').click()});
   await page.waitForFunction(()=>testPending.length>0);
   await page.evaluate(([id,kind])=>{testHold=false;switchConversation(id,kind)},[parent,'parent']);
   await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar')?.shadowRoot.getElementById('tps').textContent==='50.0',{},{timeout:750});
   await page.evaluate(id=>{testFailures.splice(0).forEach(reject=>reject());testPending=[];samples[id].speed.tps=90},child);
   await page.waitForTimeout(50);
   assert.equal(await strip.locator('#dot').getAttribute('class'),'dot live');
   assert.equal(await strip.locator('#tps').textContent(),'50.0');
   await page.evaluate(([id,kind])=>switchConversation(id,kind),[child,'child']);
   await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar')?.shadowRoot.getElementById('tps').textContent==='90.0');
   // Even an incorrectly keyed backend response must not display parent values.
   await page.evaluate(()=>{testWrong=true;document.getElementById('ag-pulse-status-bar').shadowRoot.querySelector('.refresh').click()});
   await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar')?.shadowRoot.getElementById('tps').textContent==='—');
   assert.equal(await strip.locator('#context-percent').textContent(),'—');
   await page.evaluate(()=>{testWrong=false;document.getElementById('ag-pulse-status-bar').shadowRoot.querySelector('.refresh').click()});
   await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar')?.shadowRoot.getElementById('tps').textContent==='90.0');
   // Search editors / a missing send marker are not supported composers.
   await page.evaluate(()=>{document.querySelector('[data-testid=send-button]').removeAttribute('data-testid')});
   await strip.waitFor({state:'detached'});
   results.push({language:lang,subagentMetrics:true,scopedDetails:true,iconsOnly:true,nativeLabelSingleLine:true,nativeIconSizePreserved:true,hiddenSpaceReleased:true,nativeCases,routeIsolation:true,navigationDoesNotWaitForOldRequest:true,sameIdReturnIsolated:true,lateFailureIsolated:true,wrongResponseRejected:true,auxiliaryDecoyRejected:true});
  }finally{await page.close();}
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({cases:results,pageErrors:errors},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
