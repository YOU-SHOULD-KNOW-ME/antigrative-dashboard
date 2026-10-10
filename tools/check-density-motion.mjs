// Production renderer: motion continuity, interruption and native hit targets.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const repo=join(dirname(fileURLToPath(import.meta.url)),'..');
const sources=await Promise.all(['i18n.cjs','theme.cjs','inline-widget.cjs'].map(f=>readFile(f==='inline-widget.cjs'&&process.env.AG_PULSE_MOTION_SOURCE?process.env.AG_PULSE_MOTION_SOURCE:join(repo,'compat',f),'utf8')));
const extract=s=>s.slice(s.indexOf('module.exports = ')+17).trim().replace(/;$/,'');
const install=`window.__agPulseI18nFactory=(${extract(sources[0])});window.__agPulseThemeFactory=(${extract(sources[1])});(${extract(sources[2])})();`;
const id='11111111-1111-1111-1111-111111111111';
const metrics={connection:'live',groups:[],speed:{conversationId:id,tps:152,latestTps:152,rounds:5,steps:8,counts:{responseOutput:3040,thinkingOutput:0},cache:{hitRate:.32,totalTokens:105800,measuredRequests:5},context:{usedFraction:.1,remainingFraction:.9,usedTokens:25600,maxTokens:256000,model:'Gemini 3.8 Flash'}}};
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>响应式控件过渡预览</title><style>
body{margin:0;padding:36px;background:#161719;color:#e5e5e5;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}h1{font-size:22px;font-weight:500}p{color:#b0b0b0;line-height:1.8}.demo{max-width:800px}.composer{box-sizing:border-box;width:660px;max-width:100%;padding:12px;background:#202021;border:1px solid #333;border-radius:18px;margin:36px 0}.editor{height:40px;color:#999;outline:none}.actions{display:flex;align-items:center;gap:4px;height:32px;position:relative}.model-branch{display:flex;flex:1 1 180px;min-width:20px;max-width:180px;overflow:hidden}.model-branch button{width:100%;overflow:hidden;text-align:left;color:#9abada;text-overflow:clip}.controls{display:flex;flex:none;gap:8px;margin-left:auto}button{font:inherit;border:0;color:inherit;background:transparent;height:28px;border-radius:6px;white-space:nowrap;cursor:pointer}.protected{flex:none;width:28px;color:#aaa}.tools{display:flex;gap:12px;align-items:center;margin-top:24px}.tools button{padding:0 12px;background:#2c3036}.tools input{width:200px}.hint{font-size:12px}.status{font-variant-numeric:tabular-nums}
</style><main class="demo"><h1>完整数值 ⇄ 三图标</h1><p>调整宽度或点击按钮，观察数值淡出、图标收拢和模型名称淡入。<br>这页使用插件的真实控件代码，数据是演示数据。</p>
<section class="composer"><div class="editor" contenteditable="true" role="textbox">Ask anything, @ to mention, / for actions</div><div class="actions"><button class="protected" title="Add">＋</button><div class="model-branch" style="flex:1 1 180px;min-width:20px;max-width:180px;overflow:hidden"><button data-testid="model-selector-trigger">Gemini 3.8 Flash Medium ⌃</button></div><div class="controls"><button class="protected" title="Microphone">♩</button><button class="protected" title="Send">➜</button></div></div></section>
<div class="tools"><button id="full">展开数值</button><button id="icons">收起为图标</button><input id="width" aria-label="输入框宽度" type="range" min="280" max="780" value="660"><span id="width-value" class="status">660 px</span></div><p class="hint">可以快速连续切换。图标在过渡期间仍可点击，点击后展示真实详情卡。</p></main>
<script>history.replaceState({},'', '/c/${id}');window.agPulseHost={getMetrics:async()=>(${JSON.stringify(metrics)}),getPreferences:async()=>({language:'en',revision:1}),setPreferences:async x=>({...x,revision:2}),report:()=>{}};window.nativeClicks=0;document.querySelectorAll('.protected,[data-testid="model-selector-trigger"]').forEach(b=>b.onclick=()=>window.nativeClicks++);</script><script src="/widget.js"></script><script>
full.onclick=()=>{const w=document.getElementById('ag-pulse-status-bar');w.style.flex='0 0 auto';w.style.maxWidth='100%';document.querySelector('.composer').style.width='660px';width.value=660;document.getElementById('width-value').textContent='660 px';};
icons.onclick=()=>{const w=document.getElementById('ag-pulse-status-bar');w.style.flex='0 0 80px';w.style.maxWidth='80px';document.querySelector('.composer').style.width='480px';width.value=480;document.getElementById('width-value').textContent='480 px';};
width.oninput=()=>{document.querySelector('.composer').style.width=width.value+'px';const w=document.getElementById('ag-pulse-status-bar');w.style.flex='0 1 auto';w.style.maxWidth='100%';document.getElementById('width-value').textContent=width.value+' px';};
</script></html>`;
const preview=process.argv.includes('--preview');
const server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':req.url==='/widget.js'?'text/javascript':'text/html;charset=utf-8'});res.end(req.url==='/widget.js'?install:html);});
server.listen(preview?17908:0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
if(preview){console.log(`Motion preview: ${base}/`);await new Promise(()=>{});}
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch(process.platform==='win32'&&!process.env.CI?{channel:'msedge',headless:true}:{headless:true});
const errors=[],results=[];
const sample=()=>{
 const w=document.getElementById('ag-pulse-status-bar'),s=w.shadowRoot,stage=s.querySelector('.density-stage'),icon=stage?.querySelector('svg');
 const r=icon?.getBoundingClientRect();
 return {density:w.dataset.density,moving:w.dataset.motion==='density',stage:!!stage,icons:s.querySelectorAll('.bar .chip:not([hidden])').length,x:r?.x,transform:icon&&getComputedStyle(icon).transform,modelOpacity:Number(getComputedStyle(document.querySelector('[data-testid="model-selector-trigger"]')).opacity),inert:stage?.inert,aria:stage?.getAttribute('aria-hidden'),animations:[...s.querySelectorAll('*')].flatMap(e=>e.getAnimations()).length};
};
const mode=async(page,kind)=>{await page.evaluate(k=>document.getElementById(k).click(),kind);await page.waitForFunction(k=>document.getElementById('ag-pulse-status-bar')?.dataset.density===k,kind==='full'?'full':'icons');};
async function nativeSafe(page){
 assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.protected,[data-testid="model-selector-trigger"]')].every(e=>{const r=e.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===e||e.contains(hit)})),true,'Native hit targets stay usable throughout the animation');
 const geometry=await page.evaluate(()=>{const w=document.getElementById('ag-pulse-status-bar'),stage=w.shadowRoot.querySelector('.density-stage');if(!stage)return true;const a=stage.getBoundingClientRect();return [...document.querySelectorAll('.protected')].every(e=>{const b=e.getBoundingClientRect();return Math.min(a.right,b.right)-Math.max(a.left,b.left)<=1||Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)<=1;});});
 assert.equal(geometry,true,'Visual ribbon must never cover send, microphone or add');
}
try{
 for(const reducedMotion of ['no-preference','reduce']){
  const page=await browser.newPage({viewport:{width:1000,height:650},reducedMotion});page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(base);const strip=page.locator('#ag-pulse-status-bar');await strip.waitFor();await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar')?.shadowRoot.getElementById('tps').textContent==='152.0');
   await page.waitForTimeout(300);assert.equal((await page.evaluate(sample)).moving,false,'Initial mount should not animate');
   const hostStyle=await page.locator('.model-branch').getAttribute('style');
   // Recreate the user's full strip/caret layout before returning model space.
   await page.evaluate(()=>{const w=document.getElementById('ag-pulse-status-bar');w.style.flex='0 0 auto';document.querySelector('.composer').style.width='520px';});await page.waitForTimeout(300);
   assert.equal(await strip.getAttribute('data-density'),'full');
   await mode(page,'icons');const start=await page.evaluate(sample);
   assert.equal(start.moving,true,'Density change must have an actual in-flight animation');assert.equal(start.inert,true);assert.equal(start.aria,'true');assert.equal(start.icons,3);
   await nativeSafe(page);await page.waitForTimeout(45);const middle=await page.evaluate(sample);await nativeSafe(page);
   if(reducedMotion==='no-preference'){assert.notEqual(start.x,middle.x,'Icons must travel, not just disappear and reappear');assert.ok(middle.modelOpacity<1,'Model reveal must be eased instead of popping in');}
   else assert.equal(middle.transform,'matrix(1, 0, 0, 1, 0, 0)','Reduced motion keeps feedback without movement');
   await page.waitForTimeout(45);
   assert.equal(await strip.evaluate(e=>[...e.shadowRoot.querySelectorAll('.density-stage .density-piece:not(svg):not(.context-ring)')].every(p=>Number(getComputedStyle(p).opacity)<.02)),true,'Outgoing labels must remain faded after their short animation ends');
   // Reverse while the original move is in progress; compare presentation
   // geometry on each side of the actual mode change, not logical endpoints.
   const continuity=await page.evaluate(async()=>{
    const w=document.getElementById('ag-pulse-status-bar'),s=w.shadowRoot;
    const rect=()=>{const e=s.querySelector('.density-stage svg');return e?.getBoundingClientRect().x;};
    const before=rect();w.style.flex='0 0 auto';w.style.maxWidth='100%';document.querySelector('.composer').style.width='660px';
    await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);return {before,after:rect(),density:w.dataset.density};
   });assert.equal(continuity.density,'full');if(reducedMotion==='no-preference')assert.ok(Math.abs(continuity.after-continuity.before)<45,JSON.stringify(continuity));
   for(const kind of ['icons','full','icons','full']){await mode(page,kind);await nativeSafe(page);await page.waitForTimeout(25);}
   await page.waitForTimeout(350);assert.equal((await page.evaluate(sample)).stage,false,'No orphan snapshots after a rapid reversal');
   await page.waitForTimeout(1150);assert.equal((await page.evaluate(sample)).animations,0,'Metrics/heartbeat must not replay density motion');
   assert.equal(await page.locator('.model-branch').getAttribute('style'),hostStyle,'Native layout styles remain untouched');
   await mode(page,'icons');await strip.locator('[data-card="context"]').click();await strip.locator('#context-card').waitFor({state:'visible'});await page.keyboard.press('Escape');
   // Hard collision protection cancels motion immediately.
   await mode(page,'full');await page.evaluate(()=>{const w=document.getElementById('ag-pulse-status-bar');w.style.flex='0 0 40px';w.style.maxWidth='40px';});
   await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar').dataset.layout==='blocked');assert.equal((await page.evaluate(sample)).stage,false);
   await mode(page,'full');await mode(page,'icons');await page.evaluate(()=>window.__agPulseDispose());assert.equal(await page.locator('.density-stage').count(),0);assert.equal(await page.locator('.model-branch').getAttribute('style'),hostStyle);assert.equal(await page.locator('[data-testid="model-selector-trigger"]').evaluate(e=>e.getAnimations().length),0);
   // A resize drag keeps moving after crossing the density threshold. It must
   // not rebuild ghost layers or restart their clock on every pointer frame.
   await page.reload();await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar')?.shadowRoot.getElementById('tps').textContent==='152.0');
   await page.evaluate(()=>document.getElementById('full').click());await page.waitForTimeout(300);
   const drag=await page.evaluate(async()=>{
    const w=document.getElementById('ag-pulse-status-bar'),section=document.querySelector('.composer');
    let clones=0,stages=0,animations=0,classChanges=0;const intervals=[];
    const clone=Node.prototype.cloneNode,animate=Element.prototype.animate;
    Node.prototype.cloneNode=function(...args){clones++;return clone.apply(this,args);};
    Element.prototype.animate=function(...args){animations++;return animate.apply(this,args);};
    const observer=new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)if(n.classList?.contains('density-stage'))stages++;});observer.observe(w.shadowRoot,{childList:true});
    const classes=new MutationObserver(records=>classChanges+=records.length);classes.observe(w,{attributes:true,attributeFilter:['class']});
    let last=performance.now();
    try{
     w.style.flex='0 0 80px';w.style.maxWidth='80px';
     for(let i=0;i<75;i++){
      section.style.width=(480-i*1.5)+'px';section.style.marginLeft=(i*2.1)+'px';
      await new Promise(requestAnimationFrame);const now=performance.now();intervals.push(now-last);last=now;
      const motion=w.shadowRoot.querySelector('.density-stage');
      if(i>35&&motion)throw new Error('Animation clock was restarted while dragging in the same density: '+JSON.stringify({clones,stages,animations}));
      for(const b of document.querySelectorAll('.protected')){const r=b.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);if(hit!==b&&!b.contains(hit))throw new Error('Drag obscured a native control');}
     }
     // Stay narrow and shake within a few pixels: no density probes/animations.
     for(let i=0;i<20;i++){section.style.width=(368+(i%2)*2)+'px';await new Promise(requestAnimationFrame);}
     await new Promise(resolve=>setTimeout(resolve,280));
     return {clones,stages,animations,classChanges,remainingStages:w.shadowRoot.querySelectorAll('.density-stage').length,p95FrameMs:intervals.sort((a,b)=>a-b)[Math.floor(intervals.length*.95)]};
    }finally{observer.disconnect();classes.disconnect();Node.prototype.cloneNode=clone;Element.prototype.animate=animate;}
   });
   assert.equal(drag.remainingStages,0);assert.ok(drag.stages<=2,JSON.stringify(drag));assert.ok(drag.animations<=40,JSON.stringify(drag));assert.ok(drag.clones<=60,JSON.stringify(drag));assert.ok(drag.classChanges<=2,JSON.stringify(drag));
   const threshold=await page.evaluate(async()=>{
    const w=document.getElementById('ag-pulse-status-bar'),section=document.querySelector('.composer');
    const frame=async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);};
    w.style.flex='0 0 auto';w.style.maxWidth='100%';section.style.marginLeft='0';section.style.width='660px';await frame();
    let boundary=null;
    for(let width=640;width>=340;width-=20){section.style.width=width+'px';await frame();if(w.dataset.density==='icons'){boundary=width;break;}}
    if(boundary===null)throw new Error('No natural density boundary');
    let changes=0;const mo=new MutationObserver(r=>changes+=r.length);mo.observe(w,{attributes:true,attributeFilter:['class']});
    for(let i=0;i<12;i++){section.style.width=(boundary+(i%2)*4)+'px';await frame();if(w.dataset.density!=='icons')throw new Error('Density chatter near threshold');}
    mo.disconnect();section.style.width='740px';await frame();return {classChanges:changes,restored:w.dataset.density==='full'};
   });assert.equal(threshold.classChanges,0,JSON.stringify(threshold));assert.equal(threshold.restored,true);
   results.push({reducedMotion,continuity:true,threeIcons:true,nativeHitTargets:true,visualRibbonClipped:true,rapidReversal:true,noHeartbeatReplay:true,collisionCancels:true,disposeRestoresHost:true,continuousDrag:drag,threshold});
  }finally{await page.close();}
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({cases:results,pageErrors:errors},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

