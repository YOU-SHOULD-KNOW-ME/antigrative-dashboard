// Self-contained main-world UI. Shadow DOM isolates styling from the host app.
module.exports = function installAgPulseInlineWidget() {
  if (window.__agPulseInlineInstalled) return;
  const report=(stage,details={})=>window.agPulseHost?.report?.({stage,...details});
  if (!document.documentElement) {
    document.addEventListener('DOMContentLoaded',installAgPulseInlineWidget,{once:true});
    return;
  }
  if (!window.agPulseHost) return;
  const localGet=key=>{try{return localStorage.getItem(key);}catch{return null;}};
  const localSet=(key,value)=>{try{localStorage.setItem(key,value);}catch{}};
  const language=window.__agPulseI18nFactory(localGet('ag-pulse-language'));
  const theme=window.__agPulseThemeFactory();
  const t=language.t;
  window.__agPulseInlineInstalled=true;
  report('boot',{hostFound:true});
  const ID='ag-pulse-status-bar';
  let node=null,root=null,data=null,pending=false,cardName=null,hoverTimer=null,lastConversation=null,lastFetch=0,lastExpiredRefresh=0,resizeObserver=null,groupMenu=null,themeController=null,changingCards=false;
  let chosen=localGet('ag-pulse-group'),group=null;
  let refreshRequest=null,manualRequest=null,requestEpoch=0,disposed=false;
  let composer=null,layoutFrame=null;
  let densityFrame=null,densityMotion=null,densityProbe=null;
  const densityMedia=matchMedia('(prefers-reduced-motion: reduce)');
  const densityEase='cubic-bezier(0.32,0.72,0,1)';
  let guideReady=false,guideDismissed=false,guideOpened=false,guideSaving=false,guideError=false;
  function syncGuide(value){if(value?.languageGuideDismissed===true)guideDismissed=true;}
  const preferences=language.connectPreferences({
    read:async()=>{const value=await window.agPulseHost.getPreferences();syncGuide(value);return value;},
    write:async input=>{const value=await window.agPulseHost.setPreferences(input);syncGuide(value);return value;},
    cache:value=>localSet('ag-pulse-language',value),changed:()=>{if(root){localize();render();tick();position();}},
  });
  void preferences.ready.then(()=>{guideReady=!preferences.error;scheduleLayout();});
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
  const conversationId=()=>location.pathname.match(/\/c\/([0-9a-f-]{36})/i)?.[1]||null;
  function syncConversation(){
    const id=conversationId();
    if(id===lastConversation)return false;
    lastConversation=id;requestEpoch++;pending=false;refreshRequest=null;lastFetch=0;
    stopDensityMotion();densityFrame=null;densityProbe=null;
    manualRequest=null;refreshBusy(false);
    data={connection:'offline',groups:[],speed:null};group=null;hide();
    // Navigation has its own refresh budget. A request from the old composer
    // must neither block the new route nor reset its polling clock on arrival.
    queueMicrotask(()=>{if(!disposed)refresh();});return true;
  }
  function localize(){
    node.lang=language.language;
    for(const e of root.querySelectorAll('[data-i18n]'))e.textContent=t(e.dataset.i18n);
    for(const e of root.querySelectorAll('[data-i18n-aria]'))e.setAttribute('aria-label',t(e.dataset.i18nAria));
    for(const e of root.querySelectorAll('[data-i18n-aria][title]'))e.title=t(e.dataset.i18nAria);
    for(const button of root.querySelectorAll('[data-language-choice]')){button.setAttribute('aria-pressed',String(button.dataset.languageChoice===language.language));button.dataset.saveFailed=String(preferences.error);button.title=preferences.error?t('languageSaveFailed'):button.textContent;}
    text('language-save-note',preferences.error?t('languageSaveFailed'):'');
    updateGuide();
  }
  function stopDensityMotion(){
    const motion=densityMotion;densityMotion=null;
    if(!motion)return;
    for(const animation of motion.animations)animation.cancel();
    motion.stage.remove();delete node?.dataset.motion;
  }
  function densitySnapshot(previous){
    const pieces=new Map();
    for(const chip of root.querySelectorAll('.bar .chip'))for(const element of chip.children){
      if(!element.getClientRects().length)continue;
      const style=getComputedStyle(element);
      pieces.set(element,{rect:element.getBoundingClientRect(),opacity:1,font:style.font,color:style.color,icon:element.matches('svg,.context-ring')});
    }
    // Read interrupted copies before changing density. Reading them after the
    // final flex layout moves their parent would bake that shift into the new
    // start position and produce a visible jump on reversal.
    if(previous&&densityMotion)for(const [element,visual]of densityMotion.pieces){
      const piece=pieces.get(element)||densityMotion.sources.get(element);
      if(piece)pieces.set(element,{...piece,rect:visual.getBoundingClientRect(),opacity:Number(getComputedStyle(visual).opacity)});
    }
    return {pieces,rect:node.getBoundingClientRect(),model:composer.model,modelRect:previous?.model===composer.model?previous.modelRect:composer.model?.getBoundingClientRect(),row:composer.row};
  }
  function densityBounds(next){
    const row=next.row.getBoundingClientRect(),target=next.rect;
    let left=Math.max(row.left,composer.anchor?.getBoundingClientRect().right||0),right=Math.min(row.right,innerWidth);
    for(const control of document.querySelectorAll('button,[role="button"],a[href],input,select')){
      if(control===next.model||next.model?.contains(control)||control.contains(next.model))continue;
      const r=control.getBoundingClientRect();
      if(r.width<=0||r.height<=0||Math.min(target.bottom,r.bottom)-Math.max(target.top,r.top)<=1)continue;
      if(control.closest('[hidden],[inert]')||getComputedStyle(control).visibility==='hidden')continue;
      if(!next.row.parentElement.contains(control)){
        if(Math.min(right,r.right)-Math.max(left,r.left)<=0)continue;
        const x=(Math.max(left,r.left)+Math.min(right,r.right))/2,y=(Math.max(target.top,r.top)+Math.min(target.bottom,r.bottom))/2;
        const hit=document.elementFromPoint(x,y);
        if(hit!==control&&!control.contains(hit))continue;
      }
      if(r.right<=target.left+1)left=Math.max(left,r.right);
      else if(r.left>=target.right-1)right=Math.min(right,r.left);
      else return null;
    }
    return right-left>=target.width-2?{left,right}:null;
  }
  function clipDensityMotion(next){
    if(!densityMotion)return;
    const bounds=densityBounds(next);
    if(!bounds){stopDensityMotion();return;}
    // The ribbon follows its parent 1:1 while dragging. Keep its existing
    // compositor animation and clock; only crop to current safe host bounds.
    const stage=densityMotion.stage,r=stage.getBoundingClientRect();
    stage.style.clipPath=`inset(0px ${Math.max(0,r.right-bounds.right)}px 0px ${Math.max(0,bounds.left-r.left)}px)`;
  }
  function animateDensity(previous,next){
    // A narrow composer gives its space straight back to native controls. Only
    // inert visual copies move; the real icons immediately have safe hit boxes.
    // Copies share a clipped ribbon with the model selector's reveal, never the
    // send/mic/add controls. Neither flex widths nor host styles are animated.
    const interrupted=densityMotion;
    const modelOpacity=next.model?getComputedStyle(next.model).opacity:'1';
    stopDensityMotion();
    if(!Element.prototype.animate)return;
    const bounds=densityBounds(next);if(!bounds)return;
    const {left,right}=bounds,target=next.rect;
    const reduce=densityMedia.matches,duration=reduce?120:240;
    const stage=document.createElement('div');stage.className='density-stage';stage.inert=true;stage.setAttribute('aria-hidden','true');
    stage.style.cssText=`left:${left-target.left}px;top:0;width:${right-left}px;height:${target.height}px`;
    root.append(stage);
    const motion={stage,animations:[],pieces:new Map(),sources:new Map([...previous.pieces,...next.pieces])};densityMotion=motion;node.dataset.motion='density';
    const play=(element,frames,options={})=>{const animation=element.animate(frames,{duration,easing:densityEase,...options});motion.animations.push(animation);return animation;};
    for(const element of new Set([...previous.pieces.keys(),...next.pieces.keys()])){
      const from=previous.pieces.get(element),to=next.pieces.get(element),piece=to||from;
      const visual=element.cloneNode(true),end=to?.rect||from.rect;
      for(const part of [visual,...visual.querySelectorAll('*')])for(const attribute of [...part.attributes])if(attribute.name==='id'||attribute.name.startsWith('data-')||attribute.name.startsWith('aria-'))part.removeAttribute(attribute.name);
      const endX=Math.max(left,Math.min(right-end.width,end.left)),endY=end.top-target.top;
      visual.classList.add('density-piece');visual.style.cssText+=`;position:absolute;left:${endX-left}px;top:${endY}px;width:${end.width}px;height:${end.height}px;font:${piece.font};color:${piece.color};margin:0;pointer-events:none;display:block`;
      stage.append(visual);motion.pieces.set(element,visual);
      const start=from?.rect||end;
      const startX=Math.max(left,Math.min(right-start.width,start.left));
      const dx=reduce?0:startX-endX,dy=reduce?0:start.top-end.top;
      const startOpacity=from?.opacity??0,endOpacity=to?1:0;
      play(visual,[{transform:`translate(${dx}px,${dy}px)`,opacity:startOpacity},{transform:'translate(0,0)',opacity:endOpacity}],{fill:'both',...(piece.icon?{}:{duration:to?duration:80})});
      if(to)play(element,[{opacity:0},{opacity:0}],{fill:'both'});
    }
    // The host model name often goes from a caret to a full label as space is
    // returned. Let the outgoing labels leave before revealing that name.
    if(next.model&&previous.model===next.model&&(Math.abs(next.modelRect.width-previous.modelRect.width)>8||interrupted&&Number(modelOpacity)<.999)){
      play(next.model,[{opacity:interrupted?modelOpacity:0},{opacity:1}],{delay:reduce||interrupted?0:100,duration:reduce?120:interrupted?240:140,fill:'backwards'});
    }
    const finish=play(stage,[{opacity:1},{opacity:1}]);
    finish.onfinish=()=>{if(densityMotion===motion){stopDensityMotion();position();}};
  }
  function fit(){
    if(!node?.isConnected)return;
    reserveNativeSpace();
    const bar=root.querySelector('.bar'),oldDensity=node.dataset.density,oldReady=node.dataset.layout==='ready';
    let previous=densityFrame;
    if(['compact','narrow','context-only'].some(c=>node.classList.contains(c)))node.classList.remove('compact','narrow','context-only');
    // Flex shrink alone does not constrain nowrap children or protect controls
    // positioned outside the flex flow (e.g. Agent Manager window buttons).
    const fits=()=>{
      const rect=node.getBoundingClientRect(),row=composer.row.getBoundingClientRect();
      const intersects=other=>Math.min(rect.right,other.right)-Math.max(rect.left,other.left)>1&&Math.min(rect.bottom,other.bottom)-Math.max(rect.top,other.top)>1;
      if(bar.scrollWidth>bar.clientWidth+2||rect.width<=0||rect.left< -1||rect.right>innerWidth+1||rect.top< -1||rect.bottom>innerHeight+1||rect.left<row.left-1||rect.right>row.right+1)return false;
      if(!nativeComfortable())return false;
      if(composer.kind==='subagent'&&intersects(composer.anchor.getBoundingClientRect()))return false;
      for(const control of document.querySelectorAll('button,[role="button"],a[href],input,select,[contenteditable="true"]')){
        const other=control.getBoundingClientRect();
        if(other.width<=0||other.height<=0||!intersects(other))continue;
        if(control.closest('[hidden],[inert]')||getComputedStyle(control).visibility==='hidden')continue;
        // Scrolling messages can put clipped/covered links underneath the
        // fixed composer. Their rectangles alone are not a visible collision.
        // Always reserve local actions; other controls must actually paint at
        // the intersection (e.g. a floating jump-to-bottom button).
        if(composer.row.parentElement.contains(control))return false;
        const left=Math.max(rect.left,other.left),right=Math.min(rect.right,other.right),top=Math.max(rect.top,other.top),bottom=Math.min(rect.bottom,other.bottom);
        for(const [x,y]of [[(left+right)/2,(top+bottom)/2],[left+.5,top+.5],[right-.5,top+.5],[left+.5,bottom-.5],[right-.5,bottom-.5]]){
          const hit=document.elementFromPoint(x,y);
          if(hit===control||control.contains(hit))return false;
        }
      }
      return true;
    };
    let safe=fits();
    const rowWidth=composer.row.getBoundingClientRect().width;
    const probeKey=()=>node.style.cssText.replace(/--pulse-native-room:[^;]+;?/g,'')+'|'+language.language+'|'+lastConversation+'|'+bar.textContent+'|'+$('dot').className+'|'+getComputedStyle(composer.row).gap+'|'+Array.from(composer.row.querySelectorAll('button,[role="button"],a[href],input,select')).filter(c=>c!==composer.model&&!c.contains(composer.model)).map(c=>c.getBoundingClientRect().width).join(',');
    if(oldDensity==='icons'){
      const key=probeKey();
      // Twelve pixels of recovery headroom prevents threshold chatter. Shrinking
      // or scrolling in icon mode never toggles back to full just to measure it.
      if(!densityProbe||key!==densityProbe.key||rowWidth>=densityProbe.width+12){
        previous=densitySnapshot(previous);node.classList.remove('icons-only');safe=fits();
        if(!safe){node.classList.add('icons-only');safe=fits();densityProbe={key,width:rowWidth};}
        else densityProbe=null;
      }
    }else if(!safe){
      previous=densitySnapshot(previous);node.classList.add('icons-only');safe=fits();densityProbe={key:probeKey(),width:rowWidth};
    }
    node.dataset.density=node.classList.contains('icons-only')?'icons':'full';
    const state=safe?'ready':'blocked';
    if(node.dataset.layout!==state){node.dataset.layout=state;node.inert=!safe;if(!safe)hide();}
    const changed=safe&&oldReady&&previous?.row===composer.row&&oldDensity!==node.dataset.density;
    const next=changed?densitySnapshot():{rect:node.getBoundingClientRect(),model:composer.model,modelRect:composer.model?.getBoundingClientRect(),row:composer.row};
    if(changed)animateDensity(previous,next);
    else if(!safe||previous?.row!==composer.row||previous?.model!==composer.model)stopDensityMotion();
    else if(densityMotion)clipDensityMotion(next);
    densityFrame=next;
    updateGuide();
  }
  function captureNative(found){
    const branch=found.branch,r=branch.getBoundingClientRect();
    const baseline={height:r.height,icons:Array.from(branch.querySelectorAll('svg')).map(icon=>({icon,width:icon.getBoundingClientRect().width})),reserve:0};
    if(found.kind==='subagent'){
      const badge=found.anchor,style=getComputedStyle(badge),label=badge.querySelector('span'),range=document.createRange();
      range.selectNodeContents(label);
      // Summed glyph fragments recover intrinsic text width even if the host
      // is already wrapping the badge when we first attach.
      const textWidth=Array.from(range.getClientRects()).reduce((sum,rect)=>sum+rect.width,0);
      const iconWidth=badge.querySelector('svg')?.getBoundingClientRect().width||0;
      const natural=textWidth+Math.max(iconWidth,12)+(parseFloat(style.columnGap)||0)+(parseFloat(style.paddingLeft)||0)+(parseFloat(style.paddingRight)||0);
      baseline.reserve=Math.ceil(Math.max(badge.getBoundingClientRect().width,natural)+badge.getBoundingClientRect().left-r.left+(parseFloat(getComputedStyle(branch).paddingRight)||0));
    }
    return baseline;
  }
  function nativeComfortable(){
    const baseline=composer.native;
    if(!baseline)return true;
    if(composer.branch.getBoundingClientRect().height>baseline.height+1)return false;
    if(baseline.icons.some(({icon,width})=>icon.isConnected&&icon.getBoundingClientRect().width<width-.5))return false;
    if(composer.kind==='subagent'){
      if(composer.branch.getBoundingClientRect().width<baseline.reserve-1)return false;
      const range=document.createRange();range.selectNodeContents(composer.anchor.querySelector('span'));
      const lines=new Set(Array.from(range.getClientRects()).filter(r=>r.width>0).map(r=>Math.round(r.top)));
      if(lines.size>1)return false;
    }
    return true;
  }
  function reserveNativeSpace(){
    if(composer.kind!=='subagent'){if(node.style.getPropertyValue('--pulse-native-room'))node.style.removeProperty('--pulse-native-room');if(node.classList.contains('native-no-room'))node.classList.remove('native-no-room');return;}
    const row=composer.row,style=getComputedStyle(row),siblings=Array.from(row.children).filter(e=>e!==node&&e!==composer.branch&&e.getClientRects().length);
    const room=row.clientWidth-(parseFloat(style.paddingLeft)||0)-(parseFloat(style.paddingRight)||0)-composer.native.reserve-siblings.reduce((sum,e)=>{const s=getComputedStyle(e);return sum+e.getBoundingClientRect().width+(parseFloat(s.marginLeft)||0)+(parseFloat(s.marginRight)||0);},0)-(parseFloat(style.columnGap)||0)*(siblings.length+1)-10;
    const width=`${Math.max(0,Math.floor(room))}px`;if(node.style.getPropertyValue('--pulse-native-room')!==width)node.style.setProperty('--pulse-native-room',width);
    // A hidden ribbon must release its flex space as well as its hit targets.
    // The budget is independent of our own rectangle, so it recovers directly
    // when the sidebar is closed, without probing the native badge each frame.
    node.classList.toggle('native-no-room',room<76);
  }
  function scheduleLayout(){
    if(layoutFrame!==null)return;
    layoutFrame=requestAnimationFrame(()=>{layoutFrame=null;mount();fit();position();});
  }
  function observeComposer(){
    resizeObserver?.disconnect();
    resizeObserver??=new ResizeObserver(scheduleLayout);
    for(const element of new Set([node,composer.row,composer.row.parentElement,composer.branch,composer.editor]))resizeObserver.observe(element);
  }
  function composerLayout({row,editor,branch}){
    // Containment alone can join an app header and a distant message editor.
    // Accept only a horizontal, normal-flow action row local to that editor.
    const style=getComputedStyle(row);
    if(!['flex','inline-flex'].includes(style.display)||style.flexDirection!=='row'||['absolute','fixed'].includes(style.position)||row.closest('header,[role="banner"]'))return false;
    if(['absolute','fixed'].includes(getComputedStyle(branch).position))return false;
    const r=row.getBoundingClientRect(),e=editor.getBoundingClientRect(),p=row.parentElement.getBoundingClientRect();
    const gap=Math.max(0,r.top-e.bottom,e.top-r.bottom);
    const overlap=Math.min(r.bottom,e.bottom)-Math.max(r.top,e.top);
    return r.width>0&&r.height>0&&e.width>0&&e.height>0&&gap<=48&&overlap<=2&&Math.min(r.right,e.right)>Math.max(r.left,e.left)&&p.height<=e.height+r.height+96;
  }
  function closeGroup(){for(const e of root?.querySelectorAll('.group-menu')||[])e.hidden=true;for(const e of root?.querySelectorAll('.group-trigger')||[])e.setAttribute('aria-expanded','false');groupMenu=null;}
  const cardEngaged=()=>Boolean(root?.activeElement||groupMenu||node?.matches(':hover')||root?.querySelector('.card:not([hidden]):hover'));
  function cardVisibility(element,visible){
    if(visible){element.hidden=false;if(element.hasAttribute('popover')&&!element.matches(':popover-open'))element.showPopover();}
    else {if(element.hasAttribute('popover')&&element.matches(':popover-open'))element.hidePopover();element.hidden=true;}
  }
  function hide(){
    changingCards=true;
    try{closeGroup();cardName=null;for(const e of root?.querySelectorAll('[data-card]')||[])e.setAttribute('aria-expanded','false');for(const e of root?.querySelectorAll('.card')||[])cardVisibility(e,false);}
    finally{changingCards=false;}
    updateGuide();
  }
  function show(name){
    if(changingCards||node?.dataset.layout==='blocked')return;
    if(cardName!==name)closeGroup();
    clearTimeout(hoverTimer);cardName=name;
    for(const e of root.querySelectorAll('[data-card]'))e.setAttribute('aria-expanded',String(e.dataset.card===name));
    changingCards=true;
    try{for(const e of root.querySelectorAll('.card'))cardVisibility(e,e.id===`${name}-card`);}
    finally{changingCards=false;}
    updateGuide();
    position();
  }
  function position(){
    positionGuide();
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
  function positionGuide(){
    const tip=$('language-guide'),button=root?.querySelector('[data-card="context"]');
    if(!tip||tip.hidden||!button)return;
    const rect=button.getBoundingClientRect(),width=Math.min(244,innerWidth-24);
    tip.style.width=`${width}px`;tip.style.maxHeight=`${Math.max(80,innerHeight-24)}px`;
    const left=Math.max(12,Math.min(innerWidth-width-12,rect.left+rect.width/2-width/2));
    tip.style.left=`${left}px`;
    tip.style.setProperty('--guide-anchor',`${Math.max(16,Math.min(width-16,rect.left+rect.width/2-left))}px`);
    const above=rect.top-22,below=innerHeight-rect.bottom-22,useAbove=tip.offsetHeight<=above||above>=below;
    tip.style.maxHeight=`${Math.max(80,useAbove?above:below)}px`;
    tip.style.top=`${Math.max(12,useAbove?rect.top-tip.offsetHeight-10:rect.bottom+10)}px`;
    tip.dataset.side=useAbove?'above':'below';
  }
  function updateGuide(){
    const tip=$('language-guide');if(!tip)return;
    const visible=!disposed&&guideReady&&!guideDismissed&&!guideOpened&&!cardName&&node?.isConnected&&composer?.kind==='main'&&node.dataset.layout==='ready'&&node.style.visibility!=='hidden';
    const entering=visible&&tip.hidden;
    cardVisibility(tip,visible);
    const button=root.querySelector('[data-card="context"]');
    if(visible)button.setAttribute('aria-describedby','language-guide');else button.removeAttribute('aria-describedby');
    text('guide-save-note',guideError?'Could not save. Please retry. / 未能保存，请重试。':'');
    $('guide-close').disabled=guideSaving;
    positionGuide();
    if(entering)tip.animate([{opacity:0,transform:`translateY(${tip.dataset.side==='above'?'4':'-4'}px)`},{opacity:1,transform:'translateY(0)'}],{duration:160,easing:'cubic-bezier(0.23,1,0.32,1)'});
  }
  async function dismissGuide(){
    if(guideSaving)return;guideSaving=true;guideError=false;updateGuide();
    try{const value=await window.agPulseHost.setPreferences({languageGuideDismissed:true});if(value?.languageGuideDismissed!==true||value.error)throw new Error('Guide not saved');syncGuide(value);preferences.sync(value);}
    catch{guideError=true;}
    finally{guideSaving=false;updateGuide();}
  }
  function findComposer(){
    const visible=element=>element.isConnected&&!element.closest('[hidden],[inert]')&&element.getClientRects().length>0&&getComputedStyle(element).visibility!=='hidden';
    const semanticEditors=Array.from(document.querySelectorAll('[role="combobox"][contenteditable="true"],[role="textbox"][contenteditable="true"]')).filter(visible);
    const editors=Array.from(new Set([...semanticEditors,...Array.from(document.querySelectorAll('[aria-label="Message input"]')).filter(visible)]));
    const stableModels=Array.from(document.querySelectorAll('[data-testid="model-selector-trigger"]')).filter(visible);
    const models=stableModels.length?stableModels:Array.from(document.querySelectorAll('button[role="combobox"][aria-haspopup],button[aria-label^="Select model"]')).filter(visible);
    const pairs=[];
    for(const model of models)for(const editor of editors){
      let row=model.parentElement,distance=1;
      // The toolbar branch and editable branch meet at their nearest common
      // composer ancestor. Action-button labels and generation state are irrelevant.
      while(row?.parentElement&&!row.parentElement.contains(editor)&&row.parentElement!==document.body&&row.parentElement!==document.documentElement){row=row.parentElement;distance++;}
      if(!row||row===document.body||row.contains(editor)||!row.parentElement?.contains(editor)||[document.body,document.documentElement].includes(row.parentElement))continue;
      for(let element=editor;element&&element!==row.parentElement;element=element.parentElement)distance++;
      let branch=model;while(branch.parentElement!==row)branch=branch.parentElement;
      const pair={editor,model,row,branch,distance,kind:'main'};
      if(composerLayout(pair))pairs.push(pair);
    }
    // Subagents have a static identity badge instead of a model selector.
    // Use only a bounded, stable host input box with a semantic send control;
    // never use the auxiliary pane's arbitrary comboboxes as an anchor.
    for(const editor of editors){
      const box=editor.closest('[data-testid="agent-input-box"]');
      if(!box||!visible(box)||box.querySelectorAll('[contenteditable="true"]').length!==1||box.querySelector('[data-testid="model-selector-trigger"]'))continue;
      for(const send of box.querySelectorAll('[data-testid="send-button"]')){
        let row=send.parentElement,distance=1;
        while(row?.parentElement&&row.parentElement!==box&&!row.parentElement.contains(editor)){row=row.parentElement;distance++;}
        if(!row||row.contains(editor)||!row.parentElement?.contains(editor)||!box.contains(row))continue;
        const anchors=Array.from(row.querySelectorAll('[title]')).filter(e=>visible(e)&&e.querySelector('svg')&&e.querySelector('span')&&!e.matches('button,a,[role="button"],[role="combobox"],[aria-haspopup]')&&!e.querySelector('button,a,[role="button"],[aria-haspopup]'));
        if(anchors.length!==1)continue;
        const anchor=anchors[0];let branch=anchor;while(branch.parentElement!==row)branch=branch.parentElement;
        if(branch.contains(send))continue;
        for(let element=editor;element&&element!==row.parentElement;element=element.parentElement)distance++;
        const pair={editor,model:null,row,branch,anchor,distance,kind:'subagent'};
        if(composerLayout(pair))pairs.push(pair);
      }
    }
    pairs.sort((a,b)=>a.distance-b.distance);
    if(!pairs.length)return null;
    // Equally plausible visible composers must not place the strip arbitrarily.
    const closest=pairs.filter(pair=>pair.distance===pairs[0].distance);
    if(closest.length===1)return closest[0];
    return closest.find(pair=>pair.editor===document.activeElement)||closest.find(pair=>pair.branch===composer?.branch&&pair.editor===composer?.editor)||null;
  }
  function mount(){
    const found=findComposer();
    if(!found){stopDensityMotion();densityFrame=null;densityProbe=null;composer=null;resizeObserver?.disconnect();if(node?.isConnected){hide();themeController?.dispose();themeController=null;node.remove();}return;}
    found.native=composer?.branch===found.branch?composer.native:captureNative(found);
    composer=found;
    if(syncConversation())render();
    const {editor,model,row,branch}=found;
    if(node)node.dataset.scope=found.kind;
    if(node?.isConnected&&node.parentElement===row&&node.previousElementSibling===branch)return;
    if(node){stopDensityMotion();densityFrame=null;densityProbe=null;hide();row.insertBefore(node,branch.nextSibling);observeComposer();themeController?.dispose();themeController=theme.attach(node,{embedded:true});if(data?.theme)themeController.setHostTheme(data.theme);fit();position();return;}
    resizeObserver?.disconnect();node?.remove();node=document.createElement('div');node.id=ID;
    node.dataset.scope=found.kind;
    node.style.cssText='display:flex;align-items:center;flex:0 1 auto;min-width:0;max-width:min(100%,var(--pulse-native-room,100%));height:28px;margin:0 5px;position:relative;';
    root=node.attachShadow({mode:'open'});
    root.innerHTML=`<style>${theme.shadowCss()}
      :host{color-scheme:var(--pulse-scheme);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;color:var(--pulse-foreground);font-size:11px}*{box-sizing:border-box}button,select{font:inherit}button{cursor:pointer}svg{width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;flex:none}button:focus-visible,select:focus-visible{outline:2px solid var(--pulse-accent);outline-offset:2px}
      .bar{display:flex;justify-content:flex-start;width:100%;align-items:center;gap:7px;min-height:28px;padding:2px 0}.chip{display:flex;align-items:center;gap:6px;color:var(--pulse-chip);background:none;border:0;border-radius:5px;padding:3px 6px;white-space:nowrap;line-height:18px}.chip:hover,.chip[aria-expanded=true]{background:var(--pulse-hover);color:var(--pulse-hover-text)}.chip strong{font-weight:500;font-variant-numeric:tabular-nums}.dim{color:var(--pulse-muted)}.countdown{font-size:10px;font-variant-numeric:tabular-nums}.dot{width:4px;height:4px;background:var(--pulse-dot);border-radius:50%;flex:none}.dot.live{background:var(--pulse-success)}.dot.stale{background:var(--pulse-warning)}.group{color:var(--pulse-muted);font-size:10px;margin-right:1px}.card{position:fixed;inset:auto;margin:0;z-index:2147483000;padding:13px 14px 11px;border-radius:13px;background:linear-gradient(145deg,var(--pulse-card),var(--pulse-card-end));box-shadow:0 8px 32px var(--pulse-shadow);border:1px solid var(--pulse-border);color:var(--pulse-foreground);font-size:12px}.card::backdrop{background:transparent;pointer-events:none}.card[hidden]{display:none}dl>[hidden]{display:none}.heading{display:flex;align-items:center;justify-content:space-between;padding-bottom:10px;margin-bottom:9px;border-bottom:1px solid var(--pulse-separator);font-weight:600}.heading span{display:flex;align-items:center;gap:7px}.tag{font-size:10px;font-weight:400;color:var(--pulse-muted)}dl{margin:0}dl div{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:8px 0}dt{color:var(--pulse-label);font-size:11px}dd{margin:0;font-size:11px;font-variant-numeric:tabular-nums;text-align:right}.emphasis dd{font-weight:600;color:var(--pulse-emphasis)}.footnote{font-size:10px;color:var(--pulse-subtle);line-height:1.6;margin:10px 0 0}.balance{display:flex;align-items:baseline;gap:8px;margin:12px 0}.balance strong{font-size:27px;font-weight:550;letter-spacing:-.6px;font-variant-numeric:tabular-nums}.balance span{color:var(--pulse-muted);font-size:11px}.track{height:4px;border-radius:3px;background:var(--pulse-track);margin:12px 0 14px;overflow:hidden}.track i{height:100%;display:block;background:var(--pulse-accent);width:0}select{color:var(--pulse-control-text);background:var(--pulse-control);border:0;border-radius:4px;font-size:10px;padding:3px 5px;max-width:120px}.toolbar{display:flex;align-items:center;gap:7px}.refresh{color:var(--pulse-muted);border:0;background:transparent;padding:0 3px;font-size:14px}.reset{color:var(--pulse-emphasis)}.rounds,.group,.dot.live{display:none}.chip[hidden]{display:none}.toolbar{position:relative}.group-trigger{color:var(--pulse-control-text);background:var(--pulse-control);border:0;border-radius:5px;font-size:10px;padding:4px 7px;white-space:nowrap}.group-menu{position:absolute;top:calc(100% + 5px);right:22px;min-width:132px;padding:4px;background:var(--pulse-menu);border:1px solid var(--pulse-border);border-radius:7px;box-shadow:0 6px 20px var(--pulse-shadow);z-index:10}.group-menu[hidden]{display:none}.group-menu button{display:block;width:100%;padding:7px 9px;border:0;border-radius:4px;background:none;color:var(--pulse-foreground);text-align:left;white-space:nowrap}.group-menu button:hover,.group-menu button[aria-selected=true]{background:var(--pulse-selected)}.chip{padding:2px 4px;font-size:10px;gap:4px;min-width:0}.bar{gap:3px}.language-button{border:0;background:none;color:var(--pulse-muted);border-radius:4px;font-size:9px;padding:3px 4px;margin-left:auto;cursor:pointer;flex:none}.language-button:hover{color:var(--pulse-hover-text);background:var(--pulse-hover)}:host(.compact) .countdown{display:none}:host(.narrow) .cache-total{display:none}:host(.narrow) [data-card="cache"] .dim{display:none}:host(.narrow) .chip svg{display:none}:host(.narrow) .chip{padding:2px 3px;font-size:9px}:host(.narrow) .bar{gap:0}

    :host([data-layout=blocked]){visibility:hidden!important;pointer-events:none!important}.bar{overflow:clip;min-width:0;max-width:100%}
    :host(.native-no-room){flex:0 0 0px!important;width:0!important;max-width:0!important;margin:0!important}
    .density-stage{position:absolute;overflow:clip;pointer-events:none;user-select:none}.density-piece{pointer-events:none!important}
    .scope-note{margin:0 0 10px;color:var(--pulse-muted);font-size:10px}:host([data-scope=main]) .scope-note{display:none}
    .language-button[data-save-failed=true]{color:var(--pulse-warning);text-decoration:underline dotted}.context-ring{display:inline-block;flex:none;width:12px;height:12px;border-radius:50%;background:conic-gradient(var(--pulse-ring) var(--used-angle,0deg),var(--pulse-ring-track) 0);mask:radial-gradient(circle,transparent 43%,#000 47%)}:host(.narrow) .context-label{display:none}
    .bar{gap:6px}.chip{font-size:11px;gap:5px;padding:3px 5px}.context-card>strong{font-size:16px}.context-card>p{margin:8px 0}.quota-heading{margin-top:14px;padding-top:12px;border-top:1px solid var(--pulse-separator)}.quota-title{display:flex;align-items:center;gap:6px;font-size:11px}.quota-title>span:first-child{display:flex;align-items:center;gap:6px;margin-right:auto}.quota-title strong{font-variant-numeric:tabular-nums;font-size:13px}.quota-section+.quota-section{border-top:1px solid var(--pulse-separator);margin-top:12px;padding-top:12px}.quota-section .track{margin:8px 0}.quota-section .footnote{margin-top:6px}.quota-section dl div{margin:6px 0}.context-label{white-space:nowrap}
    :host(.icons-only) .bar{gap:2px}:host(.icons-only) .chip{flex:0 0 24px;width:24px;min-width:24px;height:24px;padding:0;gap:0;justify-content:center}:host(.icons-only) .chip>:not(svg):not(.context-ring){display:none}:host(.icons-only) .bar>.language-button,:host(.icons-only) .bar>.dot{display:none}:host(.icons-only) .chip svg{display:block}.card-language{display:flex;align-items:center;justify-content:space-between;margin-top:10px;padding-top:8px;border-top:1px solid var(--pulse-separator);font-size:10px;color:var(--pulse-muted)}
    .refresh{display:inline-grid;place-items:center}.refresh[aria-busy=true]{color:var(--pulse-emphasis);cursor:wait}.refresh[aria-busy=true] svg{animation:pulse-refresh-spin 1s linear infinite;transform-origin:center}
    @keyframes pulse-refresh-spin{to{transform:rotate(360deg)}}
    @media(prefers-reduced-motion:reduce){.refresh[aria-busy=true] svg{animation:none;opacity:.65}}
    </style><div class="bar" data-i18n-aria="strip" aria-label="Dashboard statistics">
      <span class="dot" id="dot" title="Connecting"></span>
      <button class="chip" data-card="speed" data-i18n-aria="session" hidden aria-controls="speed-card" aria-expanded="false">${svg('speed')}<span class="rounds dim" id="rounds"></span><strong id="tps">—</strong><span>tok/s</span></button>
      <button class="chip" data-card="cache" data-i18n-aria="cacheTitle" hidden aria-controls="cache-card" aria-expanded="false">${svg('cache')}<span class="cache-total" id="cache-total">— tok</span><span class="dim">·</span><span data-i18n="cache">Cache hit</span><strong id="cache-rate">—</strong></button>
      <button class="chip" data-card="context" data-i18n-aria="context" hidden aria-controls="context-card" aria-expanded="false"><span class="context-ring" id="context-ring" aria-hidden="true"></span><span class="context-label" data-i18n="contextShort">Ctx</span><strong id="context-percent">—</strong></button>
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
      <div class="heading quota-heading"><span data-i18n="group">Quota group</span><div class="toolbar"><button class="group-trigger" data-i18n-aria="group" aria-haspopup="listbox" aria-expanded="false">Quota ▾</button><div class="group-menu" role="listbox" data-i18n-aria="selectGroup" hidden></div><button class="refresh" data-i18n-aria="refresh" aria-label="Refresh quota" title="Refresh quota"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M12.8 6a5.1 5.1 0 1 0 .1 4M12.8 2.5V6H9.2"/></svg></button></div></div>
      <div class="quota-details">${['five','week'].map(name=>`<section class="quota-section" data-i18n-aria="${name}" aria-label="${t(name)}"><div class="quota-title"><span>${svg(name)}<span data-i18n="${name}">${t(name)}</span></span><strong id="${name}-balance">—</strong><span class="dim" data-i18n="remaining">remaining</span></div><div class="track" role="progressbar" data-i18n-aria="${name}" id="${name}-track"><i id="${name}-fill"></i></div><dl><div><dt data-i18n="resetIn">Resets in</dt><dd class="reset" id="${name}-countdown">—</dd></div><div><dt data-i18n="resetTime">Reset time (UTC+8)</dt><dd id="${name}-reset">—</dd></div></dl><p class="footnote" id="${name}-note">${t('loadingQuota')}</p></section>`).join('')}</div>
    </section>`;
    row.insertBefore(node,branch.nextSibling);
    for(const card of root.querySelectorAll('.card')){const note=document.createElement('p');note.className='scope-note';note.dataset.i18n='subagentStats';card.querySelector('.heading').after(note);}
    const languageRow=document.createElement('div');languageRow.className='card-language';
    languageRow.innerHTML='<span>Language / 语言</span><div class="language-options" role="group" aria-label="Language / 语言"><button type="button" class="language-button" id="card-language-en" data-language-choice="en">English</button><button type="button" class="language-button" id="card-language-zh" data-language-choice="zh-CN">简体中文</button></div>';
    $('context-card').append(languageRow);
    const saveNote=document.createElement('p');saveNote.className='footnote';saveNote.id='language-save-note';languageRow.after(saveNote);
    const guide=document.createElement('section');guide.className='language-guide';guide.id='language-guide';guide.hidden=true;guide.setAttribute('role','region');guide.setAttribute('aria-label','Language / 语言');
    guide.innerHTML='<div class="guide-heading"><strong>Language <span>/ 语言</span></strong><button type="button" id="guide-close" aria-label="Dismiss language tip / 关闭语言提示" title="Dismiss / 关闭">×</button></div><button type="button" id="guide-open"><span><span>Switch in context details</span><span lang="zh-CN">在上下文详情中切换语言</span></span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8 4l4 4-4 4"/></svg></button><p class="footnote" id="guide-save-note"></p>';
    root.append(guide);
    const guideStyle=document.createElement('style');guideStyle.textContent=`
      .card-language{margin:10px 0 0;padding:8px 0 0;border-top:1px solid var(--pulse-separator);border-bottom:0;gap:8px;font-size:10px}
      .language-options{display:flex;gap:2px;padding:2px;border-radius:6px;background:var(--pulse-control);flex:none}
      .language-options .language-button{font-size:10px;padding:3px 6px;margin:0;border-radius:4px;color:var(--pulse-muted);line-height:16px;transition:background-color 140ms ease,color 140ms ease,transform 120ms ease}
      .language-options .language-button[aria-pressed=true]{color:var(--pulse-foreground);background:var(--pulse-hover);box-shadow:0 1px 2px var(--pulse-shadow)}
      .language-options .language-button:active{transform:scale(.97)}
      .language-guide{position:fixed;inset:auto;margin:0;padding:10px 12px;border:1px solid var(--pulse-border);border-radius:10px;background:var(--pulse-card);color:var(--pulse-foreground);box-shadow:0 4px 16px var(--pulse-shadow);font-size:11px;z-index:2147483000;overflow:visible}
      .language-guide[hidden]{display:none}.language-guide::backdrop{background:transparent;pointer-events:none}
      .language-guide::after{content:'';position:absolute;left:calc(var(--guide-anchor) - 4px);width:7px;height:7px;transform:rotate(45deg);background:var(--pulse-card);pointer-events:none}
      .language-guide[data-side=above]::after{bottom:-4px;border-right:1px solid var(--pulse-border);border-bottom:1px solid var(--pulse-border)}
      .language-guide[data-side=below]::after{top:-4px;border-left:1px solid var(--pulse-border);border-top:1px solid var(--pulse-border)}
      .guide-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:18px}
      .guide-heading strong{font-size:11px;font-weight:600}.guide-heading strong span{font-weight:400;color:var(--pulse-muted)}
      .language-guide button{border:0;background:transparent;color:var(--pulse-muted);border-radius:4px;cursor:pointer;font:inherit;transition:color 140ms ease,background-color 140ms ease,transform 120ms ease}
      .language-guide button:hover{background:var(--pulse-hover);color:var(--pulse-foreground)}.language-guide button:active{transform:scale(.98)}
      #guide-close{font-size:15px;line-height:18px;width:20px;height:20px;margin:-3px -4px -3px 0;padding:0}
      #guide-open{display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;width:calc(100% + 8px);margin:5px -4px -3px;padding:4px;line-height:16px}
      #guide-open>span{display:grid;gap:1px}#guide-open span[lang]{font-size:10px;color:var(--pulse-muted)}#guide-open svg{width:14px;height:14px;flex:none}
      #guide-save-note:empty,#language-save-note:empty{display:none}#guide-save-note,#language-save-note{color:var(--pulse-warning)}
    `;root.append(guideStyle);
    $('guide-close').addEventListener('click',()=>void dismissGuide());
    $('guide-open').addEventListener('click',()=>{guideOpened=true;show('context');$('card-language-zh').scrollIntoView({block:'nearest'});$('card-language-zh').focus({preventScroll:true});});
    // Escape ancestor stacking/paint contexts; ordinary z-index cannot do this.
    if(typeof HTMLElement.prototype.showPopover==='function')for(const card of root.querySelectorAll('.card'))card.setAttribute('popover','manual');
    if(typeof guide.showPopover==='function')guide.setAttribute('popover','manual');
    themeController=theme.attach(node,{embedded:true});
    report('mounted',{editorFound:true,composerFound:true});
    observeComposer();
    for(const chip of root.querySelectorAll('[data-card]')){
      chip.addEventListener('pointerenter',()=>show(chip.dataset.card));chip.addEventListener('focus',()=>show(chip.dataset.card));chip.addEventListener('click',()=>show(chip.dataset.card));
    }
    // A host composer may focus its editor on bubbled clicks. Keep plugin
    // controls' mouse actions inside the shadow root while retaining their
    // default focus/click behavior and document-level outside-click dismissal.
    for(const type of ['pointerdown','mousedown','click'])root.addEventListener(type,event=>event.stopPropagation());
    node.addEventListener('pointerenter',()=>clearTimeout(hoverTimer));node.addEventListener('pointerleave',()=>{hoverTimer=setTimeout(()=>{if(!cardEngaged())hide();},100);});
    root.addEventListener('focusout',()=>setTimeout(()=>{if(!cardEngaged())hide();},0));
    for(const button of root.querySelectorAll('.group-trigger'))button.addEventListener('click',()=>{
      const menu=button.parentElement.querySelector('.group-menu');const opening=menu.hidden;closeGroup();if(opening){groupMenu=menu;menu.hidden=false;button.setAttribute('aria-expanded','true');}
    });
    for(const button of root.querySelectorAll('.refresh'))button.addEventListener('click',refreshManually);
    for(const button of root.querySelectorAll('[data-language-choice]'))button.addEventListener('click',()=>{closeGroup();void preferences.choose(button.dataset.languageChoice);});
    localize();
    render();refresh();
  }
  function render(){
    if(!root||!data)return;
    syncConversation();
    if(groupMenu)return;
    const groups=data.groups||[],model=composer?.model?.getAttribute('aria-label')||composer?.model?.textContent||data.speed?.model||'';
    group=groups.find(g=>g.id===chosen)||groups.find(g=>/gemini/i.test(model)?/gemini/i.test(g.id):/claude|gpt/i.test(model)?/3p|claude|gpt/i.test(g.id):false)||groups[0];
    for(const button of root.querySelectorAll('.group-trigger')){
      if(button.textContent!==`${label(group)} ▾`)button.textContent=`${label(group)} ▾`;
      const menu=button.parentElement.querySelector('.group-menu'),signature=groups.map(g=>g.id).join('|');
      if(menu.dataset.signature!==signature){menu.replaceChildren(...groups.map(g=>{const option=document.createElement('button');option.type='button';option.setAttribute('role','option');option.textContent=label(g);option.dataset.group=g.id;option.addEventListener('click',()=>{chosen=g.id;localSet('ag-pulse-group',chosen);closeGroup();render();menu.parentElement.querySelector('.group-trigger')?.focus({preventScroll:true});});return option;}));menu.dataset.signature=signature;}
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
      text(`${name}-note`,(composer?.kind==='subagent'?t('accountQuota')+' ':'')+(language.errorMessage(data.error)||(b?.disabled?t('disabledQuota'):!b?.available?t('noQuota'):t('sharedQuota')+' '+t('updated',{time:data.quotaUpdatedAt?new Date(data.quotaUpdatedAt).toLocaleTimeString(language.language,{hour12:false}):'—'}))));
    }
    $('dot').className=`dot ${data.connection}`;$('dot').title=t(data.connection==='live'?'live':data.connection==='stale'?'stale':'offline');tick();fit();position();
  }
  function tick(){
    if(!root)return;
    for(const [window,name]of[['5h','five'],['weekly','week']]){const b=group?.windows?.[window];text(`${name}-timer`,timer(b?.resetAt,true));text(`${name}-countdown`,timer(b?.resetAt));if(b?.resetAt&&Date.parse(b.resetAt)<=Date.now()&&Date.now()-lastExpiredRefresh>30000){lastExpiredRefresh=Date.now();refresh(true);}}
  }
  function refreshBusy(busy){
    for(const button of root?.querySelectorAll('.refresh')||[]){
      button.setAttribute('aria-busy',String(busy));button.setAttribute('aria-disabled',String(busy));
      button.dataset.i18nAria=busy?'refreshing':'refresh';button.title=t(button.dataset.i18nAria);button.setAttribute('aria-label',button.title);
    }
  }
  function refreshManually(){
    if(manualRequest)return;
    closeGroup();refreshBusy(true);const started=performance.now();
    const epoch=requestEpoch,request={};manualRequest=request;
    request.promise=(async()=>{
      try{if(pending)await refreshRequest;if(!disposed&&epoch===requestEpoch)await refresh(true);}
      finally{
        // A fast cached response still needs visible press feedback. This does
        // not delay data updates; only the indicator has a 250ms minimum.
        const remaining=250-(performance.now()-started);
        if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));
        if(manualRequest===request){refreshBusy(false);manualRequest=null;}
      }
    })();
  }
  function refresh(force=false){
    if(disposed)return;
    if(syncConversation())render();
    if(pending)return refreshRequest;
    if(!node?.isConnected)return;
    const conversation=conversationId();
    const epoch=requestEpoch;
    const current=()=>!disposed&&epoch===requestEpoch&&conversation===conversationId()&&conversation===lastConversation&&node?.isConnected;
    pending=true;lastFetch=Date.now();
    refreshRequest=(async()=>{
      try{const result=await window.agPulseHost.getMetrics({conversationId:conversation,force});if(!current())return;node.style.visibility=result.enabled===false?'hidden':'';if(result.enabled===false){hide();return;}if(!conversation||result.speed&&result.speed.conversationId!==conversation)result.speed=null;data=result;if(result.preferences){syncGuide(result.preferences);preferences.sync(result.preferences);guideReady=!preferences.error;}if(Object.hasOwn(result,'theme'))themeController?.setHostTheme(result.theme);render();}
      catch{if(current()&&data){data.connection='stale';data.error=t('reconnecting');render();}}
      finally{if(epoch===requestEpoch){pending=false;refreshRequest=null;}}
    })();
    return refreshRequest;
  }
  const observer=new MutationObserver(records=>{if(records.some(record=>record.target!==node&&!node?.contains(record.target)))scheduleLayout();});observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class','hidden','inert']});
  const onKey=e=>{if(e.key==='Escape')hide();}, onPointer=e=>{if(node&&!e.composedPath().includes(node))hide();};
  document.addEventListener('keydown',onKey);document.addEventListener('pointerdown',onPointer);
  window.addEventListener('resize',scheduleLayout);document.addEventListener('scroll',scheduleLayout,true);
  densityMedia.addEventListener('change',stopDensityMotion);
  const timerId=setInterval(()=>{mount();fit();tick();position();if(conversationId()!==lastConversation||Date.now()-lastFetch>(document.hidden?10000:2200))refresh();},1000);
  window.__agPulseDispose=()=>{
    disposed=true;requestEpoch++;pending=false;refreshRequest=null;stopDensityMotion();densityFrame=null;densityProbe=null;
    clearInterval(timerId);clearTimeout(hoverTimer);if(layoutFrame!==null)cancelAnimationFrame(layoutFrame);observer.disconnect();resizeObserver?.disconnect();themeController?.dispose();preferences.dispose();hide();node?.remove();
    document.removeEventListener('keydown',onKey);document.removeEventListener('pointerdown',onPointer);
    document.removeEventListener('scroll',scheduleLayout,true);window.removeEventListener('resize',scheduleLayout);
    densityMedia.removeEventListener('change',stopDensityMotion);
    document.removeEventListener('DOMContentLoaded',mount);node=null;root=null;composer=null;
    window.__agPulseInlineInstalled=false;delete window.__agPulseDispose;
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
};
