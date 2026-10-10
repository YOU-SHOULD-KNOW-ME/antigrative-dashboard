// Production widget with translated/semantic host fixtures, not translated selector mocks.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {trajectoryMetrics} from '../sidecars/panel/metrics.mjs';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const sources=await Promise.all(['i18n.cjs','theme.cjs','inline-widget.cjs'].map(f=>readFile(join(root,'compat',f),'utf8')));
const extract=s=>s.slice(s.indexOf('module.exports = ')+17).trim().replace(/;$/,'');
const install=`window.__agPulseI18nFactory=(${extract(sources[0])});window.__agPulseThemeFactory=(${extract(sources[1])});(${extract(sources[2])})();`;
const id='11111111-1111-1111-1111-111111111111';
const metrics={connection:'live',groups:['gemini','3p'].map((id,i)=>({id,name:i?'Claude / GPT':'Gemini',windows:{'5h':{available:true,remaining:i?.42:.83},weekly:{available:true,remaining:.6}}})),
  speed:trajectoryMetrics({trajectory:{cascadeId:id,generatorMetadata:[{chatModel:{modelDisplayName:'Gemini 3.8 Flash High',chatStartMetadata:{contextWindowMetadata:{estimatedTokensUsed:112000,maxContextTokens:256000}},usage:{inputTokens:1000,responseOutputTokens:100,outputTokens:100,cacheReadTokens:100,apiProvider:'API_PROVIDER_GOOGLE_GEMINI'},streamingDuration:'2s'}}]}})};
