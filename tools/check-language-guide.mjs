// Exercise the first-use flow with real UI and disk preferences, including a new origin.
import {createServer} from 'node:http';
import {readFile,mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {PreferencesStore} from '../compat/preferences.mjs';
const repo=join(dirname(fileURLToPath(import.meta.url)),'..');
const directory=await mkdtemp(join(tmpdir(),'pulse-guide-')),file=join(directory,'preferences.json');
const sources=await Promise.all(['i18n.cjs','theme.cjs','inline-widget.cjs'].map(f=>readFile(join(repo,'compat',f),'utf8')));
const extract=s=>s.slice(s.indexOf('module.exports = ')+17).trim().replace(/;$/,'');
const install=`window.__agPulseI18nFactory=(${extract(sources[0])});window.__agPulseThemeFactory=(${extract(sources[1])});(${extract(sources[2])})();`;
const html=await readFile(join(repo,'sidecars/panel/toolbar-preview.html'),'utf8');
let failWrites=false;
async function serve(){
 const store=new PreferencesStore({file});
 const server=createServer(async(req,res)=>{try{
  const path=new URL(req.url,'http://localhost').pathname;let text,type='text/javascript';
  if(path==='/api/preferences'){
   if(req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;if(failWrites)throw new Error('Simulated disk failure');text=JSON.stringify(await store.set(JSON.parse(body)));}
   else text=JSON.stringify(await store.get());type='application/json';
  }else if(path==='/api/metrics'){text=JSON.stringify({connection:'live',groups:[],preferences:await store.get(),speed:{conversationId:'11111111-1111-1111-1111-111111111111',counts:{},cache:null,context:null}});type='application/json';}
  else if(path==='/inline-widget.js')text=install;
  else if(path==='/fixture'){text=html;type='text/html';}
  else{res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});res.end(text);
 }catch{res.writeHead(400,{'Content-Type':'application/json'});res.end('{"error":"Simulated disk failure"}');}});
 server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 return {store,url:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(r=>server.close(r))};
}
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch(process.platform==='win32'&&!process.env.CI?{channel:'msedge',headless:true}:{headless:true});
const errors=[];let server,context,page;
async function fresh(){await context?.close();context=await browser.newContext({viewport:{width:1100,height:850},deviceScaleFactor:2});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(server.url+'/fixture');return page.locator('#ag-pulse-status-bar');}
const out=join(repo,'.data','issue6');await mkdir(out,{recursive:true});
try{
 server=await serve();let host=await fresh();const guide=host.locator('#language-guide');
 await guide.waitFor({state:'visible'});assert.equal(await host.locator('.bar .language-button').count(),0);
 assert.equal(await page.evaluate(()=>document.activeElement===document.body),true,'Tip must not steal focus');
 await page.screenshot({path:join(out,'first-use-guide.png')});
 await host.evaluate(e=>{e.style.flex='0 0 80px';e.style.maxWidth='80px';});
 await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar')?.dataset.density==='icons');
 assert.equal(await guide.isVisible(),true);await guide.locator('#guide-open').click();
 assert.equal(await host.locator('#context-card').isVisible(),true);
 assert.equal(await host.locator('#card-language-zh').isVisible(),true);
 await host.locator('#card-language-zh').click();
 await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar')?.lang==='zh-CN');
 await page.waitForFunction(async()=>((await (await fetch('/api/preferences')).json()).languageGuideDismissed===true));
 await page.screenshot({path:join(out,'guided-language-selection.png')});
 await context.close();context=null;await server.close();server=await serve();host=await fresh();
 await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar')?.lang==='zh-CN');
 assert.equal(await host.locator('#language-guide').isVisible(),false,'Guide must stay dismissed after new backend/origin');
 await context.close();context=null;await rm(file,{force:true});host=await fresh();
 await host.locator('#language-guide').waitFor({state:'visible'});failWrites=true;
 await host.locator('#guide-close').click();await host.locator('#guide-save-note').filter({hasText:'Could not save'}).waitFor();
 assert.equal(await host.locator('#language-guide').isVisible(),true,'Failed persistence must allow retry');
 failWrites=false;await host.locator('#guide-close').click();await host.locator('#language-guide').waitFor({state:'hidden'});
 assert.equal((await server.store.get()).language,null,'Closing guide must not change language');
 await context.close();context=null;await server.close();server=await serve();host=await fresh();
 await host.locator('[data-card=context]').waitFor();assert.equal(await host.locator('#language-guide').isVisible(),false);
 await context.close();context=null;await rm(file,{force:true});host=await fresh();
 await host.locator('#guide-open').click();await host.locator('#card-language-en').click();
 await page.waitForFunction(async()=>((await (await fetch('/api/preferences')).json()).languageGuideDismissed===true));
 assert.equal((await server.store.get()).language,'en','Selecting current English also completes onboarding');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({firstUse:true,noFocusTheft:true,threeIcons:true,guidedChineseChoice:true,newOriginAndBackend:true,dismissWithoutLanguage:true,failedSaveRetry:true,explicitEnglishChoice:true,pageErrors:errors},null,2));
}finally{await browser.close();await server?.close();await rm(directory,{recursive:true,force:true});}
