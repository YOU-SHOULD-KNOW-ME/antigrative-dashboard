// Synthetic fixtures only: no test values are written to the user's ledger.
import {readFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const repo=join(dirname(fileURLToPath(import.meta.url)),'..'),files=['compat/i18n.cjs','compat/theme.cjs','compat/inline-widget.cjs','compat/usage-ui.cjs'];
const ide=process.argv.includes('--ide');
const sources=await Promise.all(files.map(f=>readFile(join(repo,f),'utf8')));
const extract=s=>s.slice(s.indexOf('module.exports = ')+17).trim().replace(/;$/,'');
const surface=ide?await readFile(join(repo,'ide/surface.cjs'),'utf8'):null;
const models=['Gemini 3.8 Flash','Gemini 3.8 Pro','Claude Sonnet','Claude Opus','GPT 5.4'];
const days=Array.from({length:120},(_,i)=>{const d=new Date('2026-06-14T00:00:00Z');d.setUTCDate(d.getUTCDate()+i);return {date:d.toISOString().slice(0,10),models:Object.fromEntries(models.map((m,j)=>{const n=(i*17+j*3)%11*1200;return [m,{uncached:n,cacheRead:n*2,cacheWrite:0,output:n,total:n*4,requests:n?1:0}];}))};});
days.unshift({date:'2024-11-01',models:{[models[0]]:{uncached:100,cacheRead:0,cacheWrite:0,output:20,total:120,requests:1}}});
const fixture={accountKey:'fixture',today:'2026-10-11',timeZone:'Asia/Shanghai',models,days,todayTokens:45000,weekTokens:400000,monthTokens:700000,totalTokens:6000000,requests:500,firstDate:days[0].date,syncing:false,unknownRequests:0,partialRequests:0,unreadableFiles:0};
const html=`<!doctype html><html><head><meta charset="utf-8">${ide?`<meta http-equiv="Content-Security-Policy" content="script-src 'unsafe-inline'; style-src 'unsafe-inline'; require-trusted-types-for 'script'; trusted-types 'none'">`:''}<style>body{margin:0;background:#17181a;color:#ddd;font:13px 'Segoe UI';padding:50px}.rounded-composer{max-width:900px;margin:300px auto 0;background:#27282a;padding:12px;border-radius:18px}.editor{height:45px}.actions{display:flex;align-items:center;gap:5px}.left{display:flex;flex:1;min-width:0}.right{display:flex;gap:5px}button{background:transparent;border:0;color:inherit;height:28px}</style></head><body>${ide?'<div class="antigravity-agent-side-panel"><div id="conversation" role="region"><div data-testid="conversation-view" data-cascade-id="11111111-1111-1111-1111-111111111111"></div>':''}<div class="rounded-composer" ${ide?'id="antigravity.agentSidePanelInputBox"':''}><div class="editor" contenteditable="true" role="combobox" aria-label="Message input"></div><div class="actions"><div class="left"><button aria-label="Add context">＋</button><button data-testid="model-selector-trigger">Gemini 3.8 Flash</button></div><div class="right"><button aria-label="Record voice memo">♩</button><button aria-label="Send message">➜</button></div></div></div>${ide?'</div></div>':''}<script>
history.replaceState({},'', '/c/11111111-1111-1111-1111-111111111111');window.testData=${JSON.stringify(fixture)};window.testPrefs={language:'zh-CN',languageGuideDismissed:true,revision:1};
window.agPulseHost={getMetrics:async()=>({connection:'live',usage:testData,preferences:testPrefs,groups:[],speed:null}),getPreferences:async()=>testPrefs,setPreferences:async x=>{if(window.failGuideSave&&x.usageGuideDismissed)throw Error('Fixture save failure');return testPrefs={...testPrefs,...x,revision:testPrefs.revision+1};}};
${ide?`window.__agPulseSurface=(${extract(surface)})();`:''}window.__agPulseI18nFactory=(${extract(sources[0])});window.__agPulseThemeFactory=(${extract(sources[1])});window.__agPulseUsageFactory=(${extract(sources[3])});(${extract(sources[2])})();
</script></body></html>`;
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);});server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright'),browser=await chromium.launch(process.platform==='win32'&&!process.env.CI?{channel:'msedge',headless:true}:{headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
const screenshot=page.screenshot.bind(page);page.screenshot=options=>screenshot({...options,path:ide?options.path.replace('fixture-','ide-fixture-'):options.path});
await mkdir(join(repo,'.data/usage'),{recursive:true});
try{
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 // Navigation can briefly leave no discoverable composer while usage is
 // closed. Its restored entry must still own a functional, localized dialog.
 await page.locator('#usage-dashboard').waitFor({state:'attached'});
 await page.evaluate(()=>document.querySelector('.rounded-composer').style.display='none');
 await page.locator('#ag-pulse-status-bar').waitFor({state:'detached'});
 await page.evaluate(()=>document.querySelector('.rounded-composer').style.display='');
 await page.locator('[data-card=cache]').waitFor({state:'visible'});
 assert.equal(await page.locator('#usage-dashboard').count(),1,'Restored composer must recreate the usage controller');
 for(const [choice,label,title] of [['en','View token usage','Token usage'],['zh','查看用量统计','用量统计']]){
  await page.locator('[data-card=context]').click();await page.locator(`#card-language-${choice}`).click();
  await page.waitForFunction(label=>document.getElementById('ag-pulse-status-bar').shadowRoot.getElementById('usage-open-label').textContent===label,label);
  await page.locator('[data-card=cache]').click();await page.locator('#open-usage').click();
  assert.equal(await page.locator('#usage-dashboard').evaluate(n=>n.open),true);
  assert.equal(await page.locator('#title').textContent(),title);
  await page.locator('#usage-dashboard #close').click();
 }
 await page.locator('[data-card=cache]').click();await page.locator('#open-usage').click();assert.equal(await page.locator('#usage-dashboard').evaluate(n=>n.open),true);
 assert.equal(await page.locator('.usage-summary>div').count(),2,'Desktop and IDE share the two-column usage entry');
 assert.deepEqual(await page.locator('.usage-unit').allTextContents(),['Token','Token']);
 assert.equal(await page.locator('#cache-card').evaluate(n=>n.hidden),true);assert.equal(await page.locator('#title').textContent(),'用量统计');
 assert.ok((await page.locator('#subtitle').textContent()).includes(ide?'Antigravity IDE':'Antigravity'));
 assert.equal(await page.locator('#usage-intro').isVisible(),true,'First use explains local data before acknowledgment');
 assert.ok((await page.locator('#usage-intro-history').textContent()).includes('本地历史对话'));
 await page.locator('#locale').click();await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar').shadowRoot.getElementById('usage-dashboard').firstElementChild.shadowRoot.getElementById('usage-intro-title').textContent==='About your token usage');
 await page.screenshot({path:join(repo,'.data/usage/fixture-intro-en.png')});
 await page.locator('#locale').click();await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar').shadowRoot.getElementById('usage-dashboard').firstElementChild.shadowRoot.getElementById('usage-intro-title').textContent==='先了解你的用量统计');
 await page.screenshot({path:join(repo,'.data/usage/fixture-intro-zh.png')});
 await page.locator('#usage-dashboard #close').click();await page.locator('[data-card=cache]').click();await page.locator('#open-usage').click();assert.equal(await page.locator('#usage-intro').isVisible(),true,'Closing without acknowledgment keeps the introduction');
 await page.evaluate(()=>window.failGuideSave=true);await page.locator('#usage-intro-done').click();await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar').shadowRoot.getElementById('usage-dashboard').firstElementChild.shadowRoot.getElementById('usage-intro-error').textContent.length>0);
 assert.equal(await page.locator('#usage-intro').isVisible(),true);assert.notEqual(await page.evaluate(()=>testPrefs.usageGuideDismissed),true);
 await page.evaluate(()=>window.failGuideSave=false);await page.locator('#usage-intro-done').click();await page.waitForFunction(()=>testPrefs.usageGuideDismissed===true);assert.equal(await page.locator('#usage-intro').isVisible(),false);
 await page.evaluate(`window.__agPulseDispose();(${extract(sources[2])})();`);await page.locator('[data-card=cache]').click();await page.locator('#open-usage').click();assert.equal(await page.locator('#usage-intro').isVisible(),false,'A fresh renderer restores onboarding completion');
 // Pointer dismissal restores the chip's focus without pinning its hover
 // card. Keyboard dismissal must still return an operable keyboard focus.
 await page.locator('#usage-dashboard #close').click();await page.mouse.move(80,80);await page.waitForTimeout(450);
 assert.equal(await page.locator('#cache-card').evaluate(n=>n.hidden),true,'Pointer modal close must not reopen/pin the hover card');
 await page.locator('[data-card=cache]').hover();await page.waitForTimeout(350);assert.equal(await page.locator('#cache-card').evaluate(n=>n.hidden),false);
 await page.mouse.move(80,80);await page.waitForTimeout(450);assert.equal(await page.locator('#cache-card').evaluate(n=>n.hidden),true,'Hover must auto-dismiss after returning from usage');
 await page.locator('[data-card=cache]').click();await page.mouse.move(80,80);await page.waitForTimeout(450);assert.equal(await page.locator('#cache-card').evaluate(n=>n.hidden),true,'Pointer-focused chip must not pin the card');
 await page.keyboard.press('Tab');await page.locator('[data-card=cache]').focus();
 assert.equal(await page.locator('[data-card=cache]').evaluate(n=>n.matches(':focus-visible')),true);
 assert.equal(await page.locator('#cache-card').evaluate(n=>n.hidden),false,'Keyboard focus opens the card');
 await page.locator('#open-usage').focus();await page.keyboard.press('Enter');await page.keyboard.press('Escape');await page.waitForTimeout(450);
 assert.equal(await page.locator('[data-card=cache]').evaluate(n=>n.getRootNode().activeElement===n&&n.matches(':focus-visible')),true,'Escape restores keyboard focus');
 assert.equal(await page.locator('#cache-card').evaluate(n=>n.hidden),false,'Keyboard-returned card remains operable');
 await page.locator('.editor').click();await page.waitForTimeout(450);assert.equal(await page.locator('#cache-card').evaluate(n=>n.hidden),true,'Leaving keyboard focus dismisses the card');
 await page.locator('[data-card=cache]').click();await page.locator('#open-usage').click();
 // The dashboard is account-level: underlying composer visibility or a
 // temporary missing snapshot must not close it or retain stale account data.
 await page.evaluate(()=>{document.getElementById('ag-pulse-status-bar').dataset.layout='blocked';document.querySelector('.editor').style.visibility='hidden';});await page.waitForTimeout(1200);
 assert.equal(await page.locator('#usage-dashboard').evaluate(n=>n.open&&getComputedStyle(n).visibility==='visible'),true);
 await page.evaluate(()=>document.querySelector('.rounded-composer').style.display='none');await page.waitForTimeout(1200);
 assert.equal(await page.locator('#usage-dashboard').evaluate(n=>n.open&&n.matches(':popover-open')&&n.getBoundingClientRect().height>100),true,'Hidden composer ancestors must not hide account usage');
 await page.evaluate(()=>document.querySelector('.rounded-composer').style.display='');
 await page.evaluate(()=>{document.querySelector('.editor').style.visibility='';document.getElementById('ag-pulse-status-bar').dataset.layout='ready';const original=agPulseHost.getMetrics;window.restoreUsageMetrics=original;agPulseHost.getMetrics=async input=>({...await original(input),usage:null});});
 await page.waitForFunction(()=>!document.getElementById('ag-pulse-status-bar').shadowRoot.getElementById('usage-dashboard').firstElementChild.shadowRoot.getElementById('usage-waiting').hidden);
 assert.equal(await page.locator('#usage-dashboard').evaluate(n=>n.open),true);assert.equal(await page.locator('#overview').isVisible(),false);assert.equal(await page.locator('#totals .value').first().textContent(),'—');
 await page.evaluate(()=>{agPulseHost.getMetrics=restoreUsageMetrics;});await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar').shadowRoot.getElementById('usage-dashboard').firstElementChild.shadowRoot.getElementById('usage-waiting').hidden);
 assert.equal(await page.locator('#usage-dashboard').evaluate(n=>n.open),true);
 // A replaced composer must preserve the same account usage dialog and its
 // top-layer membership; closing it must restore the strip to the new input.
 await page.evaluate(()=>{const old=document.querySelector('.rounded-composer'),replacement=old.cloneNode(true);replacement.querySelector('#ag-pulse-status-bar')?.remove();window.savedUsageDialog=document.getElementById('ag-pulse-status-bar').shadowRoot.getElementById('usage-dashboard');old.replaceWith(replacement);});
 await page.waitForFunction(()=>savedUsageDialog.isConnected&&savedUsageDialog.matches(':popover-open'));
 assert.equal(await page.locator('#usage-dashboard').evaluate(n=>n===savedUsageDialog&&n.open&&getComputedStyle(n).visibility==='visible'),true);
 const actionGeometry=await page.locator('#usage-dashboard .actions button').evaluateAll(buttons=>buttons.map(b=>{const r=b.getBoundingClientRect(),i=b.firstElementChild.getBoundingClientRect();return {width:r.width,height:r.height,y:r.y,iconWidth:i.width,iconHeight:i.height,offsetX:(i.left+i.width/2)-(r.left+r.width/2),offsetY:(i.top+i.height/2)-(r.top+r.height/2)};}));
 assert.equal(new Set(actionGeometry.map(b=>b.y)).size,1);for(const b of actionGeometry){assert.equal(b.width,32);assert.equal(b.height,32);assert.equal(b.iconHeight,16);assert.equal(b.offsetX,0);assert.equal(b.offsetY,0);}
 // Manual refresh must queue behind an automatic poll, then force a fresh
 // request. An instant success must still leave a visible rotation.
 await page.evaluate(()=>{const original=agPulseHost.getMetrics;window.refreshCalls=[];window.holdAuto=true;agPulseHost.getMetrics=async input=>{refreshCalls.push({force:input.force});if(holdAuto&&!input.force){holdAuto=false;await new Promise(resolve=>window.releaseAuto=resolve);}return original(input);};});
 await page.waitForFunction(()=>typeof window.releaseAuto==='function');await page.locator('#usage-dashboard #refresh').click();
 assert.equal(await page.locator('#usage-dashboard #refresh').getAttribute('aria-busy'),'true');assert.equal(await page.evaluate(()=>refreshCalls.filter(c=>c.force).length),0);
 await page.evaluate(()=>releaseAuto());await page.waitForFunction(()=>refreshCalls.some(c=>c.force));await page.waitForFunction(()=>!document.getElementById('ag-pulse-status-bar').shadowRoot.getElementById('usage-dashboard').firstElementChild.shadowRoot.getElementById('refresh').disabled);
 assert.equal(await page.evaluate(()=>refreshCalls.filter(c=>c.force).length),1);
 await page.locator('#usage-dashboard #refresh').click();await page.waitForTimeout(100);assert.equal(await page.locator('#usage-dashboard #refresh').evaluate(n=>n.disabled&&n.querySelector('svg').getAnimations().length===1),true);
 await page.waitForFunction(()=>!document.getElementById('ag-pulse-status-bar').shadowRoot.getElementById('usage-dashboard').firstElementChild.shadowRoot.getElementById('refresh').disabled);
 const frame=()=>page.locator('#usage-dashboard').evaluate(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};});const initialFrame=await frame();
 await page.locator('#year').click();assert.equal(await page.locator('#year').getAttribute('aria-expanded'),'true');assert.equal(await page.locator('#year-menu [role=option]').count(),3);
 await page.waitForTimeout(180);await page.screenshot({path:join(repo,'.data/usage/fixture-year-dark.png')});
 await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');assert.equal(await page.locator('#year-label').textContent(),'2025');assert.ok((await page.locator('#heat-summary').textContent()).includes('2025'));assert.equal(await page.locator('#year').getAttribute('aria-expanded'),'false');
 await page.locator('#year').focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Home');await page.keyboard.press('Enter');assert.equal(await page.locator('#year-label').textContent(),'2026');
 await page.locator('#year').click();await page.keyboard.press('Escape');assert.equal(await page.locator('#year').getAttribute('aria-expanded'),'false');assert.equal(await page.locator('#usage-dashboard').evaluate(n=>n.open),true);
 await page.locator('#year').click();await page.locator('#activity-title').click();assert.equal(await page.locator('#year').getAttribute('aria-expanded'),'false');
 await page.locator('#year').click();await page.keyboard.press('Tab');assert.equal(await page.locator('#year').getAttribute('aria-expanded'),'false');assert.equal(await page.locator('#usage-dashboard').evaluate(n=>n.open),true);
 assert.ok(await page.locator('#heat button').count()>360);assert.equal(await page.locator('#heat button[tabindex="0"]').count(),1);
 await page.locator('#heat button[tabindex="0"]').focus();await page.keyboard.press('ArrowUp');
 await page.screenshot({path:join(repo,'.data/usage/fixture-overview.png')});
 await page.locator('[data-heat=week]').click();assert.ok((await page.locator('#heat button').count())>=52);const rows=await page.locator('#heat').evaluate(n=>new Set([...n.children].map(c=>Math.round(c.getBoundingClientRect().top))).size);assert.equal(rows,2);
 await page.locator('#details-tab').click();assert.equal(await page.locator('.bar-column').count(),31);assert.equal(await page.locator('#legend button').count(),5);
 assert.deepEqual(await frame(),initialFrame,'Overview and details share a stable modal frame');
 const chartFrame=()=>page.locator('.chart').evaluate(n=>{const r=n.getBoundingClientRect();return {x:r.x,width:r.width};}),initialChart=await chartFrame();
 for(let i=0;i<5;i++)await page.locator('#previous').click();assert.equal(await page.locator('#table-body tr').count(),0);assert.deepEqual(await frame(),initialFrame,'Empty months must not shrink/recenter the window');assert.deepEqual(await chartFrame(),initialChart,'Scrollbar changes must not move the chart');
 for(let i=0;i<5;i++)await page.locator('#next').click();assert.deepEqual(await frame(),initialFrame);
 const colors=await page.locator('#legend .dot').evaluateAll(ns=>ns.map(n=>getComputedStyle(n).backgroundColor));assert.equal(new Set(colors).size,5);
 await page.locator('[data-period=week]').click();assert.equal(await page.locator('.bar-column').count(),12);await page.locator('[data-period=month]').click();assert.equal(await page.locator('.bar-column').count(),12);
 assert.deepEqual(await frame(),initialFrame,'Day/week/month changes must preserve the window frame');
 const multistack=page.locator('.stack').filter({has:page.locator('.bar-segment')}).last();
 const stackGeometry=await multistack.evaluate(n=>({gap:parseFloat(getComputedStyle(n).gap),height:n.getBoundingClientRect().height,segments:[...n.children].map(s=>({radius:parseFloat(getComputedStyle(s).borderTopLeftRadius),height:s.getBoundingClientRect().height}))}));
 assert.equal(stackGeometry.gap,0);assert.ok(stackGeometry.height<=227.1);assert.ok(stackGeometry.segments.every(s=>s.radius===0));
 const barProportions=await multistack.evaluate(n=>{const h=n.getBoundingClientRect().height;return {h,sum:[...n.children].reduce((s,b)=>s+parseFloat(b.style.height),0),radius:getComputedStyle(n).borderTopLeftRadius};});assert.ok(Math.abs(barProportions.h-barProportions.sum)<.2);assert.equal(barProportions.radius,'4px');
 await multistack.locator('.bar-segment').first().hover();assert.ok(await page.locator('#tip .tip-model.active').isVisible());assert.ok((await page.locator('#tip .model-share').first().textContent()).includes('%'));
 await page.locator('#legend button').first().click();assert.equal(await page.locator('#legend button').first().getAttribute('aria-pressed'),'false');assert.equal(await page.locator('#table-body tr').count(),4);
 await page.screenshot({path:join(repo,'.data/usage/fixture-details.png')});
 await page.locator('#legend button').first().click();await page.mouse.move(80,80);await page.waitForTimeout(180);await page.screenshot({path:join(repo,'.data/usage/fixture-details-all-models.png')});
 await page.locator('[data-period=day]').click();await page.screenshot({path:join(repo,'.data/usage/fixture-details-day.png')});
 const stable=await page.evaluate(async()=>{const v=document.getElementById('ag-pulse-status-bar').shadowRoot.getElementById('usage-dashboard').firstElementChild.shadowRoot;const bar=v.querySelector('.bar-column');testData.updatedAt=new Date().toISOString();await new Promise(r=>setTimeout(r,3500));return bar===v.querySelector('.bar-column');});assert.equal(stable,true,'Identical poll must preserve chart/focus DOM');
 await page.locator('#locale').click();await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar').shadowRoot.getElementById('usage-dashboard').firstElementChild.shadowRoot.getElementById('title').textContent==='Token usage');
 await page.evaluate(()=>{document.body.style.background='#f5f5f5';document.body.style.color='#222';document.documentElement.dataset.theme='light';});await page.waitForTimeout(700);
 const lightColors=await page.locator('#legend .dot').evaluateAll(ns=>ns.map(n=>getComputedStyle(n).backgroundColor));assert.notDeepEqual(lightColors,colors,'Theme changes regenerate model colors');assert.equal(new Set(lightColors).size,5);
 await page.screenshot({path:join(repo,'.data/usage/fixture-light.png')});
 await page.evaluate(()=>document.documentElement.style.setProperty('--primary','#b85c36'));await page.waitForTimeout(300);
 const warmColors=await page.locator('#legend .dot').evaluateAll(ns=>ns.map(n=>getComputedStyle(n).backgroundColor));assert.notDeepEqual(warmColors,lightColors,'Changing a custom accent regenerates the palette');assert.equal(new Set(warmColors).size,5);
 await page.screenshot({path:join(repo,'.data/usage/fixture-warm-light.png')});
 await page.evaluate(()=>document.documentElement.style.setProperty('--background','#30231b'));await page.waitForTimeout(300);
 const customColors=await page.locator('#legend .dot').evaluateAll(ns=>ns.map(n=>getComputedStyle(n).backgroundColor));assert.notDeepEqual(customColors,warmColors,'Actual background controls chart contrast even with a light theme label');
 const minContrast=await page.locator('#legend .dot').evaluateAll(ns=>{const lum=a=>a.reduce((s,v,i)=>{v/=255;return s+(v<=.04045?v/12.92:((v+.055)/1.055)**2.4)*[.2126,.7152,.0722][i];},0),bg=lum([48,35,27]);return Math.min(...ns.map(n=>{const fg=lum(getComputedStyle(n).backgroundColor.match(/[\d.]+/g).map(Number));return (Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);}));});assert.ok(minContrast>=3);
 await page.screenshot({path:join(repo,'.data/usage/fixture-warm-dark.png')});
 await page.evaluate(()=>{document.documentElement.style.removeProperty('--primary');document.documentElement.style.removeProperty('--background');});await page.waitForTimeout(300);
 await page.locator('#overview-tab').click();await page.locator('#year').click();assert.ok(await page.locator('#year-menu').evaluate(n=>n.getBoundingClientRect().right<=innerWidth));await page.waitForTimeout(180);await page.screenshot({path:join(repo,'.data/usage/fixture-year-light.png')});await page.keyboard.press('Escape');
 await page.setViewportSize({width:430,height:800});await page.waitForTimeout(500);assert.ok(await page.locator('#usage-dashboard').evaluate(n=>n.getBoundingClientRect().right<=innerWidth));await page.screenshot({path:join(repo,'.data/usage/fixture-narrow.png')});
 assert.equal(await page.locator('#usage-intro').isVisible(),false,'Normal language/theme changes do not reset acknowledgment');
 await page.keyboard.press('Escape');assert.equal(await page.locator('#usage-dashboard').evaluate(n=>n.open),false);
 await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar')?.parentElement===document.querySelector('.rounded-composer .actions'));
 await page.setViewportSize({width:1280,height:900});await page.locator('[data-card=cache]').click();await page.locator('#open-usage').click();
 await page.evaluate(()=>{testData={...testData,accountKey:'new-account',days:[],models:[],requests:0,totalTokens:0,todayTokens:0,weekTokens:0,monthTokens:0};});await page.waitForTimeout(3500);assert.equal(await page.locator('#usage-dashboard').evaluate(n=>n.open),true,'Account changes retain the frame with fresh, isolated data');assert.equal(await page.locator('#totals .value').first().textContent(),'0Token');
 await page.evaluate(`window.__agPulseDispose();window.__agPulseUsageGuidePreview=true;(${extract(sources[2])})();`);await page.locator('[data-card=cache]').click();await page.locator('#open-usage').click();assert.equal(await page.locator('#usage-intro').isVisible(),true,'Local acceptance mode replays the introduction without clearing user data');
 await page.locator('#usage-intro-done').click();await page.waitForTimeout(100);assert.equal(await page.locator('#usage-intro').isVisible(),false);
 await page.locator('#locale').click();await page.waitForTimeout(150);assert.equal(await page.locator('#usage-intro').isVisible(),true,'Local replay: changing language resets the introduction');
 await page.locator('#usage-intro-done').click();await page.evaluate(()=>document.documentElement.style.setProperty('--primary','#46895e'));await page.waitForTimeout(400);assert.equal(await page.locator('#usage-intro').isVisible(),true,'Local replay: changing theme resets the introduction');
 await page.waitForTimeout(3500);assert.equal(await page.locator('#usage-intro').isVisible(),true,'Polling must not dismiss a replayed introduction');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({host:ide?'ide':'desktop',trustedTypes:ide,checks:'Usage entry and onboarding persistence/retry/local replay; hover dismissal and keyboard return; themed year menu; stable frame; heatmap and model chart/filter; polling; language/theme; narrow layout; account isolation; missing snapshots and composer replacement',passed:true}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