const escape=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
const wrap=(html,depth)=>{for(let i=0;i<depth;i++)html='<div>'+html+'</div>';return html;};
function composer({lang='zh',role='combobox',testid=true,label=true,depth=0,model='Claude Sonnet',key='main',voice=false}={}){
  const editorLabel=lang==='en'?'Message input':lang==='zh'?'消息输入':'メッセージを入力';
  const modelLabel=lang==='en'?'Select model, current: '+model:lang==='zh'?'选择模型，当前：'+model:'現在のモデル：'+model;
  const editor=`<div class="editor" contenteditable="true" ${role?`role="${role}"`:''} ${label?`aria-label="${escape(editorLabel)}"`:''}></div>`;
  const trigger=`<button ${testid?'data-testid="model-selector-trigger"':'role="combobox" aria-haspopup="listbox"'} ${label?`aria-label="${escape(modelLabel)}"`:''}>${escape(model)}</button>`;
  return `<section class="composer" data-composer="${key}">${wrap(editor,depth)}<div class="actions"><div class="left"><button>＋</button>${wrap(trigger,depth)}</div><div class="right">${voice?'<button aria-label="Record voice memo">○</button>':''}<button class="action" aria-label="取消 (Ctrl+D)">□</button></div></div></section>`;
}
const cases={
  'legacy-english':composer({lang:'en',role:null,model:'Gemini Flash',voice:true}),
  'chinese-localization':composer(),
  'unfamiliar-language':composer({lang:'other'}),
  'semantic-no-labels':composer({role:'textbox',label:false}),
  'semantic-model-fallback':composer({testid:false,lang:'other'}),
  'deep-wrappers':composer({depth:14}),
  'hidden-and-search-decoys':`<section hidden>${composer({key:'hidden'})}</section><section><div role="combobox" contenteditable="true" aria-label="搜索"></div></section>${composer()}`,
  'legacy-with-semantic-decoy':`<section><div role="combobox" contenteditable="true"></div></section>${composer({lang:'en',role:null,model:'Gemini Flash'})}`,
  'ambiguous-composers':composer({key:'first'})+composer({key:'second'}),
  'unrelated-header':`<header><button data-testid="model-selector-trigger">Gemini</button></header><main><div class="editor" role="combobox" contenteditable="true"></div></main>`,
};
const css=`body{margin:0;padding:60px;background:#111;color:#eee;font:14px sans-serif}.composer{max-width:800px;margin:20px auto;background:#202020;border:1px solid #444;border-radius:14px;padding:12px}.editor{height:48px;min-width:100px;outline:none}.actions,.left,.right{display:flex;align-items:center;gap:8px}.actions{justify-content:space-between}.left{flex:1;min-width:0}.right{flex:none}button{border:0;background:none;color:inherit;height:28px;white-space:nowrap}`;
const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1'),key=url.pathname.split('/')[1];
  if(url.pathname==='/widget.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(install);return;}
  if(!cases[key]){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
  res.end(`<!doctype html><html><head><style>${css}</style></head><body>${cases[key]}<script>
    history.replaceState({},'', '/c/${id}');window.testReports=[];
    window.agPulseHost={getMetrics:async()=>(${JSON.stringify(metrics)}),getPreferences:async()=>({language:'zh-CN',languageGuideDismissed:true,revision:1}),setPreferences:async value=>({...value,revision:2}),report:value=>window.testReports.push(value)};
  </script><script src="/widget.js"></script></body></html>`);
});
server.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch(process.platform==='win32'&&!process.env.CI?{channel:'msedge',headless:true}:{headless:true});
const errors=[],results=[];
try{
  for(const key of Object.keys(cases)){
    const page=await browser.newPage({viewport:{width:1100,height:900}});page.on('pageerror',error=>errors.push(error.message));
    try{
      await page.goto(`http://127.0.0.1:${server.address().port}/${key}`);
      const strip=page.locator('#ag-pulse-status-bar');
      if(key==='unrelated-header'||key==='ambiguous-composers'){
        await page.waitForTimeout(1200);assert.equal(await strip.count(),0,'Unsafe topology must not mount an arbitrary strip');
        if(key==='unrelated-header'){results.push({case:key,safe:true});continue;}
        await page.locator('[data-composer=second] .editor').focus();
        await strip.waitFor();assert.equal(await strip.evaluate(e=>e.closest('[data-composer]').dataset.composer),'second');
      }else await strip.waitFor();
      assert.equal(await strip.count(),1);
      const boundary=await strip.evaluate(e=>{const container=e.closest('[data-composer]'),editor=container.querySelector('.editor');return {sameContainer:container.contains(e)&&container.contains(editor),separateBranch:!e.parentElement.contains(editor)};});
      assert.deepEqual(boundary,{sameContainer:true,separateBranch:true});
      await strip.locator('[data-card=context]').hover();
      await strip.locator('#context-summary').waitFor({state:'visible'});
      assert.match(await strip.locator('#context-summary').textContent(),/44%/);
      const expected=key.startsWith('legacy')?'Gemini':'Claude / GPT';
      assert.ok((await strip.locator('.group-trigger').textContent()).includes(expected),'Model selection must read the localized composer control');
      await strip.locator('.group-trigger').click();assert.equal(await strip.locator('.group-menu').isVisible(),true);
      await page.keyboard.press('Escape');
      // Empty/send/cancel/voice states do not change the structural mount.
      await page.evaluate(()=>{for(const b of document.querySelectorAll('.action')){b.setAttribute('aria-label','任意翻译');b.textContent='发送';}});
      await page.waitForTimeout(1100);assert.equal(await strip.count(),1);
      if(key==='chinese-localization'){
        // Replace the host composer, keeping the same conversation and saved stats.
        await page.evaluate(()=>{const old=document.querySelector('[data-composer=main]');const copy=old.cloneNode(true);copy.querySelector('#ag-pulse-status-bar')?.remove();old.replaceWith(copy);});
        await page.waitForFunction(()=>document.getElementById('ag-pulse-status-bar')?.isConnected);
        assert.equal(await strip.count(),1);assert.match(await strip.locator('#context-summary').textContent(),/44%/);
        await page.evaluate(()=>document.querySelector('[data-composer=main]').remove());
        await strip.waitFor({state:'detached'});
        await page.evaluate(markup=>document.body.insertAdjacentHTML('afterbegin',markup),composer());
        await strip.waitFor();assert.equal(await strip.count(),1);
      }
      results.push({case:key,mounted:true});
    }finally{await page.close();}
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({cases:results,pageErrors:errors},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
