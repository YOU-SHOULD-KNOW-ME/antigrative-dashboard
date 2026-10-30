// Synthetic fixtures only. No real conversations or usage ledger are read/written.
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {trajectoryMetrics} from '../sidecars/panel/metrics.mjs';
import {panelAppSource,panelPageSource} from '../sidecars/panel/panel-source.mjs';

const repo=join(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const factories=Object.fromEntries(['i18n','theme','inline-widget'].map(name=>[name,require(join(repo,'compat',name+'.cjs')).toString()]));
const surface=require(join(repo,'ide/surface.cjs')).toString();
const ids={root:'11111111-1111-1111-1111-111111111111',child:'22222222-2222-2222-2222-222222222222',leaf:'33333333-3333-3333-3333-333333333333'};
const output=join(repo,'.data/task-usage-ui');
await mkdir(output,{recursive:true});

function sample(id,uncached,cached,write,out,context) {
  const speed=trajectoryMetrics({trajectory:{cascadeId:id,generatorMetadata:[{chatModel:{
    modelDisplayName:'Gemini 3.8 Flash',streamingDuration:'2s',
    usage:{apiProvider:'API_PROVIDER_GOOGLE_GEMINI',inputTokens:uncached,cacheReadTokens:cached,cacheWriteTokens:write,outputTokens:out,responseOutputTokens:out},
  }}],steps:[]}});
  return {...speed,rounds:2,steps:7,context:{usedFraction:context,remainingFraction:1-context,usedTokens:context*100000,maxTokens:100000,model:'Gemini 3.8 Flash'}};
}
const own=sample(ids.root,1000,4000,0,500,.12);
const child=sample(ids.child,2000,3000,0,900,.37);
const leaf=sample(ids.leaf,500,500,100,100,.05);
function task(current,descendants,{state='ready',subagents=descendants.length,loadedSubagents=descendants.length}={}) {
  const all=[current,...descendants];
  const sum=field=>Object.fromEntries(Object.keys(current[field]).map(key=>[key,
    typeof current[field][key]==='number'?all.reduce((total,speed)=>total+speed[field][key],0):current[field][key]]));
  const tokens=sum('tokens'),cache=sum('cache');
  cache.hitRate=cache.inputTokens?cache.cachedTokens/cache.inputTokens:null;
  return {...current,taskUsage:{tokens,cache,ownTokens:current.tokens.totalTokens,
    subagentTokens:loadedSubagents?descendants.reduce((total,speed)=>total+speed.tokens.totalTokens,0):0,
    subagents,loadedSubagents,state,complete:state==='ready'}};
}
let snapshots={},preference={language:'en',languageGuideDismissed:true,revision:1},metricCalls=0,collection=null;
const groups=[{id:'gemini',name:'Gemini',windows:{'5h':{available:true,remaining:.8},weekly:{available:true,remaining:.6}}}];
const metrics=id=>({connection:'live',groups,preferences:preference,collection,speed:snapshots[id||ids.root]||null});
const fixture=ide=>`<!doctype html><html><head><meta charset="utf-8">${ide?'<meta http-equiv="Content-Security-Policy" content="script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; require-trusted-types-for \'script\'; trusted-types \'none\'">':''}<style>
body{margin:0;padding:40px;background:#18191b;color:#ddd;font:13px 'Segoe UI',sans-serif}.rounded-composer{max-width:940px;margin:300px auto 0;padding:10px;border-radius:16px;background:#27282a}.editor{height:45px}.actions,.left,.right{display:flex;align-items:center;gap:5px}.left{flex:1;min-width:0}.right{flex:none}button{height:28px;border:0;background:transparent;color:inherit}
</style></head><body>${ide?'<div class="antigravity-agent-side-panel"><div id="conversation" role="region">':''}<div class="rounded-composer" ${ide?'id="antigravity.agentSidePanelInputBox"':''}><div class="editor" contenteditable="true" role="combobox" aria-label="Message input"></div><div class="actions"><div class="left"><button aria-label="Add context">＋</button><button data-testid="model-selector-trigger">Gemini 3.8 Flash</button></div><div class="right"><button aria-label="Record voice memo">♩</button><button aria-label="Send message">➜</button></div></div></div>${ide?'</div></div>':''}<script>
history.replaceState({},'', '/c/${ids.root}');
window.agPulseHost={getMetrics:async input=>(await fetch('/api/metrics?conversationId='+input.conversationId)).json(),getPreferences:async()=>(await fetch('/api/preferences')).json(),setPreferences:async input=>(await fetch('/api/preferences',{method:'POST',body:JSON.stringify(input)})).json()};
${ide?`const box=document.getElementById('antigravity.agentSidePanelInputBox'),panel=document.querySelector('.antigravity-agent-side-panel');const owner={props:{cascadeId:'${ids.root}'},__k:[]},vnode={type:'div',__e:box,props:{id:box.id},__:owner,__k:[]};owner.__k=[vnode];panel.__k=owner;window.testOwner=owner;window.__agPulseSurface=(${surface})();`:''}
window.__agPulseI18nFactory=(${factories.i18n});window.__agPulseThemeFactory=(${factories.theme});(${factories['inline-widget']})();
</script></body></html>`;

const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');let content,type='text/html';
    if(url.pathname==='/api/preferences'){
      if(req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;preference={...preference,...JSON.parse(body),revision:preference.revision+1};}
      content=JSON.stringify(preference);type='application/json';
    }else if(url.pathname==='/api/metrics'){
      metricCalls++;content=JSON.stringify(metrics(url.searchParams.get('conversationId')));type='application/json';
    }else if(url.pathname==='/inline')content=fixture(false);
    else if(url.pathname==='/ide')content=fixture(true);
    else if(url.pathname==='/')content=panelPageSource();
    else if(url.pathname==='/app.js'){content=panelAppSource();type='text/javascript';}
    else if(url.pathname==='/styles.css'){content=await readFile(join(repo,'sidecars/panel/styles.css'),'utf8');type='text/css';}
    else if(url.pathname==='/theme.css'){content=require(join(repo,'compat/theme.cjs'))().css(':root');type='text/css';}
    else if(url.pathname==='/preload.js'){content='';type='text/javascript';}
    else {res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});res.end(content);
  }catch(error){res.writeHead(500);res.end(error.message);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const errors=[],results=[];let browser;
try {
  browser=await chromium.launch(process.platform==='win32'&&!process.env.CI?{channel:'msedge',headless:true}:{headless:true});
  const origin='http://127.0.0.1:'+server.address().port;
  for(const mode of ['inline','ide','panel'].filter(value=>!process.env.PULSE_TASK_UI_MODE||process.env.PULSE_TASK_UI_MODE===value)) {
    const inline=mode!=='panel';preference={language:'en',languageGuideDismissed:true,revision:1};collection=null;
    snapshots={[ids.root]:task(own,[],{state:'loading',subagents:2,loadedSubagents:0}),[ids.child]:task(child,[leaf]),[ids.leaf]:leaf};
    const page=await browser.newPage({viewport:{width:1180,height:900},colorScheme:'dark'});
    page.on('pageerror',error=>errors.push(`${mode}: ${error.message}`));
    if(!inline)await page.addInitScript(id=>{window.sidecar={conversationId:id,fetch:(...args)=>fetch(...args)};},ids.root);
    try {
      await page.goto(origin+(inline?'/'+mode:'/'));
      const scope=inline?page.locator('#ag-pulse-status-bar'):page.locator('body');
      const expectText=async(id,text)=>page.waitForFunction(({inline,id,text})=>{
        const root=inline?document.getElementById('ag-pulse-status-bar')?.shadowRoot:document;
        return root?.getElementById(id)?.textContent===text;
      },{inline,id,text});
      const openCache=async()=>{await scope.locator('[data-card=cache]').click();await scope.locator('#cache-card').waitFor({state:'visible'});};
      const cacheChip=scope.locator('[data-card=cache]');
      const expectMarker=async(value,label)=>{
        if(value)await page.evaluate(()=>{window.__taskMarkerVisibleSince=0;});
        await page.waitForFunction(({inline,value,label})=>{
          const root=inline?document.getElementById('ag-pulse-status-bar')?.shadowRoot:document;
          const chip=root?.querySelector('[data-card=cache]');
          const matches=!!chip&&(chip.dataset.taskCurrentOnly==='true')===value&&(!value||(chip.getAttribute('aria-label')===label&&chip.title===label&&chip.getClientRects().length>0&&getComputedStyle(chip).visibility==='visible'));
          if(!value)return matches;
          if(!matches){window.__taskMarkerVisibleSince=0;return false;}
          if(!window.__taskMarkerVisibleSince)window.__taskMarkerVisibleSince=performance.now();
          return performance.now()-window.__taskMarkerVisibleSince>=250;
        },{inline,value,label});
        if(value){
          const marker=await cacheChip.evaluate((chip,inline)=>{
            const style=getComputedStyle(chip,inline?'::after':'::before'),rect=chip.getBoundingClientRect();
            return {content:style.content,background:style.backgroundColor,color:style.color,width:parseFloat(style.width),height:parseFloat(style.height),chipWidth:rect.width,chipHeight:rect.height,left:parseFloat(style.left),top:parseFloat(style.top),right:parseFloat(style.right),visible:!!chip.getClientRects().length&&getComputedStyle(chip).visibility==='visible'};
          },inline);
          assert.equal(marker.content,'"!"',`${mode}: current-only marker is drawn`);
          if(!marker.visible){
            const layout=await page.evaluate(async inline=>{const samples=[];for(let i=0;i<12;i++){const host=inline?document.getElementById('ag-pulse-status-bar'):document.documentElement,root=inline?host?.shadowRoot:document,chip=root?.querySelector('[data-card=cache]');samples.push({layout:host?.dataset.layout,visibility:chip?getComputedStyle(chip).visibility:null,display:chip?getComputedStyle(chip).display:null,hidden:chip?.hidden});await new Promise(resolve=>setTimeout(resolve,100));}return samples;},inline);
            assert.fail(`${mode}: marker visibility changed after the layout check: ${JSON.stringify({marker,layout})}`);
          }
          assert.ok(marker.width>=8&&marker.height>=8,`${mode}: marker remains visible: ${JSON.stringify(marker)}`);
          assert.ok(marker.top>=0&&marker.top+marker.height<=marker.chipHeight&&marker.right>=0&&marker.right+marker.width<=marker.chipWidth,`${mode}: marker fits within the cache control`);
          const rgb=value=>(value.match(/\d+/g)||[]).slice(0,3).map(Number);
          const luminance=color=>rgb(color).map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
          const a=luminance(marker.color),b=luminance(marker.background);
          assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=3,`${mode}: marker has sufficient contrast`);
        }else{
          assert.notEqual(await cacheChip.getAttribute('aria-label'),label);
          assert.notEqual(await cacheChip.getAttribute('title'),label);
        }
      };
      const chooseLanguage=async language=>{
        if(inline){await scope.locator('[data-card=context]').click();await scope.locator(`[data-language-choice="${language}"]`).click();}
        else {await scope.locator('#language-toggle').click();await page.locator(`[data-language-menu] [data-language="${language}"]`).click();}
        await expectText('task-subagents-label',language==='en'?'Subagents (2)':'子代理（2）');
        await openCache();
      };
      const expectOwn=async speed=>{
        await expectText(inline?'tps':'strip-tps',speed.tps.toFixed(1));
        await expectText(inline?'context-percent':'strip-context',`${Math.round(speed.context.usedFraction*100)}%`);
        await expectText(inline?'tokens':'token-detail',`${speed.counts.responseOutput.toLocaleString('en-US')} / 0 tok`);
        assert.equal(await scope.locator(inline?'#samples':'#request-count').textContent(),inline?'2 turns · 7 steps · 1 samples':'1 samples');
        assert.equal(await scope.locator('#five-balance').textContent(),'80.0%');
        assert.equal(await scope.locator('#week-balance').textContent(),'60.0%');
      };
      await expectText('cache-note','Summing subagents…');await openCache();
      await expectText('task-own','5,500 tok');await expectText('task-subagents','—');
      assert.equal(await scope.locator('#task-own-row').isVisible(),true);
      assert.equal(await scope.locator('#cache-note').isVisible(),true);
      await expectOwn(own);
      // A disk-completed parent may know about subagents without having read
      // any of their requests. Show fresh own figures with explicit scope;
      // never present an old merged task total as the current one.
      snapshots[ids.root]=task(own,[],{state:'partial',subagents:2,loadedSubagents:0});
      await expectText('cache-note','Current agent only; subagent statistics unavailable.');
      await expectText('cache-coverage','5,500 tok');await expectText('task-subagents','—');
      await expectMarker(true,'Current agent only; subagent statistics unavailable.');
      await page.screenshot({path:join(output,mode+'-current-only-en.png')});
      await chooseLanguage('zh-CN');await expectText('cache-note','仅当前代理；子代理统计暂不可用');await expectMarker(true,'仅当前代理；子代理统计暂不可用');
      await chooseLanguage('zh-TW');await expectText('cache-note','僅目前代理；子代理統計暫時無法取得');await expectMarker(true,'僅目前代理；子代理統計暫時無法取得');
      // The signal remains legible in both host themes and in the narrow layout.
      await page.evaluate(()=>{document.body.dataset.theme='light';document.documentElement.style.setProperty('--background','#f3efe3');});
      await page.waitForFunction(inline=>(inline?document.getElementById('ag-pulse-status-bar'):document.documentElement)?.dataset.pulseTheme==='light',inline);
      await expectMarker(true,'僅目前代理；子代理統計暫時無法取得');
      if(inline){
        await page.keyboard.press('Escape');
        // The IDE's native buttons need width too. Pick the first narrow size
        // that actually fits the three dashboard icons without overlap.
        let narrowWidth=null;
        for(const width of [260,280,300,320,340,360,380,400,440,480]){
          await page.evaluate(width=>document.querySelector('.rounded-composer').style.maxWidth=width+'px',width);
          await page.waitForTimeout(500);
          const fit=await page.evaluate(()=>{const host=document.getElementById('ag-pulse-status-bar');return host?.dataset.layout==='ready'&&host.classList.contains('icons-only');});
          if(fit){narrowWidth=width;break;}
        }
        assert.ok(narrowWidth,`${mode}: find a narrow width that fits all three controls`);
      }else await page.setViewportSize({width:270,height:900});
      await expectMarker(true,'僅目前代理；子代理統計暫時無法取得');
      if(inline)await page.evaluate(()=>document.querySelector('.rounded-composer').style.maxWidth='');
      else await page.setViewportSize({width:1180,height:900});
      await page.evaluate(()=>{document.body.dataset.theme='dark';document.documentElement.style.setProperty('--background','#18191b');});
      await page.waitForFunction(inline=>(inline?document.getElementById('ag-pulse-status-bar'):document.documentElement)?.dataset.pulseTheme==='dark',inline);
      await expectMarker(true,'僅目前代理；子代理統計暫時無法取得');
      collection={state:'processing',code:'background-collection'};
      await expectMarker(false,'僅目前代理；子代理統計暫時無法取得');
      collection={state:'limited',code:'budget-exceeded'};
      if(inline)await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar')?.dataset.collection==='limited');
      else await expectText('health-note','此對話統計量超過採集限制。');
      await expectMarker(false,'僅目前代理；子代理統計暫時無法取得');
      collection=null;await expectMarker(true,'僅目前代理；子代理統計暫時無法取得');
      snapshots[ids.root]=task(own,[],{state:'loading',subagents:2,loadedSubagents:0});
      await expectMarker(false,'僅目前代理；子代理統計暫時無法取得');
      await chooseLanguage('zh-CN');await expectText('cache-note','正在汇总子代理…');
      assert.equal(await scope.locator('#task-own-row dt').textContent(),'当前代理');
      snapshots[ids.root]=task(own,[child,leaf]);
      await expectText('cache-coverage','12,600 tok');await expectText('task-subagents','7,100 tok');
      await expectText(inline?'cache-total':'strip-cache-total','12.6K tok');
      await expectText(inline?'cache-detail-rate':'cache-rate','67.6%');
      await expectText('cache-read','7,500 tok');await expectText('cache-miss','3,500 tok');
      await expectText('cache-write','100 tok');await expectText('cache-output','1,500 tok');
      assert.equal(await scope.locator('#cache-note').isVisible(),false,'Ready tasks show no explanatory prose');
      assert.equal(await scope.locator('#cache-write-row').isVisible(),true);
      assert.deepEqual(await scope.locator('#cache-card dl>div').evaluateAll(rows=>rows.slice(-2).map(row=>row.id)),['task-own-row','task-subagents-row']);
      assert.equal((await scope.locator('#cache-card').textContent()).includes('≥'),false);
      await page.screenshot({path:join(output,mode+'-ready-zh-CN.png')});

      await chooseLanguage('zh-TW');assert.equal(await scope.locator('#task-own-row dt').textContent(),'目前代理');
      snapshots[ids.root]=task(own,[child],{state:'partial',subagents:2,loadedSubagents:1});
      await expectText('cache-note','部分子代理暫時無法讀取');await expectText('task-subagents','5,900 tok');
      await expectMarker(false,'僅目前代理；子代理統計暫時無法取得');
      await expectText('cache-coverage','11,400 tok');
      assert.equal(await scope.locator('#cache-write-row').isVisible(),false);
      await chooseLanguage('en');await expectText('cache-note','Some subagents unavailable');
      assert.equal(await scope.locator('#task-own-row dt').textContent(),'Current agent');
      await expectOwn(own);
      snapshots[ids.root]=task(own,[child,leaf]);await expectText('cache-coverage','12,600 tok');
      await expectText('cache-note','');
      const callsBefore=metricCalls;
      const stable=await page.evaluate(async inline=>{
        const root=inline?document.getElementById('ag-pulse-status-bar').shadowRoot:document;
        const card=root.getElementById('cache-card'),chip=root.querySelector('[data-card=cache]');
        card.scrollTop=20;const scroll=card.scrollTop,changes=[];
        const observer=new MutationObserver(records=>changes.push(...records.map(record=>({id:record.target.id,type:record.type,attribute:record.attributeName}))));
        observer.observe(card,{subtree:true,childList:true,characterData:true,attributes:true});
        observer.observe(chip,{subtree:true,childList:true,characterData:true,attributes:true});
        await new Promise(resolve=>setTimeout(resolve,6500));observer.disconnect();
        return {changes,scrollBefore:scroll,scrollAfter:card.scrollTop};
      },inline);
      assert.ok(metricCalls-callsBefore>=2,'Observe at least two real polling refreshes');
      assert.deepEqual(stable.changes,[],`${mode}: unchanged task/cache data must not mutate the card or pill on polling`);
      assert.equal(stable.scrollAfter,stable.scrollBefore);

      // Open a child which owns a grandchild: its own values, not the root's,
      // must remain the first breakdown row and the rate/context source.
      const navigate=async id=>{
        await page.evaluate(({mode,id})=>{
          if(mode==='panel'){sidecar.conversationId=id;document.getElementById('refresh-button').click();}
          else if(mode==='ide')testOwner.props.cascadeId=id;
          else history.pushState({},'', '/c/'+id);
        },{mode,id});
      };
      await navigate(ids.child);await expectText('cache-coverage','7,100 tok');
      await expectText('task-own','5,900 tok');await expectText('task-subagents','1,200 tok');
      await expectText('task-subagents-label','Subagents (1)');
      await expectText(inline?'cache-detail-rate':'cache-rate','57.4%');await expectOwn(child);
      await navigate(ids.leaf);await expectText('cache-coverage','1,200 tok');await openCache();
      assert.equal(await scope.locator('#task-own-row').isVisible(),false);
      assert.equal(await scope.locator('#task-subagents-row').isVisible(),false);
      assert.equal(await scope.locator('#cache-note').isVisible(),false);await expectOwn(leaf);
      // Even an irrelevant zero-child aggregate cannot replace own usage.
      snapshots[ids.leaf]={...leaf,taskUsage:{...task(own,[child]).taskUsage,subagents:0}};
      const previousCalls=metricCalls;await page.waitForTimeout(3300);assert.ok(metricCalls>previousCalls);
      await expectText('cache-coverage','1,200 tok');
      assert.equal(await scope.locator('#task-own-row').isVisible(),false);
      results.push({renderer:mode,aggregateVsOwn:true,nestedChild:true,languages:['en','zh-CN','zh-TW'],loadingToReady:true,partial:true,singleSession:true,stableCachePolling:stable});
    }finally{await page.close();}
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({results,pageErrors:errors,screenshots:output},null,2));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
