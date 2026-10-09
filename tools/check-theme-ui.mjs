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
let previewHostTheme={};
const sample=()=>({ connection:'live',theme:previewHostTheme,quotaUpdatedAt:new Date().toISOString(), groups:['gemini','3p'].map((id,index)=>({id,name:index?'Claude / GPT':'Gemini',windows:{'5h':{available:true,remaining:index?.417:.834,resetAt:new Date(Date.now()+3600000).toISOString()},weekly:{available:true,remaining:index?.308:.617,resetAt:new Date(Date.now()+86400000).toISOString()}}})), speed:trajectoryMetrics({trajectory:{cascadeId:id,generatorMetadata:[{chatModel:{modelDisplayName:'Gemini 3.8 Flash High',chatStartMetadata:{contextWindowMetadata:{estimatedTokensUsed:112000,maxContextTokens:256000}},usage:{inputTokens:13441,cacheReadTokens:614458,responseOutputTokens:5230,outputTokens:7259,thinkingOutputTokens:2029,apiProvider:'API_PROVIDER_GOOGLE_GEMINI'},streamingDuration:'50s'}}]}}) });
const staticFiles={'/':'index.html','/app.js':'app.js','/styles.css':'styles.css','/format.mjs':'format.mjs'};
let previewPreferences={language:null,revision:0};
const fixtureCss=`body[data-theme=light]{background:#f6f7f9;color:#505867}body[data-theme=light] .rounded-composer{background:#fff;border-color:#cdd3dc}body[data-theme=light] button{color:#4e5969}body[data-theme=light] .send{background:#e7ebf2}body[data-theme=dark]{background:#111;color:#aaa}body[data-theme=dark] .rounded-composer{background:#202020;border-color:#303030}body[data-theme=dark] button{color:#bbb}body[data-theme=dark] .send{background:#303030}`;
const server=createServer(async(req,res)=>{
  try {
    const path=new URL(req.url,'http://127.0.0.1').pathname;let content,type='text/javascript';
    if(path==='/api/preferences'){
      if(req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;previewPreferences={language:JSON.parse(body).language,revision:previewPreferences.revision+1};}
      content=JSON.stringify(previewPreferences);type='application/json';
    }
    else if(path==='/api/metrics'){content=JSON.stringify(sample());type='application/json';}
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
const browser=await chromium.launch(process.platform==='win32'&&!process.env.CI?{channel:'msedge',headless:true}:{headless:true});
const output=join(root,'.data','theme-ui');await mkdir(output,{recursive:true});
const errors=[];const url='http://127.0.0.1:'+server.address().port;
const report={inline:false,panel:false,liveSwitch:false,hostOverridesOS:false,sdkTokens:false,systemFallback:false,disposal:false,contrast:false,hostOverlayOcclusion:false,quotaMenuInteraction:false,refreshFeedback:false,hostAccent:false,hostSurfaces:false};
async function checkSurfaces(page,scope,inline){
  const before=await scope.locator('#context-summary').textContent();
  const keys=['--background','--card','--foreground','--primary'];
  const saved=await page.evaluate(keys=>Object.fromEntries(keys.map(key=>[key,document.documentElement.style.getPropertyValue(key)])),keys);
  const mode=await page.evaluate(()=>document.body.dataset.theme);
  const set=async(theme,background,card,foreground)=>page.evaluate(({theme,background,card,foreground})=>{
    document.body.dataset.theme=theme;
    for(const [key,value] of Object.entries({'--background':background,'--card':card,'--foreground':foreground})){
      if(value)document.documentElement.style.setProperty(key,value);else document.documentElement.style.removeProperty(key);
    }
  },{theme,background,card,foreground});
  const inspect=()=>scope.evaluate(element=>{
    const target=element.shadowRoot?element:document.documentElement,root=element.shadowRoot||element,style=getComputedStyle(target);
    const result={};
    const rgb=key=>{const probe=document.createElement('span');probe.style.color='var(--pulse-'+key+')';root.append(probe);const color=getComputedStyle(probe).color;probe.remove();return color;};
    const luminance=color=>color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
    const ratio=(a,b)=>(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    for(const key of ['background','card','menu','control','border','foreground','muted','emphasis'])result[key]=rgb(key);
    result.ratios=[];
    for(const text of ['foreground','chip','muted','subtle','label','control-text','emphasis'])for(const surface of ['card','background','control']){
      result.ratios.push({text,surface,ratio:ratio(luminance(rgb(text)),luminance(rgb(surface)))});
    }
    result.gradient=getComputedStyle(root.querySelector('#context-card')).backgroundImage;
    return result;
  });
  const wait=async expected=>{
    for(let end=Date.now()+7000;;){
      const state=await inspect();if(state.background===expected)return state;
      if(Date.now()>end)throw new Error('Surface did not follow host: '+JSON.stringify(state));await page.waitForTimeout(80);
    }
  };
  try{
    // DOM tokens win over retained custom seeds from a previous preset.
    previewHostTheme={dark:{background:'#101010',foregroundOverride:'#cccccc'}};
    for(const fixture of [
      ['dark','#272822','color-mix(in srgb, #ffffff 5%, #272822)','#f8f8f2','rgb(39, 40, 34)'],
      ['dark','#302030','color-mix(in srgb, #ffffff 5%, #302030)','#e8c8ec','rgb(48, 32, 48)'],
      ['light','#fff4e8','color-mix(in srgb, #000000 2%, #fff4e8)','#fff4e8','rgb(255, 244, 232)'],
      ['light','#e8efff','oklch(95% 0.02 260)','#dce8ff','rgb(232, 239, 255)']
    ]){
      await set(...fixture.slice(0,4));const state=await wait(fixture[4]);
      assert.ok(state.gradient.includes(state.card),'Actual hover-card gradient must use the host surface');
      assert.equal(state.menu,state.card,'Quota menu must follow the card surface');
      assert.ok(state.ratios.every(item=>item.ratio>=4.5),JSON.stringify(state));
      assert.equal(await scope.locator('#context-summary').textContent(),before);
      if(inline)await scope.locator('[data-card=context]').hover();
      await scope.locator('#context-card').screenshot({path:join(output,`custom-${fixture[0]}-${inline?'inline':'panel'}.png`)});
    }
    // Config-only background is live, sanitized, and independently supported.
    await set('dark',null,'transparent',null);
    let state=await wait('rgb(16, 16, 16)');assert.ok(state.ratios.every(item=>item.ratio>=4.5));
    previewHostTheme={dark:{background:'#263a34',foregroundOverride:'#263a34'}};
    state=await wait('rgb(38, 58, 52)');assert.ok(state.ratios.every(item=>item.ratio>=4.5));
    // Invalid/removal must clear all stale custom surface overrides.
    previewHostTheme={};
    await set('dark','transparent','url(https://invalid.example)',null);
    if(inline)await page.evaluate(()=>{
      document.querySelector('.rounded-composer').style.background='transparent';
      document.body.style.background='transparent';
    });
    await wait('rgb(28, 29, 31)');
    assert.equal((await inspect()).card,'rgb(42, 44, 47)');
  }finally{
    previewHostTheme={};
    await page.evaluate(({saved,mode,inline})=>{
      if(mode)document.body.dataset.theme=mode;else delete document.body.dataset.theme;
      for(const [key,value] of Object.entries(saved)){if(value)document.documentElement.style.setProperty(key,value);else document.documentElement.style.removeProperty(key);}
      if(inline){document.querySelector('.rounded-composer').style.removeProperty('background');document.body.style.removeProperty('background');}
    },{saved,mode,inline});
    await page.waitForTimeout(2200);
  }
}
async function checkAccent(page,scope,inline){
  const before=await scope.locator('#context-summary').textContent();
  const set=async(mode,primary)=>page.evaluate(({mode,primary})=>{
    document.body.dataset.theme=mode;
    const root=document.documentElement;
    if(primary)root.style.setProperty('--primary',primary);else root.style.removeProperty('--primary');
  },{mode,primary});
  const color=async(expected,ringExpected=expected)=>{
    await scope.locator('#context-fill').evaluate((e,expected)=>new Promise((resolve,reject)=>{
      const end=Date.now()+7000;const check=()=>{if(getComputedStyle(e).backgroundColor===expected)resolve();else if(Date.now()>end)reject(new Error('Accent did not follow host: '+getComputedStyle(e).backgroundColor));else setTimeout(check,50);};check();
    }),expected);
    assert.equal(await scope.locator('#five-fill').evaluate(e=>getComputedStyle(e).backgroundColor),expected);
    assert.equal(await scope.locator('#week-fill').evaluate(e=>getComputedStyle(e).backgroundColor),expected);
    if(inline){
      const ring=await scope.locator('#context-ring').evaluate(e=>getComputedStyle(e).backgroundImage);
      assert.ok(ring.includes(ringExpected),'Context ring must use the same host primary');
    }
    assert.equal(await scope.locator('#context-summary').textContent(),before,'Theme changes must not reset context statistics');
  };
  // Saved seeds can differ from the active preset. Actual DOM primary wins.
  previewHostTheme={dark:{primary:'#7b3fe4'},light:{primary:'#e04f5f'}};
  await set('dark','#da7756');await color('rgb(218, 119, 86)');
  await set('dark','#77aa55');await color('rgb(119, 170, 85)');
  await set('light','#007acc');await color('rgb(0, 122, 204)');
  await set('light',null);await color('rgb(224, 79, 95)');
  await set('dark',null);await color('rgb(123, 63, 228)');
  // Fresh backend snapshots update seeds without reinjection/restart.
  previewHostTheme={dark:{primary:'#da7756'},light:{primary:'#007acc'}};
  await color('rgb(218, 119, 86)');
  await set('light',null);await color('rgb(0, 122, 204)');
  previewHostTheme={light:{primary:'#ffffff'}};await color('rgb(255, 255, 255)');
  const readable=await scope.evaluate(element=>{
    const node=element.shadowRoot?element:document.documentElement,style=getComputedStyle(node);
    const probe=document.createElement('span');probe.style.color='var(--pulse-emphasis)';(element.shadowRoot||element).append(probe);
    const lightness=color=>color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
    const fg=lightness(getComputedStyle(probe).color);probe.style.color='var(--pulse-card)';const bg=lightness(getComputedStyle(probe).color);probe.remove();
    return (Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);
  });assert.ok(readable>=4.5,'Small accent text must remain readable');
  previewHostTheme={light:{primary:'url(https://invalid.example)'}};await color('rgb(49, 95, 196)','rgb(70, 103, 160)');
  // Invalid DOM colors also fall back; modern CSS token formats are accepted.
  await set('light','transparent');await color('rgb(49, 95, 196)','rgb(70, 103, 160)');
  await set('light','210 100% 40%');await color('rgb(0, 102, 204)');
  previewHostTheme={};await set('dark',null);await color('rgb(133, 168, 255)','rgb(159, 173, 199)');
  if(inline){
    await scope.locator('[data-card=context]').hover();await page.screenshot({path:join(output,'host-accent-inline.png')});
  }else await page.screenshot({path:join(output,'host-accent-panel.png')});
}
async function checkRefresh(page,button){
  let forced=0,release,forcedSeen,arrivalTimeout;
  const waiting=new Promise(resolve=>{release=resolve;});
  const arrived=new Promise(resolve=>{forcedSeen=resolve;});
  const handler=async route=>{
    if(new URL(route.request().url()).searchParams.get('force')!=='1'){await route.continue();return;}
    forced++;forcedSeen();await waiting;await route.fulfill({contentType:'application/json',body:JSON.stringify(sample())});
  };
  await page.route('**/api/metrics**',handler);
  try{
    await button.click();
    assert.equal(await button.getAttribute('aria-busy'),'true');
    await Promise.race([arrived,new Promise((_,reject)=>{arrivalTimeout=setTimeout(()=>reject(new Error('Forced refresh request did not arrive')),7000);})]);clearTimeout(arrivalTimeout);
    assert.equal(await button.locator('svg').evaluate(e=>getComputedStyle(e).animationName),'pulse-refresh-spin');
    const spinner=await button.locator('svg').elementHandle();
    const before=await spinner.evaluate(e=>getComputedStyle(e).transform);
    // Hosted browsers may postpone an animation's first frame; observe motion
    // instead of assuming that a fixed 140 ms sleep spans rendered frames.
    await page.waitForFunction(({spinner,before})=>getComputedStyle(spinner).transform!==before,
      {spinner,before},{timeout:5000});
    assert.equal(await button.getAttribute('aria-busy'),'true','Rotation must be observed while the request is pending');
    await spinner.dispose();
    await button.dispatchEvent('click');await page.waitForTimeout(80);assert.equal(forced,1,'Repeated clicks must share one request');
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await button.locator('svg').evaluate(e=>getComputedStyle(e).animationName),'none');
    assert.equal(await button.getAttribute('aria-busy'),'true');
    release();await button.page().waitForFunction(selector=>{
      const host=document.getElementById('ag-pulse-status-bar');
      return (host?.shadowRoot||document).querySelector(selector)?.getAttribute('aria-busy')==='false';
    },await button.evaluate(e=>e.id?'#'+e.id:'.refresh'));
  }finally{clearTimeout(arrivalTimeout);release();await page.unrouteAll({behavior:'wait'});await page.emulateMedia({reducedMotion:'no-preference'});}
  // Failed refreshes must also settle the indicator and remain retryable.
  let abort;
  const failing=new Promise(resolve=>{abort=resolve;});
  const fail=async route=>{if(new URL(route.request().url()).searchParams.get('force')==='1'){await failing;await route.abort('failed');}else await route.continue();};
  await page.route('**/api/metrics**',fail);
  try{
    await button.click();assert.equal(await button.getAttribute('aria-busy'),'true');abort();
    await page.waitForFunction(selector=>{
      const host=document.getElementById('ag-pulse-status-bar');
      return (host?.shadowRoot||document).querySelector(selector)?.getAttribute('aria-busy')==='false';
    },await button.evaluate(e=>e.id?'#'+e.id:'.refresh'));
    assert.equal(await button.getAttribute('aria-disabled'),'false');
  }finally{abort();await page.unrouteAll({behavior:'wait'});}
  // Click while a real automatic poll is in flight: immediate feedback, then
  // one forced request after that poll, rather than silently dropping the click.
  let seen,unblock,ordinaryHeld=false,queuedForced=0,timeout;
  const ordinary=new Promise(resolve=>{seen=resolve;});
  const blocked=new Promise(resolve=>{unblock=resolve;});
  const queue=async route=>{
    const force=new URL(route.request().url()).searchParams.get('force')==='1';
    if(!force&&!ordinaryHeld){ordinaryHeld=true;seen();await blocked;await route.fulfill({contentType:'application/json',body:JSON.stringify(sample())});}
    else if(force){queuedForced++;await route.fulfill({contentType:'application/json',body:JSON.stringify(sample())});}
    else await route.continue();
  };
  await page.route('**/api/metrics**',queue);
  try{
    await Promise.race([ordinary,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Automatic poll did not arrive')),7000);})]);clearTimeout(timeout);
    await button.click();assert.equal(await button.getAttribute('aria-busy'),'true');
    await button.dispatchEvent('click');assert.equal(queuedForced,0);
    unblock();await page.waitForFunction(selector=>{
      const host=document.getElementById('ag-pulse-status-bar');
      return (host?.shadowRoot||document).querySelector(selector)?.getAttribute('aria-busy')==='false';
    },await button.evaluate(e=>e.id?'#'+e.id:'.refresh'));
    assert.equal(queuedForced,1,'Manual refresh must run once after the ongoing poll');
  }finally{clearTimeout(timeout);unblock();await page.unrouteAll({behavior:'wait'});}
}
try {
  const page=await browser.newPage({viewport:{width:1000,height:900},deviceScaleFactor:2,colorScheme:'light'});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url+'/toolbar-preview');
  const host=page.locator('#ag-pulse-status-bar');const contextChip=host.locator('[data-card=context]');
  await contextChip.waitFor({state:'visible'});
  await page.addStyleTag({content:'.rounded-composer{position:relative;z-index:1}'});
  // The real composer bubbles widget clicks and focuses the editor. Top-layer
  // popovers do not make their shadow host match :hover, so the ensuing blur
  // used to close the entire card immediately after opening the group menu.
  await page.evaluate(()=>{
    window.testComposerClicks=0;
    document.querySelector('.rounded-composer').addEventListener('click',()=>{
      window.testComposerClicks++;document.querySelector('[aria-label="Message input"]').focus();
    });
  });
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
      const layering=await host.locator(`#${card}-card`).evaluate(element=>{
        const rect=element.getBoundingClientRect(),x=rect.x+rect.width/2,y=rect.y+40;
        let button=document.getElementById('test-scroll-bottom');
        if(!button){button=document.createElement('button');button.id='test-scroll-bottom';button.textContent='↓';button.setAttribute('aria-label','Jump to bottom');document.body.append(button);}
        button.style.cssText=`position:fixed;z-index:2147483647;left:${x-20}px;top:${y-20}px;width:40px;height:40px;border-radius:50%;background:white;color:black;`;
        return {x,y,cardWins:element.contains(element.getRootNode().elementFromPoint(x,y)),popover:element.matches(':popover-open')};
      });
      assert.equal(layering.cardWins,true,`${mode}/${card}: host jump-to-bottom control covers the card`);
      assert.equal(layering.popover,true);await page.mouse.move(layering.x,layering.y);await page.waitForTimeout(180);
      assert.equal(await host.locator(`#${card}-card`).isVisible(),true);
      const foreground=await host.locator(`#${card}-card`).evaluate(e=>getComputedStyle(e).color);
      assert.equal(foreground,mode==='light'?'rgb(32, 38, 49)':'rgb(225, 227, 231)');
      await host.locator(`#${card}-card`).screenshot({path:join(output,`${mode}-${card}.png`)});
    }
    await host.locator('#language-toggle').click();await contextChip.hover();
    assert.match(await host.locator('#context-summary').textContent(),/44%/);
    await page.screenshot({path:join(output,`${mode}-inline.png`)});
    await host.locator('.group-trigger').click();
    await page.waitForTimeout(180);
    assert.equal(await host.locator('#context-card').isVisible(),true,`${mode}: composer focus stole the quota card`);
    assert.equal(await host.locator('.group-menu').isVisible(),true,`${mode}: quota menu disappeared after clicking`);
    assert.equal(await page.evaluate(()=>window.testComposerClicks),0,'Widget clicks must not activate composer focus handlers');
    await host.locator('[data-group="3p"]').click();await page.waitForTimeout(180);
    assert.equal(await host.locator('#context-card').isVisible(),true);
    assert.equal(await host.locator('.group-menu').isVisible(),false);
    assert.match(await host.locator('.group-trigger').textContent(),/Claude \/ GPT/);
    assert.match(await host.locator('#five-balance').textContent(),/41\.7%/);
    await host.locator('.group-trigger').focus();await page.keyboard.press('Enter');
    assert.equal(await host.locator('.group-menu').isVisible(),true);
    await host.locator('[data-group="gemini"]').focus();await page.keyboard.press('Enter');
    await page.waitForTimeout(180);
    assert.equal(await host.locator('#context-card').isVisible(),true);
    assert.equal(await host.locator('.group-trigger').evaluate(e=>e.getRootNode().activeElement===e),true);
    assert.match(await host.locator('#five-balance').textContent(),/83\.4%/);
    await host.locator('.group-trigger').click();
    await page.locator('[aria-label="Message input"]').click();
    assert.equal(await host.locator('#context-card').isVisible(),false);
    assert.equal(await host.locator('.group-menu').isVisible(),false);
    assert.equal(await page.locator('[aria-label="Message input"]').evaluate(e=>document.activeElement===e),true);
    await page.evaluate(()=>window.testComposerClicks=0);
    await contextChip.hover();await host.locator('.group-trigger').click();
    const value=await host.locator('#context-percent').textContent();
    await page.evaluate(mode=>document.body.dataset.theme=mode==='dark'?'light':'dark',mode);
    await page.waitForFunction(mode=>document.getElementById('ag-pulse-status-bar')?.dataset.pulseTheme!==mode,mode);
    assert.equal(await host.locator('#context-percent').textContent(),value);
    assert.equal(await host.locator('.group-menu').isVisible(),true);
    await page.keyboard.press('Escape');
    assert.equal(await host.locator('.card:popover-open').count(),0);
    await page.evaluate(()=>document.getElementById('test-scroll-bottom')?.remove());
  }
  report.hostOverlayOcclusion=true;
  report.quotaMenuInteraction=true;
  report.inline=report.liveSwitch=report.hostOverridesOS=true;
  await contextChip.hover();await checkRefresh(page,host.locator('.refresh'));
  assert.equal(await host.locator('#context-card').isVisible(),true,'Refreshing must not close the hover card');
  await checkAccent(page,host,true);
  await checkSurfaces(page,host,true);
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
  await checkRefresh(page,page.locator('#refresh-button'));report.refreshFeedback=true;
  await checkAccent(page,page.locator('.widget'),false);report.hostAccent=true;
  await checkSurfaces(page,page.locator('.widget'),false);report.hostSurfaces=true;
  assert.deepEqual(errors,[]);console.log(JSON.stringify({...report,pageErrors:errors,screenshots:output},null,2));
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
