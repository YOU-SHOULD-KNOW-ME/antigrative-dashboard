// Browser regression check with synthetic metrics; optional Playwright dependency.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { trajectoryMetrics } from '../sidecars/panel/metrics.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFile(join(root,path),'utf8');
const extract=source=>source.slice(source.indexOf('module.exports = ')+17).trim().replace(/;$/,'');
const theme=createRequire(import.meta.url)('../compat/theme.cjs')();
const [i18n,widget,themeSource]=await Promise.all(['compat/i18n.cjs','compat/inline-widget.cjs','compat/theme.cjs'].map(read));
const id='11111111-1111-1111-1111-111111111111';
const sample=()=>({ connection:'live',quotaUpdatedAt:new Date().toISOString(), groups:['gemini','3p'].map((id,index)=>({id,name:index?'Claude / GPT':'Gemini',windows:{'5h':{available:true,remaining:.834,resetAt:new Date(Date.now()+3600000).toISOString()},weekly:{available:true,remaining:.617,resetAt:new Date(Date.now()+86400000).toISOString()}}})), speed:trajectoryMetrics({trajectory:{cascadeId:id,generatorMetadata:[{chatModel:{modelDisplayName:'Gemini 3.8 Flash High',chatStartMetadata:{contextWindowMetadata:{estimatedTokensUsed:112000,maxContextTokens:256000}},usage:{inputTokens:13441,cacheReadTokens:614458,responseOutputTokens:5230,outputTokens:7259,thinkingOutputTokens:2029,apiProvider:'API_PROVIDER_GOOGLE_GEMINI'},streamingDuration:'50s'}}]}}) });
const staticFiles={'/':'index.html','/app.js':'app.js','/styles.css':'styles.css','/format.mjs':'format.mjs'};
const fixtureCss=`body[data-theme=light]{background:#f6f7f9;color:#505867}body[data-theme=light] .rounded-composer{background:#fff;border-color:#cdd3dc}body[data-theme=light] button{color:#4e5969}body[data-theme=light] .send{background:#e7ebf2}body[data-theme=dark]{background:#111;color:#aaa}body[data-theme=dark] .rounded-composer{background:#202020;border-color:#303030}body[data-theme=dark] button{color:#bbb}body[data-theme=dark] .send{background:#303030}`;
const server=createServer(async(req,res)=>{
  try {
    const path=new URL(req.url,'http://127.0.0.1').pathname;let content,type='text/javascript';
    if(path==='/api/metrics'){content=JSON.stringify(sample());type='application/json';}
    else if(path==='/i18n.js')content='export const createI18n='+extract(i18n);
    else if(path==='/theme.js')content='export const createTheme='+extract(themeSource);
    else if(path==='/theme.css'){content=theme.css(':root');type='text/css';}
    else if(path==='/preload.js')content='';
    else if(path==='/inline-widget.js')content=`window.__agPulseI18nFactory=(${extract(i18n)});window.__agPulseThemeFactory=(${extract(themeSource)});(${extract(widget)})();`;
    else if(path.startsWith('/toolbar-preview')){content=(await read('sidecars/panel/toolbar-preview.html')).replace('</head>',`<style>${fixtureCss}</style></head>`);type='text/html';}
    else if(staticFiles[path]){content=await read('sidecars/panel/'+staticFiles[path]);type=path==='/'?'text/html':path.endsWith('.css')?'text/css':'text/javascript';}
    else {res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});res.end(content);
  } catch(error) {res.writeHead(500);res.end(error.message);}
});
server.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch(process.platform==='win32'?{channel:'msedge',headless:true}:{headless:true});
const output=join(root,'.data','theme-ui');await mkdir(output,{recursive:true});
const errors=[];const url='http://127.0.0.1:'+server.address().port;
const report={inline:false,panel:false,liveSwitch:false,hostOverridesOS:false,sdkTokens:false,systemFallback:false,disposal:false,contrast:false};
try {
  const page=await browser.newPage({viewport:{width:1000,height:900},deviceScaleFactor:2,colorScheme:'light'});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url+'/toolbar-preview');
  const host=page.locator('#ag-pulse-status-bar');const contextChip=host.locator('[data-card=context]');
  await contextChip.waitFor({state:'visible'});
  const contrast=await page.evaluate(()=>{
    const node=document.getElementById('ag-pulse-status-bar'),root=node.shadowRoot;
    const lightness=color=>{const rgb=(color.trim().startsWith('#')?color.trim().slice(1).match(/../g).map(v=>parseInt(v,16)):color.match(/[\d.]+/g).slice(0,3).map(Number)).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];};
    const ratio=(a,b)=>(Math.max(a,b)+.05)/(Math.min(a,b)+.05);const results=[];
    for(const theme of ['dark','light']){node.dataset.pulseTheme=theme;const style=getComputedStyle(node);const bg=lightness(style.getPropertyValue('--pulse-card'));
      for(const token of ['foreground','muted','subtle','label','control-text','emphasis']){
        // Resolve hex palette values to rgb through an existing element.
        const probe=document.createElement('span');probe.style.color=`var(--pulse-${token})`;root.append(probe);
        const value=ratio(lightness(getComputedStyle(probe).color),bg);probe.remove();results.push({theme,token,ratio:value});
      }
    }return results;
  });
  assert.ok(contrast.every(item=>item.ratio>=4.5),JSON.stringify(contrast));report.contrast=true;
  for(const mode of ['dark','light']) {
    await page.evaluate(mode=>document.body.dataset.theme=mode,mode);
    await page.waitForFunction(mode=>document.getElementById('ag-pulse-status-bar')?.dataset.pulseTheme===mode,mode);
    for(const card of ['speed','cache','context']) {
      await host.locator(`[data-card=${card}]`).hover();
      const foreground=await host.locator(`#${card}-card`).evaluate(e=>getComputedStyle(e).color);
      assert.equal(foreground,mode==='light'?'rgb(32, 38, 49)':'rgb(225, 227, 231)');
      await host.locator(`#${card}-card`).screenshot({path:join(output,`${mode}-${card}.png`)});
    }
    await host.locator('#language-toggle').click();await contextChip.hover();
    assert.match(await host.locator('#context-summary').textContent(),/44%/);
    await page.screenshot({path:join(output,`${mode}-inline.png`)});
    await host.locator('.group-trigger').click();
    const value=await host.locator('#context-percent').textContent();
    await page.evaluate(mode=>document.body.dataset.theme=mode==='dark'?'light':'dark',mode);
    await page.waitForFunction(mode=>document.getElementById('ag-pulse-status-bar')?.dataset.pulseTheme!==mode,mode);
    assert.equal(await host.locator('#context-percent').textContent(),value);
    assert.equal(await host.locator('.group-menu').isVisible(),true);
    await page.keyboard.press('Escape');
  }
  report.inline=report.liveSwitch=report.hostOverridesOS=true;
  // No explicit theme: read an opaque modern CSS color from the composer.
  await page.evaluate(()=>{delete document.body.dataset.theme;document.querySelector('.rounded-composer').style.background='oklch(97% 0.01 250)';});
  await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar').dataset.pulseTheme==='light');
  await page.evaluate(()=>document.querySelector('.rounded-composer').style.background='color(srgb 0.12 0.12 0.12)');
  await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar').dataset.pulseTheme==='dark');
  // Disposal stops both media/attribute listeners, and removes the widget.
  await page.evaluate(()=>{window.testDisposedNode=document.getElementById('ag-pulse-status-bar');window.__agPulseDispose();document.body.dataset.theme='light';});
  await page.emulateMedia({colorScheme:'dark'});await page.waitForTimeout(1600);
  assert.equal(await page.evaluate(()=>window.testDisposedNode.dataset.pulseTheme),'dark');
  assert.equal(await host.count(),0);report.disposal=true;
  await page.goto(url+'/');
  await page.waitForFunction(()=>document.documentElement.dataset.pulseTheme==='dark');
  await page.emulateMedia({colorScheme:'light'});
  await page.waitForFunction(()=>document.documentElement.dataset.pulseTheme==='light');report.systemFallback=true;
  for(const mode of ['dark','light']) {
    // Simulate exactly what SDK theme-change does: overwrite --background.
    await page.evaluate(mode=>document.documentElement.style.setProperty('--background',mode==='dark'?'color(srgb 0.07 0.07 0.07)':'oklch(98% 0.01 250)'),mode);
    await page.waitForFunction(mode=>document.documentElement.dataset.pulseTheme===mode,mode);
    for(const card of ['speed','cache','context']) {
      await page.locator(`[data-card=${card}]`).hover();await page.locator(`#${card}-card`).waitFor({state:'visible'});
      assert.equal(await page.locator(`#${card}-card`).evaluate(e=>getComputedStyle(e).color),mode==='light'?'rgb(32, 38, 49)':'rgb(225, 227, 231)');
    }
    await page.screenshot({path:join(output,`${mode}-panel.png`)});
  }
  report.panel=report.sdkTokens=true;
  assert.deepEqual(errors,[]);console.log(JSON.stringify({...report,pageErrors:errors,screenshots:output},null,2));
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
