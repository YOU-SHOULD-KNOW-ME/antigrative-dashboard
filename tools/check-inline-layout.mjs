// Exercise the production strip against hostile host geometry (issue #5).
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {trajectoryMetrics} from '../sidecars/panel/metrics.mjs';
const repo=join(dirname(fileURLToPath(import.meta.url)),'..');
const sources=await Promise.all(['i18n.cjs','theme.cjs','inline-widget.cjs'].map(f=>readFile(join(repo,'compat',f),'utf8')));
const extract=s=>s.slice(s.indexOf('module.exports = ')+17).trim().replace(/;$/,'');
const install=`window.__agPulseI18nFactory=(${extract(sources[0])});window.__agPulseThemeFactory=(${extract(sources[1])});(${extract(sources[2])})();`;
const id='11111111-1111-1111-1111-111111111111';
const metrics={connection:'live',groups:[],speed:trajectoryMetrics({trajectory:{cascadeId:id,generatorMetadata:[{chatModel:{modelDisplayName:'Claude Sonnet',chatStartMetadata:{contextWindowMetadata:{estimatedTokensUsed:112000,maxContextTokens:256000}},usage:{inputTokens:162000,responseOutputTokens:1381,outputTokens:1381,cacheReadTokens:838000,apiProvider:'API_PROVIDER_GOOGLE_GEMINI'},streamingDuration:'2s'}}]}})};
const editor='<div class="editor" contenteditable="true" role="textbox"></div>';
const model='<div class="model-branch" style="flex:0 0 auto;min-width:123px"><button data-testid="model-selector-trigger">Claude Sonnet</button></div>';
const controls='<div class="controls"><button class="protected">＋</button><button class="protected">⛶</button><button class="protected">×</button></div>';
const fixtures={
  composer:`<section class="composer">${editor}<div class="actions">${model}${controls}</div></section>`,
  titlebar:`<section class="agent-shell"><header class="actions">${model}${controls}</header><main>${editor}</main></section>`,
  'adjacent-titlebar':`<section class="composer"><header class="actions">${model}${controls}</header>${editor}</section>`,
  'distant-toolbar':`<section class="agent-shell"><div class="actions">${model}${controls}</div><main>${editor}</main></section>`,
  'nonflex-toolbar':`<section class="composer">${editor}<div class="actions nonflex">${model}${controls}</div></section>`,
  // Real Subagent view has no model selector. Its auxiliary pane's git-filter
  // combobox must never become the model fallback or the strip's mount anchor.
  'subagent-auxiliary-combobox':`<div style="display:flex;height:600px"><main style="flex:1;display:flex;flex-direction:column;justify-content:flex-end">${editor}</main><aside style="display:flex;flex-direction:column;width:447px"><div class="actions">${controls}</div><div style="flex:1"><button role="combobox" aria-haspopup="listbox">Uncommitted</button></div></aside></div>`,
};
const css=`body{margin:0;background:#15171c;color:#eee;font:14px sans-serif;padding:24px}.composer{margin:40px auto;max-width:880px;padding:12px;border:1px solid #444;border-radius:12px}.editor{height:64px;outline:none}.actions{display:flex;align-items:center;gap:8px;position:relative;height:32px}.model-branch{display:flex}.controls{display:flex;flex:none;margin-left:auto;gap:6px}.protected{width:28px;flex:none}.reserved{flex:1}.nonflex{display:block}.agent-shell{height:500px}.agent-shell main{padding-top:360px}button{height:28px;white-space:nowrap;background:#252932;border:0;color:inherit;border-radius:4px}`;
const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/widget.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(install);return;}
  const key=url.pathname.slice(1);
  if(!fixtures[key]){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});
  res.end(`<!doctype html><style>${css}</style>${fixtures[key]}<script>history.replaceState({},'', '/c/${id}');window.clicks=0;document.querySelectorAll('.protected').forEach(e=>e.onclick=()=>window.clicks++);window.agPulseHost={getMetrics:async()=>(${JSON.stringify(metrics)}),getPreferences:async()=>({language:'${url.searchParams.get('lang')==='en'?'en':'zh-CN'}',languageGuideDismissed:true,revision:1}),setPreferences:async x=>({...x,revision:2}),report:()=>{}};</script><script src="/widget.js"></script>`);
});
server.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch(process.platform==='win32'&&!process.env.CI?{channel:'msedge',headless:true}:{headless:true});
const errors=[],results=[];
const base=`http://127.0.0.1:${server.address().port}`;
async function clickable(page){
  // Physical clicks and hit tests detect paint/interception, not only CSS claims.
  for(const control of await page.locator('.protected').all()){
    assert.equal(await control.evaluate(e=>{const r=e.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===e;}),true,'Host control hit target must remain intact');
    await control.click({timeout:2000});
  }
}
try{
  for(const key of ['titlebar','adjacent-titlebar','distant-toolbar','nonflex-toolbar','subagent-auxiliary-combobox']){
    const page=await browser.newPage({viewport:{width:1100,height:800}});page.on('pageerror',e=>errors.push(e.message));
    try{await page.goto(`${base}/${key}`);await page.waitForTimeout(1150);assert.equal(await page.locator('#ag-pulse-status-bar').count(),0,`${key}: unsupported toolbar must decline mounting`);await clickable(page);results.push({case:key,rejected:true});}finally{await page.close();}
  }
  for(const lang of ['en','zh']){
    const page=await browser.newPage({viewport:{width:1100,height:800}});page.on('pageerror',e=>errors.push(e.message));
    try{
      await page.goto(`${base}/composer?lang=${lang}`);
      const strip=page.locator('#ag-pulse-status-bar');await strip.waitFor();
      await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar')?.shadowRoot.getElementById('tps').textContent!=='—');
      assert.match(await strip.locator('#cache-rate').textContent(),/83\.8%/,'Use real-size cached token statistics, not placeholder widths');
      const original='flex:0 0 auto;min-width:123px';
      assert.equal(await page.locator('.model-branch').getAttribute('style'),original,'Mount must preserve the original host styles');
      for(const width of [1100,700,450,300,1100]){
        await page.setViewportSize({width,height:800});
        await page.waitForTimeout(100);
        await clickable(page);
        const state=await strip.evaluate(e=>{const bar=e.shadowRoot.querySelector('.bar'),r=e.getBoundingClientRect();return {blocked:e.dataset.layout==='blocked',fits:bar.scrollWidth<=bar.clientWidth+2,contained:r.x>=0&&r.right<=innerWidth};});
        assert.ok(state.blocked||(state.fits&&state.contained),`No overflowing interactive strip at width ${width}`);
        if(width===1100)assert.equal(state.blocked,false,'Restore strip when space returns');
      }
      // All three icons remain interactive before the strip is allowed to
      // disappear. Pin its available space so host flex variations cannot make
      // this test accidentally exercise a different density.
      await strip.evaluate(e=>{e.style.flex='0 0 80px';e.style.maxWidth='80px'});
      await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar')?.dataset.density==='icons');
      assert.equal(await strip.getAttribute('data-layout'),'ready');
      assert.equal(await strip.locator('.chip:visible').count(),3);
      assert.equal(await strip.locator('#language-toggle').count(),0);
      assert.equal(await strip.locator('#tps').isVisible(),false);
      for(const name of ['speed','cache','context']){
        const chip=strip.locator(`[data-card=${name}]`);assert.ok(await chip.getAttribute('aria-label'));
        await chip.click();await strip.locator(`#${name}-card`).waitFor({state:'visible'});await page.keyboard.press('Escape');
      }
      await strip.locator('[data-card=context]').click();
      const oldLanguage=await strip.getAttribute('lang');
      await strip.locator(oldLanguage==='en'?'#card-language-zh':'#card-language-en').click();
      await page.waitForFunction(old=>document.getElementById('ag-pulse-status-bar')?.lang!==old,oldLanguage);
      await strip.locator(oldLanguage==='en'?'#card-language-en':'#card-language-zh').click();
      await page.waitForFunction(old=>document.getElementById('ag-pulse-status-bar')?.lang===old,oldLanguage);
      await page.keyboard.press('Escape');
      await strip.evaluate(e=>{e.style.flex='0 0 40px';e.style.maxWidth='40px'});
      await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar')?.dataset.layout==='blocked');
      await clickable(page);
      await strip.evaluate(e=>{e.style.flex='0 1 auto';e.style.maxWidth='100%'});
      await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar')?.dataset.layout==='ready'&&document.getElementById('ag-pulse-status-bar')?.dataset.density==='full');
      // Message controls can scroll underneath a fixed composer. Their raw
      // rectangles overlap the strip, but the composer covers their paint.
      await page.evaluate(()=>{
        const section=document.querySelector('.composer');section.style.cssText='position:fixed;bottom:20px;left:24px;right:24px;margin:0;background:#15171c;z-index:2';
        const messages=document.createElement('div');messages.id='scroll-messages';messages.style.cssText='position:fixed;inset:0;overflow:auto;z-index:1';
        messages.innerHTML='<div style="height:2000px"></div><a id="covered-message-action" href="#" style="position:absolute;width:160px;height:28px">Message action</a>';
        document.body.prepend(messages);
        const r=document.getElementById('ag-pulse-status-bar').getBoundingClientRect(),a=messages.querySelector('a');a.style.left=r.left+'px';a.style.top=(r.top+80)+'px';
      });
      for(const scrollTop of [0,80,0,80,120,80]){
        await page.evaluate(y=>document.getElementById('scroll-messages').scrollTop=y,scrollTop);
        await page.waitForTimeout(80);
        assert.equal(await strip.getAttribute('data-layout'),'ready','Covered message buttons must not hide the strip during scroll');
      }
      // An actually painted external overlay must still trigger protection.
      await page.evaluate(()=>{
        const r=document.getElementById('ag-pulse-status-bar').getBoundingClientRect();const b=document.createElement('button');b.id='floating-host-action';
        b.style.cssText=`position:fixed;left:${r.left}px;top:${r.top}px;width:80px;height:28px;z-index:5`;b.textContent='Floating action';document.body.append(b);
      });
      await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar')?.dataset.layout==='blocked');
      await page.locator('#floating-host-action').click();
      await page.evaluate(()=>{document.getElementById('floating-host-action').remove();document.getElementById('scroll-messages').remove();document.querySelector('.composer').removeAttribute('style')});
      await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar')?.dataset.layout==='ready');
      // New absolutely positioned host controls must dismiss a currently open card.
      await strip.locator('[data-card=context]').hover();await strip.locator('#context-card').waitFor({state:'visible'});
      await page.evaluate(()=>{const controls=document.querySelector('.controls'),strip=document.getElementById('ag-pulse-status-bar');const r=strip.getBoundingClientRect(),row=strip.parentElement.getBoundingClientRect();controls.style.cssText=`position:absolute;left:${r.x-row.x+8}px;top:0`;});
      await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar')?.dataset.layout==='blocked');
      assert.equal(await strip.locator('#context-card').isVisible(),false);await clickable(page);
      await page.evaluate(()=>document.querySelector('.controls').removeAttribute('style'));
      await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar')?.dataset.layout==='ready');
      assert.equal(await page.locator('.model-branch').getAttribute('style'),original,'Never mutate host model branch styles');
      // Reparent into a header, then recover in a valid composer without duplicates.
      await page.evaluate(()=>{const section=document.querySelector('.composer');section.className='agent-shell';section.querySelector('.editor').style.marginTop='360px';});
      await strip.waitFor({state:'detached'});
      await page.evaluate(()=>{const section=document.querySelector('.agent-shell');section.className='composer';section.querySelector('.editor').style.marginTop='';});
      await strip.waitFor();assert.equal(await strip.count(),1);await clickable(page);
      if(process.env.AG_PULSE_LAYOUT_SCREENSHOTS){const dir=join(repo,'.data','issue5');await mkdir(dir,{recursive:true});await page.screenshot({path:join(dir,`composer-${lang}.png`)});}
      await page.evaluate(()=>window.__agPulseDispose());assert.equal(await strip.count(),0);assert.equal(await page.locator('.model-branch').getAttribute('style'),original);
      results.push({case:`responsive-${lang}`,widths:[1100,700,450,300],threeIconFallback:true,iconsInteractive:true,languageAccessible:true,coveredScrollControlsIgnored:true,paintedOverlayProtected:true,collisionRecovery:true,hostStylesPreserved:true});
    }finally{await page.close();}
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({cases:results,pageErrors:errors},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
