// Self-contained main-world UI. Shadow DOM isolates styling from the host app.
module.exports = function installAgPulseInlineWidget() {
  if (window.__agPulseInlineInstalled) return;
  const report=(stage,details={})=>window.agPulseHost?.report?.({stage,...details});
  if (!document.documentElement) {
    document.addEventListener('DOMContentLoaded',installAgPulseInlineWidget,{once:true});
    return;
  }
  if (!window.agPulseHost) return;
  window.__agPulseInlineInstalled=true;
  report('boot',{hostFound:true});
  const ID='ag-pulse-status-bar';
  let node=null,root=null,data=null,pending=false,cardName=null,hoverTimer=null,lastConversation=null,lastFetch=0,lastExpiredRefresh=0,resizeObserver=null,groupMenu=null;
  let chosen=localStorage.getItem('ag-pulse-group'),group=null;
  const icon=(name)=>({speed:'<path d="M3 12a6 6 0 1 1 10 0M8 9l3-4"/>',five:'<circle cx="8" cy="8" r="5.6"/><path d="M8 4.7v3.6l2.3 1.4"/>',week:'<rect x="2.5" y="3.5" width="11" height="10" rx="2"/><path d="M5 2v3m6-3v3M3 7h10"/>'}[name]);
  const svg=name=>`<svg viewBox="0 0 16 16" aria-hidden="true">${icon(name)}</svg>`;
  const pct=n=>typeof n==='number'&&Number.isFinite(n)?`${(n*100).toFixed(1)}%`:'—';
  const rate=n=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:1,minimumFractionDigits:1}):'—';
  const count=n=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('en-US'):'—';
  const seconds=n=>typeof n==='number'&&Number.isFinite(n)?n<60?`${n.toFixed(2)} 秒`:`${Math.floor(n/60)}分${Math.round(n%60)}秒`:'—';
  const timer=(at,compact=false)=>{const date=Date.parse(at);if(!Number.isFinite(date))return '—';if(date<=Date.now())return '等待刷新';let s=Math.ceil((date-Date.now())/1000),d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);const pad=n=>String(n).padStart(2,'0');return `${d?`${d}天 `:''}${pad(h)}:${pad(m)}${compact&&d?'':`:${pad(s%60)}`}`;};
  const date=at=>{const value=new Date(at);return Number.isFinite(value.getTime())?new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Shanghai'}).format(value):'—';};
  const label=g=>/gemini/i.test(g?.name||'')?'Gemini':/claude|gpt/i.test(g?.name||'')?'Claude / GPT':g?.name||'额度';
  const $=id=>root?.getElementById(id);
  const text=(id,value)=>{const e=$(id);if(e&&e.textContent!==String(value))e.textContent=String(value);};
  function closeGroup(){for(const e of root?.querySelectorAll('.group-menu')||[])e.hidden=true;for(const e of root?.querySelectorAll('.group-trigger')||[])e.setAttribute('aria-expanded','false');groupMenu=null;}
  function hide(){closeGroup();cardName=null;for(const e of root?.querySelectorAll('[data-card]')||[])e.setAttribute('aria-expanded','false');for(const e of root?.querySelectorAll('.card')||[])e.hidden=true;}
  function show(name){
    if(cardName!==name)closeGroup();
    clearTimeout(hoverTimer);cardName=name;
    for(const e of root.querySelectorAll('[data-card]'))e.setAttribute('aria-expanded',String(e.dataset.card===name));
    for(const e of root.querySelectorAll('.card'))e.hidden=e.id!==`${name}-card`;
    position();
  }
  function position(){
    if(!cardName)return;
    const button=root.querySelector(`[data-card="${cardName}"]`),card=$(`${cardName}-card`),rect=button.getBoundingClientRect();
    const width=Math.min(310,window.innerWidth-24);card.style.width=`${width}px`;
    card.style.left=`${Math.min(window.innerWidth-width-12,Math.max(12,rect.left+rect.width/2-width/2))}px`;
    card.style.top=`${Math.max(12,rect.top-card.offsetHeight-9)}px`;
  }
  function mount(){
    const editor=document.querySelector('[aria-label="Message input"]');
    if(!editor){if(node?.isConnected){hide();node.remove();}return;}
    const model=document.querySelector('button[data-testid="model-selector-trigger"]')||document.querySelector('button[aria-label^="Select model"]');
    if(!model)return;
    let row=model.parentElement;
    for(let i=0;i<8&&row;i++,row=row.parentElement){
      if(!row.contains(editor)&&row.querySelector('button[aria-label="Record voice memo"],button[aria-label="Stop recording"],button[aria-label="Send message"]'))break;
    }
    if(!row||row===document.body||row.contains(editor))return;
    let branch=model;while(branch.parentElement!==row)branch=branch.parentElement;
    branch.style.flex='0 1 auto';
    branch.style.minWidth='0';
    if(node?.isConnected&&node.parentElement===row&&node.previousElementSibling===branch)return;
    if(node){row.insertBefore(node,branch.nextSibling);position();return;}
    resizeObserver?.disconnect();node?.remove();node=document.createElement('div');node.id=ID;
    node.style.cssText='display:flex;align-items:center;flex:1 1 0%;min-width:0;height:28px;margin:0 5px;position:relative;z-index:60;';
    root=node.attachShadow({mode:'open'});
    root.innerHTML=`<style>
      :host{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;color:#b9bcc4;font-size:11px}*{box-sizing:border-box}button,select{font:inherit}button{cursor:pointer}svg{width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;flex:none}button:focus-visible,select:focus-visible{outline:2px solid #88aaff;outline-offset:2px}
      .bar{display:flex;justify-content:flex-start;width:100%;align-items:center;gap:7px;min-height:28px;padding:2px 0}.chip{display:flex;align-items:center;gap:6px;color:#aaaeb6;background:none;border:0;border-radius:5px;padding:3px 6px;white-space:nowrap;line-height:18px}.chip:hover,.chip[aria-expanded=true]{background:#292b2e;color:#d9dce2}.chip strong{font-weight:500;font-variant-numeric:tabular-nums}.dim{color:#858b94}.countdown{font-size:10px;font-variant-numeric:tabular-nums}.dot{width:4px;height:4px;background:#777c84;border-radius:50%;flex:none}.dot.live{background:#8bb19b}.dot.stale{background:#dbb47e}.group{color:#858b94;font-size:10px;margin-right:1px}.card{position:fixed;z-index:2147483000;padding:13px 14px 11px;border-radius:13px;background:linear-gradient(145deg,#2a2c2f,#303235);box-shadow:0 8px 32px #0005;border:1px solid #ffffff08;color:#e1e3e7;font-size:12px}.card[hidden]{display:none}.heading{display:flex;align-items:center;justify-content:space-between;padding-bottom:10px;margin-bottom:9px;border-bottom:1px solid #ffffff15;font-weight:600}.heading span{display:flex;align-items:center;gap:7px}.tag{font-size:10px;font-weight:400;color:#adb2ba}dl{margin:0}dl div{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:8px 0}dt{color:#b8bdc5;font-size:11px}dd{margin:0;font-size:11px;font-variant-numeric:tabular-nums;text-align:right}.emphasis dd{font-weight:600;color:#dbe5ff}.footnote{font-size:10px;color:#969da8;line-height:1.6;margin:10px 0 0}.balance{display:flex;align-items:baseline;gap:8px;margin:12px 0}.balance strong{font-size:27px;font-weight:550;letter-spacing:-.6px;font-variant-numeric:tabular-nums}.balance span{color:#a7adb7;font-size:11px}.track{height:4px;border-radius:3px;background:#ffffff15;margin:12px 0 14px;overflow:hidden}.track i{height:100%;display:block;background:#85a8ff;width:0}select{color:#c2c7d1;background:#383b3f;border:0;border-radius:4px;font-size:10px;padding:3px 5px;max-width:120px}.toolbar{display:flex;align-items:center;gap:7px}.refresh{color:#afb6c2;border:0;background:transparent;padding:0 3px;font-size:14px}.reset{color:#dbe5ff}.rounds,.group,.dot.live{display:none}.chip[hidden]{display:none}.toolbar{position:relative}.group-trigger{color:#c2c7d1;background:#383b3f;border:0;border-radius:5px;font-size:10px;padding:4px 7px;white-space:nowrap}.group-menu{position:absolute;top:calc(100% + 5px);right:22px;min-width:132px;padding:4px;background:#303338;border:1px solid #555a64;border-radius:7px;box-shadow:0 6px 20px #0005;z-index:10}.group-menu[hidden]{display:none}.group-menu button{display:block;width:100%;padding:7px 9px;border:0;border-radius:4px;background:none;color:#d4d8df;text-align:left;white-space:nowrap}.group-menu button:hover,.group-menu button[aria-selected=true]{background:#444950}.chip{padding:2px 4px;font-size:10px;gap:4px;min-width:0}.bar{gap:3px}:host(.compact) .countdown{display:none}:host(.narrow) .chip svg{display:none}:host(.narrow) .chip{padding:2px 3px;font-size:9px}:host(.narrow) .bar{gap:0}

    </style><div class="bar" aria-label="Antigrative Dashboard 会话与额度状态条">
      <span class="dot" id="dot" title="等待连接"></span><span class="group" id="group-label"></span>
      <button class="chip" data-card="speed" hidden aria-controls="speed-card" aria-expanded="false">${svg('speed')}<span class="rounds dim" id="rounds"></span><strong id="tps">—</strong><span>tok/s</span></button>
      <button class="chip" data-card="five" aria-controls="five-card" aria-expanded="false">${svg('five')}<span>5h</span><strong id="five">—</strong><span class="countdown dim" id="five-timer">—</span></button>
      <button class="chip" data-card="week" aria-controls="week-card" aria-expanded="false">${svg('week')}<span>周</span><strong id="week">—</strong><span class="countdown dim" id="week-timer">—</span></button>
    </div><section class="card" id="speed-card" role="region" aria-label="会话统计" hidden>
      <div class="heading"><span>${svg('speed')}会话统计</span><span class="tag" id="samples">—</span></div>
      <dl><div><dt>模型调用用时</dt><dd id="model-time">—</dd></div><div><dt>工具调用用时</dt><dd id="tool-time">—</dd></div><div><dt>首 token 平均（TTFT）</dt><dd id="ttft">—</dd></div><div class="emphasis"><dt>会话输出速率（TPS）</dt><dd id="session-rate">—</dd></div><div><dt>最近一次请求</dt><dd id="latest-rate">—</dd></div><div><dt>正文 / 思考输出</dt><dd id="tokens">—</dd></div></dl><p class="footnote" id="rate-note">统计来自已完成的模型请求。</p>
    </section>${['five','week'].map((name,i)=>`<section class="card" id="${name}-card" role="region" aria-label="${i?'周':'5h'}额度" hidden><div class="heading"><span>${svg(name)}${i?'周':'5h'}额度</span><div class="toolbar"><button class="group-trigger" aria-label="额度组" aria-haspopup="listbox" aria-expanded="false">额度 ▾</button><div class="group-menu" role="listbox" aria-label="选择额度组" hidden></div><button class="refresh" aria-label="刷新额度" title="刷新额度">↻</button></div></div><div class="balance"><strong id="${name}-balance">—</strong><span>剩余</span></div><div class="track" role="progressbar" aria-label="${i?'周':'5h'}剩余额度" id="${name}-track"><i id="${name}-fill"></i></div><dl><div><dt>重置倒计时</dt><dd class="reset" id="${name}-countdown">—</dd></div><div><dt>重置时间（北京时间）</dt><dd id="${name}-reset">—</dd></div></dl><p class="footnote" id="${name}-note">正在读取额度。</p></section>`).join('')}`;
    row.insertBefore(node,branch.nextSibling);
    report('mounted',{editorFound:true,composerFound:true});
    resizeObserver=new ResizeObserver(()=>{const w=node.getBoundingClientRect().width;node.classList.toggle('compact',w<370);node.classList.toggle('narrow',w<240);position();});resizeObserver.observe(node);
    for(const chip of root.querySelectorAll('[data-card]')){
      chip.addEventListener('pointerenter',()=>show(chip.dataset.card));chip.addEventListener('focus',()=>show(chip.dataset.card));chip.addEventListener('click',()=>show(chip.dataset.card));
    }
    node.addEventListener('pointerenter',()=>clearTimeout(hoverTimer));node.addEventListener('pointerleave',()=>{hoverTimer=setTimeout(()=>{if(!root.activeElement&&!groupMenu)hide();},100);});
    root.addEventListener('focusout',()=>setTimeout(()=>{if(!root.activeElement&&!node.matches(':hover'))hide();},0));
    for(const button of root.querySelectorAll('.group-trigger'))button.addEventListener('click',()=>{
      const menu=button.parentElement.querySelector('.group-menu');const opening=menu.hidden;closeGroup();if(opening){groupMenu=menu;menu.hidden=false;button.setAttribute('aria-expanded','true');}
    });
    for(const button of root.querySelectorAll('.refresh'))button.addEventListener('click',()=>refresh(true));
    render();refresh();
  }
  function render(){
    if(!root||!data)return;
    if(groupMenu)return;
    const groups=data.groups||[],model=document.querySelector('button[aria-label^="Select model"]')?.getAttribute('aria-label')||data.speed?.model||'';
    group=groups.find(g=>g.id===chosen)||groups.find(g=>/gemini/i.test(model)?/gemini/i.test(g.id):/claude|gpt/i.test(model)?/3p|claude|gpt/i.test(g.id):false)||groups[0];
    text('group-label',label(group));
    const automatic=groups.find(g=>/gemini/i.test(model)?/gemini/i.test(g.id):/claude|gpt/i.test(model)?/3p|claude|gpt/i.test(g.id):false);
    $('group-label').style.display=chosen&&automatic&&group?.id!==automatic.id?'inline':'none';
    for(const button of root.querySelectorAll('.group-trigger')){
      if(button.textContent!==`${label(group)} ▾`)button.textContent=`${label(group)} ▾`;
      const menu=button.parentElement.querySelector('.group-menu'),signature=groups.map(g=>g.id).join('|');
      if(menu.dataset.signature!==signature){menu.replaceChildren(...groups.map(g=>{const option=document.createElement('button');option.type='button';option.setAttribute('role','option');option.textContent=label(g);option.dataset.group=g.id;option.addEventListener('click',()=>{chosen=g.id;localStorage.setItem('ag-pulse-group',chosen);closeGroup();render();});return option;}));menu.dataset.signature=signature;}
      for(const option of menu.children)option.setAttribute('aria-selected',String(option.dataset.group===group?.id));
    }
    const speed=data.speed;
    root.querySelector('[data-card="speed"]').hidden=!lastConversation;
    text('tps',rate(speed?.tps));text('rounds',speed?`${speed.rounds}轮 ${speed.steps}步 ·`:'');
    text('samples',speed?`${speed.rounds}轮 ${speed.steps}步 · ${speed.measuredRequests} 次采样`:'尚无请求');text('model-time',seconds(speed?.modelSeconds));text('tool-time',seconds(speed?.toolSeconds));text('ttft',seconds(speed?.ttftSeconds));text('session-rate',`${rate(speed?.tps)} tok/s`);text('latest-rate',`${rate(speed?.latestTps)} tok/s`);text('tokens',speed?`${count(speed.counts.responseOutput)} / ${count(speed.counts.thinkingOutput)} tok`:'—');
    const basis=speed?.rateBasis==='all-output'?'输出 token ÷ 流式生成时长；此模型未拆分正文与思考。':'正文输出 token ÷ 流式生成时长；会话值按总时长加权。';
    text('rate-note',data.error||data.sessionError||(!speed?'此会话尚未生成模型请求。':basis+(speed.missingTiming?` ${speed.missingTiming} 次缺少时长，未计入 TPS。`:'')+(/RUNNING/.test(speed.status||'')?' 生成中，显示已完成请求统计。':'')));
    for(const [window,name]of[['5h','five'],['weekly','week']]){
      const b=group?.windows?.[window];text(name,pct(b?.remaining));text(`${name}-balance`,pct(b?.remaining));text(`${name}-reset`,date(b?.resetAt));
      $(`${name}-fill`).style.width=typeof b?.remaining==='number'?`${b.remaining*100}%`:'0%';$(`${name}-fill`).style.background=b?.remaining<.05?'#e99b9b':b?.remaining<.2?'#d7b079':'';
      if(typeof b?.remaining==='number'){$(`${name}-track`).setAttribute('aria-valuenow',String(b.remaining*100));$(`${name}-track`).setAttribute('aria-valuemin','0');$(`${name}-track`).setAttribute('aria-valuemax','100');}else $(`${name}-track`).removeAttribute('aria-valuenow');
      text(`${name}-note`,data.error||(b?.disabled?'此额度窗口已停用。':!b?.available?'账户未返回此额度窗口。':`同组模型共享额度 · ${data.quotaUpdatedAt?new Date(data.quotaUpdatedAt).toLocaleTimeString('zh-CN',{hour12:false}):'—'} 更新`));
    }
    $('dot').className=`dot ${data.connection}`;$('dot').title=data.connection==='live'?'已连接 Antigrative Dashboard':data.connection==='stale'?'显示上次成功读取的额度':'Antigrative Dashboard 暂未连接';tick();position();
  }
  function tick(){
    if(!root)return;
    for(const [window,name]of[['5h','five'],['weekly','week']]){const b=group?.windows?.[window];text(`${name}-timer`,timer(b?.resetAt,true));text(`${name}-countdown`,timer(b?.resetAt));if(b?.resetAt&&Date.parse(b.resetAt)<=Date.now()&&Date.now()-lastExpiredRefresh>30000){lastExpiredRefresh=Date.now();refresh(true);}}
  }
  async function refresh(force=false){
    if(pending||!node?.isConnected)return;
    const conversation=location.pathname.match(/\/c\/([0-9a-f-]{36})/i)?.[1]||null;
    if(conversation!==lastConversation){lastConversation=conversation;data=null;group=null;text('tps','—');text('rounds','');hide();}
    pending=true;lastFetch=Date.now();
    try{const result=await window.agPulseHost.getMetrics({conversationId:conversation,force});if(conversation!==lastConversation)return;node.style.visibility=result.enabled===false?'hidden':'';if(result.enabled===false){hide();return;}if(!conversation)result.speed=null;data=result;render();}
    catch{if(data){data.connection='stale';data.error='等待控件重新连接';render();}}
    finally{pending=false;}
  }
  const observer=new MutationObserver(()=>{if(!node?.isConnected)mount();});observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});document.addEventListener('pointerdown',e=>{if(node&&!e.composedPath().includes(node))hide();});
  window.addEventListener('resize',position);document.addEventListener('scroll',position,true);
  setInterval(()=>{mount();tick();const conversation=location.pathname.match(/\/c\/([0-9a-f-]{36})/i)?.[1]||null;if(conversation!==lastConversation||Date.now()-lastFetch>(document.hidden?10000:2200))refresh();},1000);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
};
