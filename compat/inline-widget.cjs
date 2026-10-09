// Self-contained main-world UI. Shadow DOM isolates styling from the host app.
module.exports = function installAgPulseInlineWidget() {
  if (window.__agPulseInlineInstalled) return;
  const report=(stage,details={})=>window.agPulseHost?.report?.({stage,...details});
  if (!document.documentElement) {
    document.addEventListener('DOMContentLoaded',installAgPulseInlineWidget,{once:true});
    return;
  }
  if (!window.agPulseHost) return;
  const language=window.__agPulseI18nFactory(localStorage.getItem('ag-pulse-language'));
  const theme=window.__agPulseThemeFactory();
  const t=language.t;
  window.__agPulseInlineInstalled=true;
  report('boot',{hostFound:true});
  const ID='ag-pulse-status-bar';
  let node=null,root=null,data=null,pending=false,cardName=null,hoverTimer=null,lastConversation=null,lastFetch=0,lastExpiredRefresh=0,resizeObserver=null,groupMenu=null,themeController=null;
  let chosen=localStorage.getItem('ag-pulse-group'),group=null;
  const icon=(name)=>({speed:'<path d="M3 12a6 6 0 1 1 10 0M8 9l3-4"/>',cache:'<ellipse cx="8" cy="4" rx="5" ry="2"/><path d="M3 4v8c0 2 10 2 10 0V4M3 8c0 2 10 2 10 0"/>',five:'<circle cx="8" cy="8" r="5.6"/><path d="M8 4.7v3.6l2.3 1.4"/>',week:'<rect x="2.5" y="3.5" width="11" height="10" rx="2"/><path d="M5 2v3m6-3v3M3 7h10"/>'}[name]);
  const svg=name=>`<svg viewBox="0 0 16 16" aria-hidden="true">${name==='context'?'<circle cx="8" cy="8" r="5.6"/><path d="M8 2.4V8l4.8 2.8"/>':icon(name)}</svg>`;
  const pct=n=>typeof n==='number'&&Number.isFinite(n)?`${(n*100).toFixed(1)}%`:'—';
  const rate=n=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:1,minimumFractionDigits:1}):'—';
  const count=n=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('en-US'):'—';
  const compact=n=>typeof n!=='number'||!Number.isFinite(n)?'—':n>=1e9?`${(n/1e9).toFixed(1).replace(/\.0$/,'')}B`:n>=1e6?`${(n/1e6).toFixed(1).replace(/\.0$/,'')}M`:n>=1e3?`${(n/1e3).toFixed(1).replace(/\.0$/,'')}K`:String(n);
  const seconds=language.elapsed;
  const timer=(at,compact=false)=>language.countdown(at,Date.now(),compact);
  const date=language.resetDate;
  const label=g=>/gemini/i.test(g?.name||'')?'Gemini':/claude|gpt/i.test(g?.name||'')?'Claude / GPT':g?.name||t('group');
  const $=id=>root?.getElementById(id);
  const text=(id,value)=>{const e=$(id);if(e&&e.textContent!==String(value))e.textContent=String(value);};
  function localize(){
    node.lang=language.language;
    for(const e of root.querySelectorAll('[data-i18n]'))e.textContent=t(e.dataset.i18n);
    for(const e of root.querySelectorAll('[data-i18n-aria]'))e.setAttribute('aria-label',t(e.dataset.i18nAria));
    for(const e of root.querySelectorAll('[data-i18n-aria][title]'))e.title=t(e.dataset.i18nAria);
    const button=$('language-toggle');button.textContent=language.language==='en'?'EN':'中';button.title=t('switchLanguage');button.setAttribute('aria-label',t('language'));
  }
  function fit(){
    if(!node?.isConnected)return;
    const bar=root.querySelector('.bar');
    node.classList.remove('compact','narrow');
    if(bar.scrollWidth>node.clientWidth+2)node.classList.add('compact');
    if(bar.scrollWidth>node.clientWidth+2)node.classList.add('narrow');
  }
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
    const roomAbove=rect.top-21,roomBelow=window.innerHeight-rect.bottom-21;
    card.style.maxHeight=`${Math.max(80,window.innerHeight-24)}px`;card.style.overflowY='auto';
    card.style.left=`${Math.min(window.innerWidth-width-12,Math.max(12,rect.left+rect.width/2-width/2))}px`;
    const useAbove=card.offsetHeight<=roomAbove || roomAbove>=roomBelow;
    card.style.maxHeight=`${Math.max(80,useAbove?roomAbove:roomBelow)}px`;
    card.style.top=`${Math.max(12,useAbove?rect.top-card.offsetHeight-9:rect.bottom+9)}px`;
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
    if(node){row.insertBefore(node,branch.nextSibling);themeController?.update();position();return;}
    resizeObserver?.disconnect();node?.remove();node=document.createElement('div');node.id=ID;
    node.style.cssText='display:flex;align-items:center;flex:1 1 0%;min-width:0;height:28px;margin:0 5px;position:relative;z-index:60;';
    root=node.attachShadow({mode:'open'});
    root.innerHTML=`<style>${theme.shadowCss()}
      :host{color-scheme:var(--pulse-scheme);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;color:var(--pulse-foreground);font-size:11px}*{box-sizing:border-box}button,select{font:inherit}button{cursor:pointer}svg{width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;flex:none}button:focus-visible,select:focus-visible{outline:2px solid var(--pulse-accent);outline-offset:2px}
      .bar{display:flex;justify-content:flex-start;width:100%;align-items:center;gap:7px;min-height:28px;padding:2px 0}.chip{display:flex;align-items:center;gap:6px;color:var(--pulse-chip);background:none;border:0;border-radius:5px;padding:3px 6px;white-space:nowrap;line-height:18px}.chip:hover,.chip[aria-expanded=true]{background:var(--pulse-hover);color:var(--pulse-hover-text)}.chip strong{font-weight:500;font-variant-numeric:tabular-nums}.dim{color:var(--pulse-muted)}.countdown{font-size:10px;font-variant-numeric:tabular-nums}.dot{width:4px;height:4px;background:var(--pulse-dot);border-radius:50%;flex:none}.dot.live{background:var(--pulse-success)}.dot.stale{background:var(--pulse-warning)}.group{color:var(--pulse-muted);font-size:10px;margin-right:1px}.card{position:fixed;z-index:2147483000;padding:13px 14px 11px;border-radius:13px;background:linear-gradient(145deg,var(--pulse-card),var(--pulse-card-end));box-shadow:0 8px 32px var(--pulse-shadow);border:1px solid var(--pulse-border);color:var(--pulse-foreground);font-size:12px}.card[hidden]{display:none}dl>[hidden]{display:none}.heading{display:flex;align-items:center;justify-content:space-between;padding-bottom:10px;margin-bottom:9px;border-bottom:1px solid var(--pulse-separator);font-weight:600}.heading span{display:flex;align-items:center;gap:7px}.tag{font-size:10px;font-weight:400;color:var(--pulse-muted)}dl{margin:0}dl div{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:8px 0}dt{color:var(--pulse-label);font-size:11px}dd{margin:0;font-size:11px;font-variant-numeric:tabular-nums;text-align:right}.emphasis dd{font-weight:600;color:var(--pulse-emphasis)}.footnote{font-size:10px;color:var(--pulse-subtle);line-height:1.6;margin:10px 0 0}.balance{display:flex;align-items:baseline;gap:8px;margin:12px 0}.balance strong{font-size:27px;font-weight:550;letter-spacing:-.6px;font-variant-numeric:tabular-nums}.balance span{color:var(--pulse-muted);font-size:11px}.track{height:4px;border-radius:3px;background:var(--pulse-track);margin:12px 0 14px;overflow:hidden}.track i{height:100%;display:block;background:var(--pulse-accent);width:0}select{color:var(--pulse-control-text);background:var(--pulse-control);border:0;border-radius:4px;font-size:10px;padding:3px 5px;max-width:120px}.toolbar{display:flex;align-items:center;gap:7px}.refresh{color:var(--pulse-muted);border:0;background:transparent;padding:0 3px;font-size:14px}.reset{color:var(--pulse-emphasis)}.rounds,.group,.dot.live{display:none}.chip[hidden]{display:none}.toolbar{position:relative}.group-trigger{color:var(--pulse-control-text);background:var(--pulse-control);border:0;border-radius:5px;font-size:10px;padding:4px 7px;white-space:nowrap}.group-menu{position:absolute;top:calc(100% + 5px);right:22px;min-width:132px;padding:4px;background:var(--pulse-menu);border:1px solid var(--pulse-border);border-radius:7px;box-shadow:0 6px 20px var(--pulse-shadow);z-index:10}.group-menu[hidden]{display:none}.group-menu button{display:block;width:100%;padding:7px 9px;border:0;border-radius:4px;background:none;color:var(--pulse-foreground);text-align:left;white-space:nowrap}.group-menu button:hover,.group-menu button[aria-selected=true]{background:var(--pulse-selected)}.chip{padding:2px 4px;font-size:10px;gap:4px;min-width:0}.bar{gap:3px}.language-button{border:0;background:none;color:var(--pulse-muted);border-radius:4px;font-size:9px;padding:3px 4px;margin-left:auto;cursor:pointer;flex:none}.language-button:hover{color:var(--pulse-hover-text);background:var(--pulse-hover)}:host(.compact) .countdown{display:none}:host(.narrow) .cache-total{display:none}:host(.narrow) [data-card="cache"] .dim{display:none}:host(.narrow) .chip svg{display:none}:host(.narrow) .chip{padding:2px 3px;font-size:9px}:host(.narrow) .bar{gap:0}

    .context-ring{display:inline-block;flex:none;width:12px;height:12px;border-radius:50%;background:conic-gradient(var(--pulse-ring) var(--used-angle,0deg),var(--pulse-ring-track) 0);mask:radial-gradient(circle,transparent 43%,#000 47%)}:host(.narrow) .context-label{display:none}
    .bar{gap:6px}.chip{font-size:11px;gap:5px;padding:3px 5px}.context-card>strong{font-size:16px}.context-card>p{margin:8px 0}.quota-heading{margin-top:14px;padding-top:12px;border-top:1px solid var(--pulse-separator)}.quota-title{display:flex;align-items:center;gap:6px;font-size:11px}.quota-title>span:first-child{display:flex;align-items:center;gap:6px;margin-right:auto}.quota-title strong{font-variant-numeric:tabular-nums;font-size:13px}.quota-section+.quota-section{border-top:1px solid var(--pulse-separator);margin-top:12px;padding-top:12px}.quota-section .track{margin:8px 0}.quota-section .footnote{margin-top:6px}.quota-section dl div{margin:6px 0}.context-label{white-space:nowrap}
    </style><div class="bar" data-i18n-aria="strip" aria-label="Dashboard statistics">
      <span class="dot" id="dot" title="Connecting"></span><span class="group" id="group-label"></span>
      <button class="chip" data-card="speed" hidden aria-controls="speed-card" aria-expanded="false">${svg('speed')}<span class="rounds dim" id="rounds"></span><strong id="tps">—</strong><span>tok/s</span></button>
      <button class="chip" data-card="cache" hidden aria-controls="cache-card" aria-expanded="false">${svg('cache')}<span class="cache-total" id="cache-total">— tok</span><span class="dim">·</span><span data-i18n="cache">Cache hit</span><strong id="cache-rate">—</strong></button>
      <button class="chip" data-card="context" hidden aria-controls="context-card" aria-expanded="false"><span class="context-ring" id="context-ring" aria-hidden="true"></span><span class="context-label" data-i18n="contextShort">Ctx</span><strong id="context-percent">—</strong></button>
      <button class="language-button" id="language-toggle" aria-label="Language">EN</button>
    </div><section class="card" id="speed-card" role="region" data-i18n-aria="session" aria-label="Session statistics" hidden>
      <div class="heading"><span>${svg('speed')}<span data-i18n="session">Session statistics</span></span><span class="tag" id="samples">—</span></div>
      <dl>${[['modelTime','model-time'],['toolTime','tool-time'],['ttft','ttft'],['sessionTps','session-rate'],['latest','latest-rate'],['tokens','tokens']].map(([key,id])=>`<div><dt data-i18n="${key}">${t(key)}</dt><dd id="${id}">—</dd></div>`).join('')}</dl><p class="footnote" id="rate-note">${t('responseBasis')}</p>
    </section><section class="card" id="cache-card" role="region" data-i18n-aria="cacheTitle" aria-label="Token cache" hidden>
      <div class="heading"><span>${svg('cache')}<span data-i18n="cacheTitle">Token cache</span></span><span class="tag" id="cache-coverage">—</span></div>
      <dl>${[['cacheRate','cache-detail-rate'],['cacheMiss','cache-miss'],['cacheRead','cache-read'],['cacheOutput','cache-output'],['cacheWrite','cache-write']].map(([key,id])=>`<div ${id==='cache-write'?'id="cache-write-row" hidden':''}><dt data-i18n="${key}">${t(key)}</dt><dd id="${id}">—</dd></div>`).join('')}</dl><p class="footnote" id="cache-note">${t('cacheBasis')}</p>
    </section><section class="card context-card" id="context-card" role="region" data-i18n-aria="context" hidden>
      <div class="heading"><span>${svg('context')}<span data-i18n="context">Context window</span></span></div>
      <strong id="context-summary">—</strong><p id="context-tokens">—</p>
      <div class="track" role="progressbar" data-i18n-aria="context" id="context-track"><i id="context-fill"></i></div>
      <dl><div><dt data-i18n="contextModel">Sampled model</dt><dd id="context-model">—</dd></div></dl><p class="footnote" id="context-note">—</p>
      <div class="heading quota-heading"><span data-i18n="group">Quota group</span><div class="toolbar"><button class="group-trigger" data-i18n-aria="group" aria-haspopup="listbox" aria-expanded="false">Quota ▾</button><div class="group-menu" role="listbox" data-i18n-aria="selectGroup" hidden></div><button class="refresh" data-i18n-aria="refresh" aria-label="Refresh quota" title="Refresh quota">↻</button></div></div>
      <div class="quota-details">${['five','week'].map(name=>`<section class="quota-section" data-i18n-aria="${name}" aria-label="${t(name)}"><div class="quota-title"><span>${svg(name)}<span data-i18n="${name}">${t(name)}</span></span><strong id="${name}-balance">—</strong><span class="dim" data-i18n="remaining">remaining</span></div><div class="track" role="progressbar" data-i18n-aria="${name}" id="${name}-track"><i id="${name}-fill"></i></div><dl><div><dt data-i18n="resetIn">Resets in</dt><dd class="reset" id="${name}-countdown">—</dd></div><div><dt data-i18n="resetTime">Reset time (UTC+8)</dt><dd id="${name}-reset">—</dd></div></dl><p class="footnote" id="${name}-note">${t('loadingQuota')}</p></section>`).join('')}</div>
    </section>`;
    row.insertBefore(node,branch.nextSibling);
    themeController=theme.attach(node,{embedded:true});
    report('mounted',{editorFound:true,composerFound:true});
    resizeObserver=new ResizeObserver(()=>{fit();position();});resizeObserver.observe(node);
    for(const chip of root.querySelectorAll('[data-card]')){
      chip.addEventListener('pointerenter',()=>show(chip.dataset.card));chip.addEventListener('focus',()=>show(chip.dataset.card));chip.addEventListener('click',()=>show(chip.dataset.card));
    }
    node.addEventListener('pointerenter',()=>clearTimeout(hoverTimer));node.addEventListener('pointerleave',()=>{hoverTimer=setTimeout(()=>{if(!root.activeElement&&!groupMenu)hide();},100);});
    root.addEventListener('focusout',()=>setTimeout(()=>{if(!root.activeElement&&!node.matches(':hover'))hide();},0));
    for(const button of root.querySelectorAll('.group-trigger'))button.addEventListener('click',()=>{
      const menu=button.parentElement.querySelector('.group-menu');const opening=menu.hidden;closeGroup();if(opening){groupMenu=menu;menu.hidden=false;button.setAttribute('aria-expanded','true');}
    });
    for(const button of root.querySelectorAll('.refresh'))button.addEventListener('click',()=>refresh(true));
    $('language-toggle').addEventListener('click',()=>{closeGroup();localStorage.setItem('ag-pulse-language',language.toggle());localize();render();tick();position();});
    localize();
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
    root.querySelector('[data-card="cache"]').hidden=!lastConversation;
    const context=speed?.context, hasCapacity=typeof context?.usedFraction==='number';
    root.querySelector('[data-card="context"]').hidden=false;
    text('context-percent',hasCapacity?`${Math.round(context.usedFraction*100)}%`:'—');
    $('context-ring').style.setProperty('--used-angle',`${hasCapacity?Math.min(1,context.usedFraction)*360:0}deg`);
    text('context-summary',hasCapacity?t('contextUsed',{used:Math.round(context.usedFraction*100),remaining:Math.round(context.remainingFraction*100)}):t('contextUnknown'));
    text('context-tokens',context?t('contextTokens',{used:compact(context.usedTokens),max:context.maxTokens===null?'—':compact(context.maxTokens)}):'—');
    text('context-model',context?.model||'—');
    const restored=context&&(speed.contextRestored===true||speed.restoredFromHistory&&speed.contextRestored!==false);
    text('context-note',(context?t('contextBasis'):t('contextUnavailable'))+(restored?' '+t('contextSaved',{time:speed.savedAt?language.resetDate(speed.savedAt):'—'}):'')+(hasCapacity&&context.usedFraction>1?' '+t('contextExceeded'):''));
    $('context-fill').style.width=hasCapacity?`${Math.min(1,context.usedFraction)*100}%`:'0%';
    $('context-fill').style.background=hasCapacity&&context.usedFraction>=.9?'var(--pulse-danger)':'';
    if(hasCapacity){$('context-track').setAttribute('aria-valuenow',String(Math.min(100,context.usedFraction*100)));$('context-track').setAttribute('aria-valuemin','0');$('context-track').setAttribute('aria-valuemax','100');}else $('context-track').removeAttribute('aria-valuenow');
    text('tps',rate(speed?.tps));text('rounds',speed?t('rounds',{rounds:speed.rounds,steps:speed.steps}):'');
    text('samples',speed?t('sample',{rounds:speed.rounds,steps:speed.steps,requests:speed.measuredRequests}):t('waitingRequest'));text('model-time',seconds(speed?.modelSeconds));text('tool-time',seconds(speed?.toolSeconds));text('ttft',seconds(speed?.ttftSeconds));text('session-rate',`${rate(speed?.tps)} tok/s`);text('latest-rate',`${rate(speed?.latestTps)} tok/s`);text('tokens',speed?`${count(speed.counts.responseOutput)} / ${count(speed.counts.thinkingOutput)} tok`:'—');
    const basis=t(speed?.rateBasis==='all-output'?'allBasis':'responseBasis');
    const savedNote=speed?.restoredFromHistory?' '+t('savedStats',{time:speed.savedAt?language.resetDate(speed.savedAt):'—'}):'';
    const saveWarning=data.persistenceError?' '+t('saveFailed'):'';
    text('rate-note',(language.errorMessage(data.error||data.sessionError)||(!speed?t('waitingRequest'):basis+(speed.missingTiming?' '+t('missingTime',{n:speed.missingTiming}):'')+(/RUNNING/.test(speed.status||'')?' '+t('running'):'')))+savedNote+saveWarning);
    const cache=speed?.cache;
    text('cache-rate',pct(cache?.hitRate));text('cache-detail-rate',pct(cache?.hitRate));
    text('cache-total',cache?.measuredRequests?`${compact(cache.totalTokens)} tok`:'— tok');
    text('cache-coverage',cache?.measuredRequests?`${count(cache.totalTokens)} tok`:'— tok');
    for(const [field,id]of[['cachedTokens','cache-read'],['uncachedTokens','cache-miss'],['cacheWriteTokens','cache-write'],['outputTokens','cache-output']])text(id,cache?.measuredRequests?`${count(cache[field])} tok`:'—');
    $('cache-write-row').hidden=!(cache?.cacheWriteTokens>0);
    text('cache-note',(cache?.measuredRequests?t('cacheBasis')+(cache.missingRequests?' '+t('cacheMissing',{n:cache.missingRequests}):''):t('cacheUnavailable'))+savedNote+saveWarning);
    for(const [window,name]of[['5h','five'],['weekly','week']]){
      const b=group?.windows?.[window];text(name,pct(b?.remaining));text(`${name}-balance`,pct(b?.remaining));text(`${name}-reset`,date(b?.resetAt));
      $(`${name}-fill`).style.width=typeof b?.remaining==='number'?`${b.remaining*100}%`:'0%';$(`${name}-fill`).style.background=b?.remaining<.05?'var(--pulse-danger)':b?.remaining<.2?'var(--pulse-warning)':'';
      if(typeof b?.remaining==='number'){$(`${name}-track`).setAttribute('aria-valuenow',String(b.remaining*100));$(`${name}-track`).setAttribute('aria-valuemin','0');$(`${name}-track`).setAttribute('aria-valuemax','100');}else $(`${name}-track`).removeAttribute('aria-valuenow');
      text(`${name}-note`,language.errorMessage(data.error)||(b?.disabled?t('disabledQuota'):!b?.available?t('noQuota'):t('sharedQuota')+' '+t('updated',{time:data.quotaUpdatedAt?new Date(data.quotaUpdatedAt).toLocaleTimeString(language.language,{hour12:false}):'—'})));
    }
    $('dot').className=`dot ${data.connection}`;$('dot').title=t(data.connection==='live'?'live':data.connection==='stale'?'stale':'offline');tick();fit();position();
  }
  function tick(){
    if(!root)return;
    for(const [window,name]of[['5h','five'],['weekly','week']]){const b=group?.windows?.[window];text(`${name}-timer`,timer(b?.resetAt,true));text(`${name}-countdown`,timer(b?.resetAt));if(b?.resetAt&&Date.parse(b.resetAt)<=Date.now()&&Date.now()-lastExpiredRefresh>30000){lastExpiredRefresh=Date.now();refresh(true);}}
  }
  async function refresh(force=false){
    if(pending||!node?.isConnected)return;
    const conversation=location.pathname.match(/\/c\/([0-9a-f-]{36})/i)?.[1]||null;
    if(conversation!==lastConversation){lastConversation=conversation;data={connection:'offline',groups:[],speed:null};group=null;hide();render();}
    pending=true;lastFetch=Date.now();
    try{const result=await window.agPulseHost.getMetrics({conversationId:conversation,force});if(conversation!==lastConversation)return;node.style.visibility=result.enabled===false?'hidden':'';if(result.enabled===false){hide();return;}if(!conversation)result.speed=null;data=result;render();}
    catch{if(data){data.connection='stale';data.error=t('reconnecting');render();}}
    finally{pending=false;}
  }
  const observer=new MutationObserver(()=>{if(!node?.isConnected)mount();});observer.observe(document.documentElement,{childList:true,subtree:true});
  const onKey=e=>{if(e.key==='Escape')hide();}, onPointer=e=>{if(node&&!e.composedPath().includes(node))hide();};
  document.addEventListener('keydown',onKey);document.addEventListener('pointerdown',onPointer);
  window.addEventListener('resize',position);document.addEventListener('scroll',position,true);
  const onStorage=event=>{if(event.key==='ag-pulse-language'){language.setLanguage(event.newValue);if(root){closeGroup();localize();render();tick();position();}}};
  window.addEventListener('storage',onStorage);
  const timerId=setInterval(()=>{mount();tick();const conversation=location.pathname.match(/\/c\/([0-9a-f-]{36})/i)?.[1]||null;if(conversation!==lastConversation||Date.now()-lastFetch>(document.hidden?10000:2200))refresh();},1000);
  window.__agPulseDispose=()=>{
    clearInterval(timerId);clearTimeout(hoverTimer);observer.disconnect();resizeObserver?.disconnect();themeController?.dispose();hide();node?.remove();
    document.removeEventListener('keydown',onKey);document.removeEventListener('pointerdown',onPointer);
    document.removeEventListener('scroll',position,true);window.removeEventListener('resize',position);window.removeEventListener('storage',onStorage);
    document.removeEventListener('DOMContentLoaded',mount);node=null;root=null;
    window.__agPulseInlineInstalled=false;delete window.__agPulseDispose;
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
};
