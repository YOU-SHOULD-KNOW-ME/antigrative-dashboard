// Large synthetic chat only. Never imports fixture records into a real ledger.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const repo=join(dirname(fileURLToPath(import.meta.url)),'..');
const source=await readFile(join(repo,'compat/usage-ui.cjs'),'utf8');
const theme=await readFile(join(repo,'compat/theme.cjs'),'utf8');
const extract=s=>s.slice(s.indexOf('module.exports = ')+17).trim().replace(/;$/,'');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch(process.platform==='win32'&&!process.env.CI?{channel:'msedge',headless:true}:{headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<style>body{margin:0;background:#161412;color:#eee}#chat{height:800px;overflow:auto}#chat p{margin:4px}#opener{position:fixed;bottom:15px;left:50px}</style><main id="chat"></main><button id="opener">Usage</button><div id="host"></div>');
 await page.evaluate(()=>{const fragment=document.createDocumentFragment();for(let i=0;i<10000;i++){const row=document.createElement('p'),button=document.createElement('button');button.textContent='Synthetic message '+i;row.append(button);fragment.append(row);}document.getElementById('chat').append(fragment);window.backgroundClicks=0;document.getElementById('chat').addEventListener('click',()=>backgroundClicks++);});
 await page.evaluate(({source,theme})=>{
  const root=document.getElementById('host').attachShadow({mode:'open'}),style=document.createElement('style');style.textContent=eval('('+theme+')')().shadowCss();root.append(style);
  window.usageTest=eval('('+source+')')({root,language:{language:'en'},setMarkup:(n,html)=>{n.innerHTML=html;},guideDismissed:true,onDismissGuide:async()=>{},onLanguage:async()=>{},onRefresh:async()=>{}});
  window.usageFixture={accountKey:'fixture',today:'2026-10-15',timeZone:'Asia/Shanghai',models:['Fixture'],days:[{date:'2026-10-15',models:{Fixture:{total:1000,requests:1,uncached:100,cacheRead:800,cacheWrite:0,output:100}}}],todayTokens:1000,weekTokens:1000,monthTokens:1000,totalTokens:1000,requests:1,firstDate:'2026-10-15'};
 },{source:extract(source),theme:extract(theme)});
 const timings=await page.evaluate(()=>{
  const samples=[];for(let i=0;i<4;i++){
   let t=performance.now();usageTest.open(usageFixture,document.getElementById('opener'));const open=performance.now()-t;
   const d=document.getElementById('host').shadowRoot.getElementById('usage-dashboard');
   if(!d.matches(':popover-open')||!d.open||d.matches(':modal'))throw Error('Expected a top-layer overlay without whole-host native inertness');
   t=performance.now();usageTest.close();samples.push({open,close:performance.now()-t});
  }return samples;
 });
 assert.ok(timings.every(s=>s.open<500&&s.close<500),'Large-chat open/close must avoid multi-second native modal work: '+JSON.stringify(timings));
 await page.evaluate(()=>usageTest.open(usageFixture,document.getElementById('opener')));
 await page.evaluate(()=>usageTest.update({...usageFixture,missingConversations:2,confirmedMissingConversations:0,retryingConversations:2,syncing:false}));
 assert.equal(await page.locator('#alert').isVisible(),false,'A first temporary read failure is synchronization status, not a missing-data warning');
 assert.match(await page.locator('#timezone').textContent(),/Syncing history/);assert.equal(await page.locator('#totals .value').first().textContent(),'1KToken');
 await page.evaluate(()=>usageTest.update({...usageFixture,missingConversations:2,confirmedMissingConversations:2,retryingConversations:0,syncing:false}));
 assert.equal(await page.locator('#alert').isVisible(),true,'Repeated unresolved reads still report incomplete coverage');
 await page.evaluate(()=>usageTest.update({...usageFixture,partialRequests:1,missingConversations:0,confirmedMissingConversations:0}));
 assert.equal(await page.locator('#alert').isVisible(),true,'Actual missing token components are never hidden');
 await page.evaluate(()=>usageTest.update(usageFixture));
 const dialog=page.locator('#usage-dashboard');assert.equal(await dialog.getAttribute('aria-modal'),'true');
 await page.locator('#selection-details').focus();await page.keyboard.press('Tab');assert.equal(await page.locator('#locale').evaluate(n=>n.getRootNode().activeElement===n),true);
 await page.keyboard.press('Shift+Tab');assert.equal(await page.locator('#selection-details').evaluate(n=>n.getRootNode().activeElement===n),true);
 await page.evaluate(()=>document.getElementById('opener').focus());assert.equal(await page.locator('#locale').evaluate(n=>n.getRootNode().activeElement===n),true,'Background script cannot steal focus');
 assert.equal(await page.evaluate(()=>{const event=new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:100});document.getElementById('chat').dispatchEvent(event);return event.defaultPrevented;}),true,'Background scrolling stays blocked');
 await page.keyboard.press('Escape');assert.equal(await dialog.evaluate(n=>n.open),false);assert.equal(await page.locator('#opener').evaluate(n=>document.activeElement===n),true);
 await page.evaluate(()=>usageTest.open(usageFixture,document.getElementById('opener')));await page.mouse.click(10,10);
 assert.equal(await page.evaluate(()=>backgroundClicks),0,'Backdrop must consume the click before the host');assert.equal(await dialog.evaluate(n=>n.open),false);
 await page.evaluate(()=>usageTest.dispose());await page.locator('#opener').focus();assert.equal(await page.locator('#opener').evaluate(n=>document.activeElement===n),true);
 assert.deepEqual(errors,[]);
 const result={syntheticHostElements:20000,timings,focusLoop:true,escape:true,focusRestore:true,backgroundFocusBlocked:true,backdropClickBlocked:true,disposedListenersRemoved:true};
 await mkdir(join(repo,'.data/usage'),{recursive:true});await writeFile(join(repo,'.data/usage/performance.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
