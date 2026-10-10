// Production widget in illustrative host fixtures. No account data is read.
// Stage for review: node tools/build-readme-assets.mjs --output=.data/readme-review
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {trajectoryMetrics} from '../sidecars/panel/metrics.mjs';
const repo=join(dirname(fileURLToPath(import.meta.url)),'..');
const version=JSON.parse(await readFile(join(repo,'plugin.json'),'utf8')).version;
const output=resolve(repo,process.argv.find(x=>x.startsWith('--output='))?.slice(9)||'docs/assets');
const sources=await Promise.all(['i18n.cjs','theme.cjs','inline-widget.cjs'].map(f=>readFile(join(repo,'compat',f),'utf8')));
const extract=s=>{assert.ok(s.includes('module.exports = '));return s.slice(s.indexOf('module.exports = ')+17).trim().replace(/;$/,'');};
const install=`window.__agPulseI18nFactory=(${extract(sources[0])});window.__agPulseThemeFactory=(${extract(sources[1])});(${extract(sources[2])})();`;
const ids={main:'11111111-1111-1111-1111-111111111111',subagent:'22222222-2222-2222-2222-222222222222'};
const now=Date.now(),files=[],diagnostics=[],errors=[];
const reset=ms=>new Date(now+ms).toISOString();
function sample(scope){
 const sub=scope==='subagent';
 const steps=Array.from({length:sub?2:5},(_,i)=>[
  {type:'USER_INPUT'},{type:'READ_FILE',metadata:{startedAt:new Date(now-60000+i*10000).toISOString(),completedAt:new Date(now-60000+i*10000+(sub?1000:1600)).toISOString()}},{type:'ASSISTANT_RESPONSE'},
 ]).flat();
 const speed=trajectoryMetrics({trajectory:{cascadeId:ids[scope],steps,generatorMetadata:Array.from({length:sub?2:5},(_,i)=>({chatModel:{
  modelDisplayName:sub?'Claude Sonnet':'Gemini 3.8 Flash High',streamingDuration:sub?'4s':'10s',timeToFirstToken:sub?'0.4s':'0.6s',
  chatStartMetadata:{contextWindowMetadata:{estimatedTokensUsed:sub?24000:92000+i*5000,maxContextTokens:sub?200000:256000}},
  usage:{inputTokens:sub?3200:18850,cacheReadTokens:sub?9600:97600,responseOutputTokens:sub?640:1046,thinkingOutputTokens:sub?0:(i===4?405:406),outputTokens:sub?640:(i===4?1451:1452),apiProvider:sub?'API_PROVIDER_ANTHROPIC':'API_PROVIDER_GOOGLE_GEMINI'},
 }}))}});
 return {connection:'live',serverTime:new Date(now).toISOString(),quotaUpdatedAt:new Date(now).toISOString(),speed,groups:[
  {id:'gemini',name:'Gemini',windows:{'5h':{available:true,remaining:.834,resetAt:reset(9978000)},weekly:{available:true,remaining:.617,resetAt:reset(393246000)}}},
  {id:'3p',name:'Claude / GPT',windows:{'5h':{available:true,remaining:.742,resetAt:reset(7812000)},weekly:{available:true,remaining:.469,resetAt:reset(327846000)}}},
 ]};
}
const hostIcon=name=>`<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${{add:'<path d="M12 5v14M5 12h14"/>',mic:'<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 11v2a6 6 0 0 0 12 0v-2M12 19v3"/>',send:'<path d="M12 19V5m-6 6 6-6 6 6"/>'}[name]}</svg>`;
function fixture(lang,scope,width){
 const zh=lang==='zh',sub=scope==='subagent';
 const anchor=sub?'<div class="identity" title="layout-reviewer"><svg viewBox="0 0 16 16"><path d="M3 4h10v8H3zM6 1v3m4-3v3M6 12v3m4-3v3"/></svg><span>layout-reviewer</span></div>':'<div class="model-branch"><button data-testid="model-selector-trigger">Gemini 3.8 Flash High <span>⌃</span></button></div>';
 return `<!doctype html><html lang="${zh?'zh-CN':'en'}"><meta charset="utf-8"><style>
 *{box-sizing:border-box}body{margin:0;padding:14px;background:#17191d;color:#c7cbd3;font:12px "Segoe UI","Microsoft YaHei",sans-serif}.composer{width:${width}px;max-width:100%;padding:12px;border:1px solid #363b44;border-radius:16px;background:#20242a;margin:0 auto}.editor{height:44px;padding:2px 4px;outline:none;color:#949da9;font-size:13px}.actions,.left,.right{display:flex;align-items:center;gap:5px;height:30px}.left{flex:1;min-width:0}.right{flex:none;gap:8px}.model-branch{display:flex;flex:1 1 200px;min-width:20px;max-width:200px;overflow:hidden}.model-branch button{width:100%;overflow:hidden;text-align:left}.model-branch span{padding-left:5px}.identity{display:flex;align-items:center;gap:6px;padding:4px 6px;flex:none;font-size:11px}.identity svg{width:14px;height:14px;fill:none;stroke:currentColor}.protected{width:28px;flex:none;display:grid;place-items:center}button{font:inherit;border:0;background:transparent;color:#b9c1cd;height:28px;padding:0 4px;white-space:nowrap}.send{border-radius:50%;background:#343c49;color:#d5dcea}
 </style><body data-theme="dark"><section class="composer" data-testid="agent-input-box"><div><div role="textbox" contenteditable="true" class="editor" aria-label="Message input">${zh?'输入消息，@ 提及，/ 选择操作':'Ask anything, @ to mention, / for actions'}</div></div><div class="actions"><div class="left"><button class="protected" aria-label="Add context">${hostIcon('add')}</button>${anchor}</div><div class="right"><button class="protected" aria-label="Record voice memo">${hostIcon('mic')}</button><button class="protected send" data-testid="send-button" aria-label="Send message" disabled>${hostIcon('send')}</button></div></div></section><script>
 history.replaceState({},'', '/c/${ids[scope]}');Date.now=()=>${now};window.agPulseHost={getMetrics:async()=>(${JSON.stringify(sample(scope))}),getPreferences:async()=>({language:'${zh?'zh-CN':'en'}',revision:1}),setPreferences:async x=>({...x,revision:2}),report:()=>{}};
 </script><script src="/widget.js"></script></body></html>`;
}
function board(lang,kind){
 const zh=lang==='zh';
 const frame=(scope,width,hero=false)=>`<iframe title="${scope} demo" src="/fixture?lang=${lang}&scope=${scope}&width=${width}" style="width:${hero?'820px':'100%'};height:136px;border:0;display:block;${hero?'transform:scale(1.35);transform-origin:top left':''}"></iframe>`;
 const note=zh?'当前控件源码渲染 · 宿主界面为示意 · 示例数据':'Current widget source · Illustrative host layout and data';
 const css=`*{box-sizing:border-box}body{margin:0;padding:28px 36px;background:#17191d;color:#f0f3f8;font:14px "Segoe UI","Microsoft YaHei",sans-serif}.brand{font-size:12px;font-weight:600;letter-spacing:1.4px;color:#9fb9ee}h1{font-size:38px;font-weight:600;letter-spacing:-.8px;line-height:1.25;margin:16px 0 10px}p{margin:0;color:#aab5c6;font-size:16px;line-height:1.6}footer{font-size:11px;color:#7f8c9f;margin-top:12px}.hero-frame{height:184px;margin:18px -14px 4px}.features{display:flex;gap:28px;color:#c2cee0;font-size:13px;padding-top:10px;border-top:1px solid #303846}.grid{display:grid;grid-template-columns:440px 1fr;gap:28px;margin-top:20px}h2{font-size:18px;font-weight:600;margin:0 0 5px}.grid p{font-size:13px;margin-bottom:12px}.frame-wrap{margin:0 -14px}.badge{font-size:11px;letter-spacing:.8px;color:#9fb9ee;margin-bottom:8px}`;
 const content=kind==='hero'?`<div class="brand">ANTIGRATIVE DASHBOARD · v${version}</div><h1>${zh?'主对话与子代理，统计都在输入框旁。':'Your agent. Your metrics. In view.'}</h1><p>${zh?'生成速度、缓存与上下文常驻；悬停查看上下文和共享额度。':'Speed, cache and context beside your input. Hover for context and shared quotas.'}</p><div class="hero-frame">${frame('main',790,true)}</div><div class="features"><span>${zh?'主对话 + 子代理':'Main chats + subagents'}</span><span>${zh?'完整数值 ⇄ 三图标':'Full statistics ⇄ three icons'}</span><span>Windows · Linux · macOS</span></div>`:
 `<div class="brand">${zh?'自适应布局 · 子代理独立统计':'RESPONSIVE · SUBAGENT AWARE'}</div><div class="grid"><section><div class="badge">01 · ${zh?'自适应布局':'ADAPTIVE LAYOUT'}</div><h2>${zh?'窗口变窄，入口还在。':'Less room. Same three controls.'}</h2><p>${zh?'保留速度、缓存、上下文图标；悬停或点击查看详情。':'Speed, cache and context stay interactive.'}</p><div class="frame-wrap">${frame('main',440)}</div></section><section><div class="badge">02 · ${zh?'子代理独立统计':'CURRENT SUBAGENT'}</div><h2>${zh?'显示这个子代理自己的数据。':'This child’s metrics, beside its input.'}</h2><p>${zh?'子代理统计与主对话隔离，账号额度共享。':'Child statistics stay separate. Account quotas are shared.'}</p><div class="frame-wrap">${frame('subagent',632)}</div></section></div>`;
 return `<!doctype html><html lang="${zh?'zh-CN':'en'}"><meta charset="utf-8"><style>${css}</style><body>${content}<footer>${note}</footer></body></html>`;
}
const server=createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');let content,type='text/html; charset=utf-8';
 if(url.pathname==='/widget.js'){content=install;type='text/javascript';}
 else if(url.pathname==='/fixture')content=fixture(url.searchParams.get('lang')||'en',url.searchParams.get('scope')==='subagent'?'subagent':'main',Number(url.searchParams.get('width'))||940);
 else if(url.pathname==='/board')content=board(url.searchParams.get('lang')||'en',url.searchParams.get('kind'));
 else{res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':type});res.end(content);
});
server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base=`http://127.0.0.1:${server.address().port}`;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch(process.platform==='win32'&&!process.env.CI?{channel:'msedge',headless:true}:{headless:true});
await mkdir(output,{recursive:true});
async function ready(frame,scope,density){
 await frame.waitForFunction(()=>{const value=document.getElementById('ag-pulse-status-bar')?.shadowRoot.getElementById('tps')?.textContent;return Boolean(value)&&value!=='—';});
 await frame.waitForFunction(({scope,density})=>{const w=document.getElementById('ag-pulse-status-bar');return w?.dataset.layout==='ready'&&w.dataset.scope===scope&&w.dataset.density===density&&!w.dataset.motion;},{scope,density});
 const state=await frame.evaluate(()=>{const w=document.getElementById('ag-pulse-status-bar'),r=w.getBoundingClientRect();return {scope:w.dataset.scope,density:w.dataset.density,context:w.shadowRoot.getElementById('context-percent').textContent,cache:w.shadowRoot.getElementById('cache-rate').textContent,tps:w.shadowRoot.getElementById('tps').textContent,nativeTargetsSafe:[...document.querySelectorAll('.protected')].every(b=>{const q=b.getBoundingClientRect();return Math.min(r.right,q.right)-Math.max(r.left,q.left)<=1||Math.min(r.bottom,q.bottom)-Math.max(r.top,q.top)<=1;})};});
 assert.equal(state.nativeTargetsSafe,true);assert.equal(state.context,scope==='subagent'?'12%':'44%');diagnostics.push(state);
}
async function save(page,name,clip){await page.screenshot({path:join(output,name),...(clip?{clip}:{fullPage:true})});files.push(name);}
try{
 for(const lang of ['en','zh']){
  const suffix=lang==='zh'?'-zh':'';
  for(const kind of ['hero','responsive']){
   if(process.argv.includes('--details-only'))continue;
   const page=await browser.newPage({viewport:{width:1200,height:kind==='hero'?440:286},deviceScaleFactor:2});page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.goto(`${base}/board?lang=${lang}&kind=${kind}`);await page.locator('iframe').first().waitFor();
    const frames=page.frames().filter(f=>f!==page.mainFrame());assert.equal(frames.length,kind==='hero'?1:2);
    if(kind==='hero')await ready(frames[0],'main','full');else{await ready(frames[0],'main','icons');await ready(frames[1],'subagent','full');}
    await page.evaluate(()=>document.fonts.ready);await save(page,`${kind}${suffix}.png`);
   }finally{await page.close();}
  }
  for(const card of ['speed','cache','context']){
   const page=await browser.newPage({viewport:{width:1000,height:920},deviceScaleFactor:2});page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.goto(`${base}/fixture?lang=${lang}&scope=main&width=940`);await ready(page,'main','full');const host=page.locator('#ag-pulse-status-bar');
    await host.locator(`[data-card=${card}]`).hover();await host.locator(`#${card}-card`).waitFor({state:'visible'});
    // Opacity keeps the host topology visible to the production mount checks.
    await page.addStyleTag({content:'.composer{background:transparent!important;border-color:transparent!important}.editor,.actions button,.identity{opacity:0}'});
    await host.locator('.bar').evaluate((bar,card)=>{for(const e of bar.children)if(e.dataset.card!==card)e.style.visibility='hidden';},card);
    const boxes=await Promise.all([host.locator(`[data-card=${card}]`).boundingBox(),host.locator(`#${card}-card`).boundingBox()]);assert.ok(boxes.every(Boolean));
    const pad=20,left=Math.max(0,Math.min(...boxes.map(b=>b.x))-pad),top=Math.max(0,Math.min(...boxes.map(b=>b.y))-pad),right=Math.min(1000,Math.max(...boxes.map(b=>b.x+b.width))+pad),bottom=Math.min(920,Math.max(...boxes.map(b=>b.y+b.height))+pad);
    await save(page,`${card==='cache'?'widget':card}${suffix}.png`,{x:left,y:top,width:right-left,height:bottom-top});
   }finally{await page.close();}
  }
 }
 assert.deepEqual(errors,[]);
 assert.equal(new Set(files).size,files.length,'Every figure needs its own asset');
 await writeFile(join(output,'capture-manifest.json'),JSON.stringify({version,source:'compat/inline-widget.cjs',data:'illustrative',scale:2,files,diagnostics},null,2));
 console.log(JSON.stringify({version,output,files,diagnostics,pageErrors:errors},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
