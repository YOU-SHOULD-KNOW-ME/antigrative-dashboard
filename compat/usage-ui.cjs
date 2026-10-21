// Shared local usage views. Values and model labels are inserted as text.
module.exports = function createUsageDashboard({root,language,setMarkup,hostLabel='Antigravity',guideDismissed=false,onDismissGuide,onLanguage,onRefresh}) {
  const dialog=document.createElement('dialog');dialog.id='usage-dashboard';dialog.setAttribute('popover','manual');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label',language.language==='zh-TW'?'用量統計':language.language==='zh-CN'?'用量统计':'Token usage');
  dialog.style.cssText='width:min(1040px,calc(100vw - 40px));max-width:none;height:min(820px,calc(100dvh - 64px));max-height:none;box-sizing:border-box;overflow:hidden;visibility:visible;pointer-events:auto;padding:0;border:1px solid var(--pulse-border);border-radius:18px;background:var(--pulse-background);color:var(--pulse-foreground);box-shadow:0 24px 100px #0006';
  const shell=document.createElement('div'),view=shell.attachShadow({mode:'open'});shell.style.height='100%';dialog.append(shell);root.append(dialog);
  const backdrop=document.createElement('style');backdrop.textContent='#usage-dashboard{position:fixed;inset:0;margin:auto}#usage-dashboard::backdrop{background:#0006;backdrop-filter:blur(3px);pointer-events:auto}';root.append(backdrop);
  const css=document.createElement('style');css.textContent=`
    :host{display:block;color:var(--pulse-foreground);font:13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;font-variant-numeric:tabular-nums}
    *{box-sizing:border-box}button,select{font:inherit;color:inherit}button{cursor:pointer}button,select{border:1px solid var(--pulse-border);background:transparent;border-radius:7px}button{transition:background 140ms ease,transform 120ms cubic-bezier(.23,1,.32,1)}button:active{transform:scale(.97)}button:focus-visible,select:focus-visible{outline:2px solid var(--pulse-accent);outline-offset:3px}button[disabled]{opacity:.35;cursor:default}
    .page{padding:28px 32px 24px;max-height:90dvh;overflow:auto;background:var(--pulse-background)}.top{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.eyebrow{font-size:10px;color:var(--pulse-muted);letter-spacing:1.7px;margin-bottom:7px}h1{font-size:24px;letter-spacing:-.7px;line-height:1.2;margin:0 0 8px;font-weight:600}.sub{font-size:12px;color:var(--pulse-muted)}.actions{display:flex;gap:8px;align-items:center}.actions button{display:grid;place-items:center;flex:0 0 32px;width:32px;height:32px;padding:0;line-height:1;border-radius:8px;color:var(--pulse-muted)}.actions button:hover{background:var(--pulse-hover);color:var(--pulse-foreground)}.actions svg{display:block;width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}.locale-label{display:block;min-width:16px;height:16px;line-height:16px;text-align:center;font-size:11px}.live-dot{display:inline-block;width:5px;height:5px;background:var(--pulse-success);border-radius:50%;margin-right:6px}
    .tabs{display:flex;gap:22px;border-bottom:1px solid var(--pulse-separator);margin:25px 0 22px}.tabs button{border:0;border-radius:0;background:transparent;color:var(--pulse-muted);padding:0 2px 11px;position:relative}.tabs button[aria-selected=true]{color:var(--pulse-foreground);font-weight:600}.tabs button[aria-selected=true]:after{content:'';position:absolute;height:2px;background:var(--pulse-accent);bottom:-1px;left:0;right:0}
    .totals{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid var(--pulse-border);border-radius:12px;padding:17px 0;margin-bottom:28px}.metric{padding:0 20px}.metric+.metric{border-left:1px solid var(--pulse-separator)}.metric label{color:var(--pulse-muted);font-size:11px}.value{font-size:27px;letter-spacing:-.9px;margin:5px 0 0;font-weight:550}.unit{font-size:11px;color:var(--pulse-muted);margin-left:5px;font-weight:400;letter-spacing:0}
    section[hidden]{display:none}.section-head{display:flex;align-items:center;justify-content:space-between;gap:15px;margin:0 0 18px}h2{font-size:14px;font-weight:600;letter-spacing:-.2px;margin:0}.muted{font-size:11px;color:var(--pulse-muted)}.seg{display:flex;padding:3px;background:var(--pulse-hover);border-radius:8px;gap:2px}.seg button{border:0;padding:4px 12px;border-radius:5px;font-size:11px;color:var(--pulse-muted)}.seg button[aria-pressed=true]{background:var(--pulse-control);color:var(--pulse-foreground);box-shadow:0 1px 3px #0001}select{padding:4px 8px;font-size:11px;background:var(--pulse-background)}
    .heat-wrap{overflow-x:auto;padding:3px 3px 7px}.calendar{min-width:680px}.months{display:grid;margin-left:31px;font-size:10px;color:var(--pulse-muted);margin-bottom:7px}.heat-row{display:flex;gap:9px}.weekdays{display:grid;grid-template-rows:repeat(7,1fr);width:22px;flex:none;font-size:9px;color:var(--pulse-muted)}.heat{display:grid;grid-auto-flow:column;grid-template-rows:repeat(7,1fr);gap:3px;width:100%}.heat button{border:0;border-radius:3px;padding:0;min-width:0;aspect-ratio:1;background:var(--pulse-hover);outline-offset:1px}.heat button[data-level="1"],.swatch[data-level="1"]{background:color-mix(in srgb,var(--pulse-accent) 22%,var(--pulse-hover))}.heat button[data-level="2"],.swatch[data-level="2"]{background:color-mix(in srgb,var(--pulse-accent) 45%,var(--pulse-hover))}.heat button[data-level="3"],.swatch[data-level="3"]{background:color-mix(in srgb,var(--pulse-accent) 68%,var(--pulse-hover))}.heat button[data-level="4"],.swatch[data-level="4"]{background:var(--pulse-accent)}.heat button.future{opacity:.25;cursor:default}.heat.week{grid-template-columns:repeat(26,minmax(0,1fr))!important;grid-template-rows:repeat(2,1fr);grid-auto-flow:row}.week button{max-height:28px;aspect-ratio:1}.heat-footer{display:flex;justify-content:space-between;align-items:center;gap:16px;margin:10px 0 27px;font-size:10px;color:var(--pulse-muted)}.scale{display:flex;align-items:center;gap:4px}.swatch{width:11px;height:11px;border-radius:3px;background:var(--pulse-hover)}.selected{padding:16px 18px;border:1px solid var(--pulse-border);border-radius:10px;display:flex;justify-content:space-between;gap:16px;align-items:center}.selected button{border:0;color:var(--pulse-accent);font-size:12px;padding:5px}.selected .title{font-weight:500;margin-bottom:3px}.selected strong{font-weight:550}
    .chart-controls{display:flex;gap:10px;align-items:center}.range{display:flex;align-items:center;gap:10px}.range button{height:26px;width:26px;border:0}.range strong{font-size:12px;font-weight:500;min-width:106px;text-align:center}.legend{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 18px}.legend button{display:flex;align-items:center;gap:7px;padding:5px 9px;border-radius:6px;font-size:11px;border-color:transparent;background:var(--pulse-hover)}.legend button[aria-pressed=false]{opacity:.35}.dot{width:8px;height:8px;border-radius:2px;display:inline-block;flex:none;background:var(--model-color)}
    .chart-wrap{overflow-x:auto;border-bottom:1px solid var(--pulse-separator);padding-bottom:17px;margin-bottom:18px}.chart{height:246px;display:flex;gap:10px;min-width:650px}.axis{width:42px;flex:none;position:relative;font-size:9px;color:var(--pulse-muted)}.axis span{position:absolute;right:0;transform:translateY(50%)}.plot{position:relative;flex:1;display:flex;align-items:stretch;gap:6px;padding:0 1px}.grid-line{position:absolute;left:0;right:0;border-top:1px solid var(--pulse-separator);pointer-events:none}.bar-column{position:relative;flex:1;min-width:0;display:flex;align-items:flex-end;border:0;border-radius:4px;background:transparent;padding:0;margin-bottom:19px}.bar-column:hover{background:var(--pulse-hover)}.stack{display:flex;flex-direction:column-reverse;width:100%;gap:1px;pointer-events:none;border-radius:3px 3px 0 0;overflow:hidden}.bar-segment{width:100%;background:var(--model-color);min-height:1px}.x-label{position:absolute;top:calc(100% + 5px);left:50%;transform:translateX(-50%);font-size:9px;color:var(--pulse-muted);white-space:nowrap}.empty-bar{height:2px;width:100%;background:var(--pulse-track);border-radius:2px}.chart-empty{position:absolute;left:0;right:0;top:40%;text-align:center;color:var(--pulse-muted);font-size:12px;pointer-events:none}.table-wrap{overflow:auto}.table{width:100%;border-collapse:collapse;text-align:right;font-size:11px;white-space:nowrap}.table th{font-weight:400;color:var(--pulse-muted);padding:8px 12px;border-bottom:1px solid var(--pulse-separator)}.table td{padding:12px;border-bottom:1px solid var(--pulse-separator)}.table th:first-child,.table td:first-child{text-align:left;padding-left:0}.table td:first-child span{margin-right:7px}.table tr:last-child td{border-bottom:0}.footer{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:20px;font-size:10px;color:var(--pulse-muted)}.alert{color:var(--pulse-warning);margin-top:12px;font-size:11px}.tip{position:fixed;z-index:20;max-width:280px;padding:12px 14px;border:1px solid var(--pulse-border);border-radius:9px;background:var(--pulse-menu);box-shadow:0 8px 30px var(--pulse-shadow);color:var(--pulse-foreground);font-size:11px;pointer-events:none}.tip[hidden]{display:none}.tip .tip-title{font-size:10px;color:var(--pulse-muted);margin-bottom:5px}.tip strong{font-size:16px;font-weight:550}.tip-model{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-top:5px}.tip-model .dot{margin-right:6px}
    @media(max-width:650px){.page{padding:20px 18px}.totals{grid-template-columns:repeat(2,minmax(0,1fr));gap:15px 0}.metric:nth-child(3){border-left:0}.value{font-size:23px}.section-head{align-items:flex-start;flex-wrap:wrap}.chart-controls{width:100%;justify-content:space-between}.footer{align-items:flex-start;flex-direction:column;gap:5px}.selected{align-items:flex-start}.chart{gap:8px}}@media(prefers-reduced-motion:reduce){button{transition:none}button:active{transform:none}}
  `;view.append(css);
  css.textContent+=' .months span{white-space:nowrap}.chart-wrap{padding-top:9px}';
  css.textContent+=`
    :host{height:100%}.page{height:100%;max-height:none;display:flex;flex-direction:column;scrollbar-gutter:stable}.page>*{flex:none}.footer{margin-top:auto;padding-top:20px}
    .year-picker{position:relative;flex:none}.year-trigger{display:flex;align-items:center;justify-content:space-between;gap:14px;min-width:76px;height:30px;padding:0 10px;background:var(--pulse-control);color:var(--pulse-foreground);font-size:11px;border-radius:8px}.year-trigger:hover,.year-trigger[aria-expanded=true]{background:var(--pulse-hover)}.year-chevron{width:12px;height:12px;fill:none;stroke:var(--pulse-muted);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;transition:transform 160ms cubic-bezier(.23,1,.32,1)}.year-trigger[aria-expanded=true] .year-chevron{transform:rotate(180deg)}
    .year-menu{position:fixed;inset:auto;margin:0;padding:5px;width:112px;max-height:232px;overflow-y:auto;border:1px solid var(--pulse-border);border-radius:10px;background:var(--pulse-menu);color:var(--pulse-foreground);box-shadow:0 8px 26px var(--pulse-shadow);transform-origin:top right;opacity:1;transform:scale(1);transition:opacity 140ms ease,transform 160ms cubic-bezier(.23,1,.32,1)}.year-menu::backdrop{background:transparent;pointer-events:none}.year-option{width:100%;border:0;border-radius:6px;padding:7px 9px;display:flex;align-items:center;justify-content:space-between;gap:18px;font-size:12px;text-align:left;background:transparent;color:var(--pulse-foreground);font-variant-numeric:tabular-nums}.year-option:hover,.year-option:focus-visible{background:var(--pulse-hover)}.year-option[aria-selected=true]{background:color-mix(in srgb,var(--pulse-accent) 12%,var(--pulse-menu))}.year-check{color:var(--pulse-accent);width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;opacity:0}.year-option[aria-selected=true] .year-check{opacity:1}
    @starting-style{.year-menu:popover-open{opacity:0;transform:scale(.97)}}@media(prefers-reduced-motion:reduce){.year-menu,.year-chevron{transition:none}}
  `;
  css.textContent+=`
    .bar-column:hover{background:transparent}.bar-column:active{transform:none}.stack{width:62%;max-width:30px;margin-inline:auto;gap:0;border-radius:4px 4px 0 0;overflow:hidden}.bar-segment{display:block;flex:none;min-height:0;border-radius:0;pointer-events:auto;background:var(--model-color);transition:opacity 140ms ease}.plot[data-highlight] .bar-segment:not([data-highlight=true]){opacity:.24}.empty-bar{height:1px;opacity:.35}.grid-line{border-top-style:solid;opacity:.45}.grid-line:first-child{opacity:.85}.legend{gap:4px 18px;margin-bottom:22px}.legend button{background:transparent;padding:3px 0;border:0;border-radius:3px;color:var(--pulse-muted);gap:7px}.legend button:hover,.legend button[aria-pressed=true]{color:var(--pulse-foreground)}.legend button[aria-pressed=false]{opacity:.4;text-decoration:line-through}.legend .dot{width:7px;height:7px;border-radius:50%}.chart{gap:16px}.plot{gap:5px}.axis,.x-label{font-size:10px}.chart-summary{font-size:11px;color:var(--pulse-muted);margin-top:5px}.chart-summary strong{color:var(--pulse-foreground);font-weight:500}.chart-wrap{padding-top:6px}.table .dot{border-radius:50%}
    .tip-model{padding:3px 0}.tip-model.dimmed{opacity:.5}.tip-model.active{font-weight:600}.model-share{font-size:10px;color:var(--pulse-muted);margin-left:9px}.usage-waiting{display:grid;place-items:center;min-height:260px;color:var(--pulse-muted);font-size:12px}.usage-waiting[hidden]{display:none}
  `;
  const page=document.createElement('div');page.className='page';
  setMarkup(page,`<header class="top"><div><div class="eyebrow">ANTIGRATIVE DASHBOARD</div><h1 id="title"></h1><div class="sub"><span class="live-dot"></span><span id="subtitle"></span></div></div><div class="actions"><button id="locale" type="button" aria-label="Language"><span id="locale-label" class="locale-label">中</span></button><button id="refresh" type="button" aria-label="Refresh"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 7a5 5 0 1 0-1.3 4.4M13 3v4H9"/></svg></button><button id="close" type="button" aria-label="Close"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg></button></div></header><nav class="tabs" role="tablist"><button id="overview-tab" role="tab" aria-controls="overview"></button><button id="details-tab" role="tab" aria-controls="details"></button></nav><div class="totals" id="totals"></div><section id="usage-waiting" class="usage-waiting" role="status" hidden></section><section id="overview" role="tabpanel"><div class="section-head"><div><h2 id="activity-title"></h2><div class="muted" id="heat-sub"></div></div><div class="chart-controls"><div class="seg" id="heat-controls"><button data-heat="day"></button><button data-heat="week"></button></div><div class="year-picker"><button id="year" type="button" class="year-trigger" aria-label="Year" aria-haspopup="listbox" aria-controls="year-menu" aria-expanded="false"><span id="year-label"></span><svg class="year-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></button><div id="year-menu" class="year-menu" role="listbox" aria-label="Year" popover="manual"></div></div></div></div><div class="heat-wrap"><div class="calendar"><div class="months" id="months"></div><div class="heat-row"><div class="weekdays" id="weekdays"></div><div class="heat" id="heat"></div></div></div></div><div class="heat-footer"><span id="heat-summary"></span><div class="scale"><span id="less"></span><i class="swatch"></i><i class="swatch" data-level="1"></i><i class="swatch" data-level="2"></i><i class="swatch" data-level="3"></i><i class="swatch" data-level="4"></i><span id="more"></span></div></div><div class="selected"><div><div class="title" id="selection-title"></div><span class="muted" id="selection-value"></span></div><button id="selection-details"></button></div></section><section id="details" role="tabpanel" hidden><div class="section-head"><h2 id="detail-title"></h2><div class="chart-controls"><div class="range"><button id="previous" aria-label="Previous">‹</button><strong id="range-label"></strong><button id="next" aria-label="Next">›</button></div><div class="seg" id="period-controls"><button data-period="day"></button><button data-period="week"></button><button data-period="month"></button></div></div></div><div class="legend" id="legend"></div><div class="chart-wrap"><div class="chart"><div class="axis" id="axis"></div><div class="plot" id="plot"></div></div></div><div class="table-wrap"><table class="table"><thead><tr id="table-head"></tr></thead><tbody id="table-body"></tbody></table></div></section><div class="alert" id="alert" hidden></div><footer class="footer"><span id="coverage"></span><span id="timezone"></span></footer><div class="tip" id="tip" role="status" hidden></div>`);view.append(page);
  const intro=document.createElement('section');intro.id='usage-intro';intro.className='usage-intro';intro.hidden=true;intro.setAttribute('aria-labelledby','usage-intro-title');
  setMarkup(intro,'<div class="intro-heading"><span class="intro-mark" aria-hidden="true"><svg viewBox="0 0 16 16"><ellipse cx="8" cy="4" rx="5" ry="2"/><path d="M3 4v8c0 2 10 2 10 0V4M3 8c0 2 10 2 10 0"/></svg></span><h2 id="usage-intro-title"></h2></div><div class="intro-copy"><p id="usage-intro-history"></p><p id="usage-intro-scope"></p><p id="usage-intro-storage"></p></div><div class="intro-bottom"><span id="usage-intro-error" role="status"></span><button id="usage-intro-done" type="button"></button></div>');
  page.querySelector('.top').after(intro);
  css.textContent+=`
    .usage-intro{margin:18px 0 0;padding:17px 20px 14px;border:1px solid var(--pulse-border);border-radius:12px;background:var(--pulse-control)}.usage-intro[hidden]{display:none}
    .intro-heading{display:flex;align-items:center;gap:9px;margin-bottom:9px}.intro-heading h2{font-size:13px;font-weight:550;margin:0}.intro-mark{display:flex;color:var(--pulse-accent)}.intro-mark svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round}
    .intro-copy{display:grid;gap:5px;color:var(--pulse-muted);font-size:11px;line-height:1.65}.intro-copy p{margin:0}.intro-bottom{display:flex;justify-content:flex-end;align-items:center;gap:14px;margin-top:11px}.intro-bottom span{margin-right:auto;color:var(--pulse-warning);font-size:11px}
    #usage-intro-done{padding:6px 13px;min-height:30px;border:1px solid var(--pulse-border);border-radius:7px;background:var(--pulse-hover);color:var(--pulse-foreground);font:inherit;font-size:11px;cursor:pointer;transition:background-color 140ms ease,transform 120ms ease}#usage-intro-done:hover{background:var(--pulse-selected)}#usage-intro-done:active{transform:scale(.98)}#usage-intro-done:disabled{opacity:.55;cursor:wait}
    @media(max-width:520px){.usage-intro{padding:14px}.intro-bottom{align-items:flex-start}.intro-bottom span{line-height:1.5}}
  `;
  const $=id=>view.getElementById(id),text=(id,value)=>{if($(id).textContent!==value)$(id).textContent=value;};
  let value=null,tab='overview',heatMode='day',period='day',year=null,anchor=null,selected=null,disabledModels=new Set(),lastKey='',busy=false,opener=null;
  let disposed=false,refreshMotion=null,refreshDelay=null,finishRefresh=null,accountKey=null,tipTarget=null,tipModel=null;
  const zh=()=>language.language==='zh-CN'||language.language==='zh-TW',tw=()=>language.language==='zh-TW',w=(cn,en,twText)=>(tw()&&twText!==undefined)?twText:(zh()?cn:en);
  let guideSaving=false,guideError=false,guideSignature=null;
  const replayGuide=window.__agPulseUsageGuidePreview===true;
  function renderGuide(){
    const signature=language.language+'|'+themeSignature();
    if(replayGuide&&signature!==guideSignature){guideDismissed=false;guideError=false;}
    guideSignature=signature;intro.hidden=guideDismissed;
    text('usage-intro-title',w('先了解你的用量统计','About your token usage','先了解您的用量統計'));
    text('usage-intro-history',w('自动汇总当前账号可读取的本地历史对话，再持续记录新请求；已删除或缺失的历史可能无法补齐。','Available local conversations for this account are imported automatically, then new requests are recorded. Deleted or missing history may leave gaps.','自動彙總目前帳號可讀取的本機歷史對話，並持續記錄新請求；已刪除或缺失的記錄可能無法補齊。'));
    text('usage-intro-scope',w('统计仅代表本机已记录的 Token 用量，不是账户账单；天、周、月均按 UTC+8 划分。','Totals cover usage recorded on this device, not account billing. Days, weeks and months use UTC+8.','統計僅代表本機已記錄的 Token 用量，非帳號帳單；日、週、月均按 UTC+8 劃分。'));
    text('usage-intro-storage',w('只在本地保存时间、模型和用量，不保存对话正文。删除对话不会扣除已记录的用量。','Only times, models and usage counters are saved locally, never conversation text. Deleting a chat does not subtract usage already recorded.','僅於本機儲存時間、模型與用量，不儲存對話內文。刪除對話不會扣減已記錄的用量。'));
    text('usage-intro-done',guideSaving?w('保存中…','Saving…','儲存中…'):w('知道了','Got it','我知道了'));
    text('usage-intro-error',guideError?w('未能保存，请再试一次。','Could not save. Please try again.','未能儲存，請再試一次。'):'' );
    $('usage-intro-done').disabled=guideSaving;$('usage-intro-done').setAttribute('aria-busy',String(guideSaving));
  }
  function dismissGuide(){
    if(disposed)return;const focused=view.activeElement===$('usage-intro-done');guideDismissed=true;renderGuide();
    if(focused&&dialog.open)$('overview-tab').focus({preventScroll:true});
  }
  $('usage-intro-done').addEventListener('click',async()=>{
    if(guideSaving||disposed)return;guideSaving=true;guideError=false;renderGuide();
    try{await onDismissGuide();dismissGuide();}catch{if(!disposed)guideError=true;}
    finally{guideSaving=false;if(!disposed)renderGuide();}
  });
  const full=n=>Number(n||0).toLocaleString(language.language==='en'?'en-US':language.language);
  const compact=n=>{n=Number(n||0);const limits=[[1e9,'B'],[1e6,'M'],[1e3,'K']];for(const [base,suffix]of limits)if(n>=base)return (n/base).toFixed(1).replace(/\.0$/,'')+suffix;return full(n);};
  const add=(date,days)=>{const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
  const week=date=>{const d=new Date(date+'T00:00:00Z');return add(date,-((d.getUTCDay()+6)%7));};
  const month=(date,shift)=>{const d=new Date(date.slice(0,7)+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+shift);return d.toISOString().slice(0,10);};
  const modelName=model=>model.replace(/-n$/,'').replace(/^gemini-/i,'Gemini ').replace(/^claude-/i,'Claude ').replace(/^gpt-/i,'GPT ').replace(/-/g,' ');
  const themeSignature=()=>{const s=getComputedStyle(root.host||dialog);return [s.getPropertyValue('--pulse-accent'),s.getPropertyValue('--pulse-background'),root.host?.dataset.pulseTheme].join('|');};
  let paletteKey='',modelColors=new Map();
  const colorCanvas=document.createElement('canvas');colorCanvas.width=colorCanvas.height=1;
  const colorContext=colorCanvas.getContext('2d',{willReadFrequently:true});
  const rgb=css=>{colorContext.clearRect(0,0,1,1);colorContext.fillStyle='#000';colorContext.fillStyle=css;colorContext.fillRect(0,0,1,1);return [...colorContext.getImageData(0,0,1,1).data].slice(0,3);};
  const luminance=a=>a.reduce((sum,v,i)=>{v/=255;return sum+(v<=.04045?v/12.92:((v+.055)/1.055)**2.4)*[.2126,.7152,.0722][i];},0);
  const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
  const hsl=a=>{const [r,g,b]=a.map(v=>v/255),hi=Math.max(r,g,b),lo=Math.min(r,g,b),d=hi-lo,l=(hi+lo)/2;return [d?((hi===r?(g-b)/d+(g<b?6:0):hi===g?(b-r)/d+2:(r-g)/d+4)*60):0,d?d/(1-Math.abs(2*l-1)):0,l];};
  const fromHsl=(h,s,l)=>{const a=s*Math.min(l,1-l),f=n=>{const k=(n+h/30)%12;return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1))));};return [f(0),f(8),f(4)];};
  function syncPalette(){
    const models=[...(value?.models||[])].sort(),key=themeSignature()+'|'+models.join('|');if(key===paletteKey)return;paletteKey=key;modelColors.clear();
    const style=getComputedStyle(root.host||dialog),base=rgb(style.getPropertyValue('--pulse-accent').trim()||'#85a8ff'),background=rgb(style.getPropertyValue('--pulse-background').trim()||'#1c1d1f'),[h,s]=hsl(base);
    // An analogous scale stays harmonious as the host accent changes. Tonal
    // variation distinguishes adjacent series without provider brand colors.
    const dark=luminance(background)<.35,offsets=[0,-18,18,-36,36,-9,9,-27,27],tones=dark?[.64,.52,.73,.59,.68]:[.43,.33,.51,.38,.47];
    const end=contrast([255,255,255],background)>contrast([0,0,0],background)?1:0;
    models.forEach((model,i)=>{const hue=(h+offsets[i%offsets.length]+360)%360,saturation=s<.08?.07:Math.max(.28,Math.min(.55,s*.72));let lightness=tones[i%tones.length],c=fromHsl(hue,saturation,lightness);
      // Chart marks (including small legend dots) need contrast on the actual
      // custom background, rather than relying solely on dark/light labels.
      for(let step=0;contrast(c,background)<3&&step<100;step++){lightness+=end? .005:-.005;lightness=Math.max(0,Math.min(1,lightness));c=fromHsl(hue,saturation,lightness);}
      modelColors.set(model,'rgb('+c.join(' ')+')');
    });
  }
  const color=model=>modelColors.get(model)||'var(--pulse-accent)';
  const totals=(from,to,filter=false)=>{
    const models={};for(const day of value?.days||[])if(day.date>=from&&day.date<=to)for(const [model,r]of Object.entries(day.models)){
      if(filter&&disabledModels.has(model))continue;
      models[model]||={total:0,requests:0,uncached:0,cacheRead:0,cacheWrite:0,output:0};for(const key of Object.keys(models[model]))models[model][key]+=r[key]||0;
    }
    return {from,to,models,total:Object.values(models).reduce((n,r)=>n+r.total,0),requests:Object.values(models).reduce((n,r)=>n+r.requests,0)};
  };
  const node=(tag,className,content)=>{const n=document.createElement(tag);if(className)n.className=className;if(content!==undefined)n.textContent=content;return n;};
  function tooltip(bucket,target,activeModel=null){
    if(!$('tip').hidden&&tipTarget===target&&tipModel===activeModel)return;tipTarget=target;tipModel=activeModel;
    highlightModel(activeModel);
    const tip=$('tip');tip.replaceChildren(node('div','tip-title',bucket.from===bucket.to?bucket.from:bucket.from+' – '+bucket.to),node('strong','',full(bucket.total)+' Token'),node('div','muted',w(`${bucket.requests} 次请求`,`${bucket.requests} requests`,`${bucket.requests} 次請求`)));
    for(const [model,r]of Object.entries(bucket.models).sort((a,b)=>b[1].total-a[1].total)){
      const row=node('div','tip-model'+(activeModel?(activeModel===model?' active':' dimmed'):'')),label=node('span',''),dot=node('i','dot'),amount=node('span','',compact(r.total));dot.style.setProperty('--model-color',color(model));label.append(dot,document.createTextNode(modelName(model)));amount.append(node('span','model-share',bucket.total?(r.total/bucket.total*100).toFixed(1)+'%':'0%'));row.append(label,amount);tip.append(row);
    }
    tip.hidden=false;const rect=target.getBoundingClientRect(),bounds=dialog.getBoundingClientRect(),r=tip.getBoundingClientRect();
    tip.style.left=Math.min(bounds.right-r.width-12,Math.max(bounds.left+12,rect.left+rect.width/2-r.width/2))+'px';
    tip.style.top=Math.max(bounds.top+12,rect.top-r.height-10)+'px';
  }
  const bindBucket=(button,bucket)=>{
    button.setAttribute('aria-label',(bucket.from===bucket.to?bucket.from:bucket.from+' – '+bucket.to)+': '+full(bucket.total)+' Token');
    button.addEventListener('pointerenter',()=>tooltip(bucket,button));button.addEventListener('pointerleave',()=>{$('tip').hidden=true;highlightModel(null);});button.addEventListener('focus',()=>tooltip(bucket,button));button.addEventListener('blur',()=>{$('tip').hidden=true;highlightModel(null);});
    button.addEventListener('pointermove',event=>{const model=event.target.closest?.('.bar-segment')?.dataset.model||null;tooltip(bucket,button,model);});
    button.addEventListener('click',()=>{selected=bucket;anchor=bucket.from;showSelection();});
  };
  function showSelection(){const bucket=selected||totals(value.today,value.today);text('selection-title',bucket.from===bucket.to?bucket.from:bucket.from+' – '+bucket.to);text('selection-value',full(bucket.total)+' Token · '+w(`${bucket.requests} 次请求`,`${bucket.requests} requests`,`${bucket.requests} 次請求`));}
  function renderHeat(){
    if(!value)return;
    const start=week(year+'-01-01'),end=year+'-12-31',weeks=Math.floor((Date.parse(end)-Date.parse(start))/604800000)+1;
    $('heat').replaceChildren();$('months').replaceChildren();$('weekdays').replaceChildren();$('heat').className='heat'+(heatMode==='week'?' week':'');
    $('heat').style.gridTemplateColumns=`repeat(${weeks},minmax(0,1fr))`;
    if(heatMode==='week')$('heat').style.setProperty('grid-template-columns',`repeat(${Math.ceil(weeks/2)},minmax(0,1fr))`,'important');
    const buckets=[];for(let i=0;i<(heatMode==='day'?weeks*7:weeks);i++){
      const date=add(start,heatMode==='day'?i:i*7),to=heatMode==='day'?date:add(date,6);
      buckets.push(heatMode==='day'?totals(date,date):totals(date<year+'-01-01'?year+'-01-01':date,to>end?end:to));
    }
    const max=Math.max(1,...buckets.map(b=>b.total));
    for(const bucket of buckets){
      const button=node('button','');button.type='button';const future=bucket.from>value.today||bucket.to<year+'-01-01'||bucket.from>year+'-12-31';
      button.dataset.level=bucket.total===0?'0':String(Math.min(4,Math.ceil(bucket.total/max*4)));if(future){button.className='future';button.disabled=true;}
      if(!future)bindBucket(button,bucket);button.tabIndex=-1;$('heat').append(button);
    }
    const usable=[...$('heat').children].filter(b=>!b.disabled),lastActive=[...$('heat').children].reverse().find(b=>!b.disabled&&b.dataset.level!=='0');
    if(usable.length)(lastActive||usable.at(-1)).tabIndex=0;
    if(heatMode==='day'){
      $('months').style.gridTemplateColumns=`repeat(${weeks},minmax(0,1fr))`;
      for(let m=1;m<=12;m++){const date=`${year}-${String(m).padStart(2,'0')}-01`,col=Math.floor((Date.parse(date)-Date.parse(start))/604800000)+1;
        const label=node('span','',zh()?m+'月':['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m-1]);label.style.gridColumn=col;label.style.gridRow=1;$('months').append(label);}
      for(let i=0;i<7;i++)$('weekdays').append(node('span','',i%2===0?(zh()?['一','','三','','五','','日'][i]:['M','','W','','F','','S'][i]):''));
    }
    text('heat-sub',heatMode==='day'?w('每格代表一天','Each square is one day','每格代表一天'):w('每格代表一周 · 周一开始','Each square is one week · starts Monday','每格代表一週 · 週一開始'));
    const annual=totals(year+'-01-01',year+'-12-31');text('heat-summary',w(`${year} 年 · ${full(annual.total)} Token`,`${year} · ${full(annual.total)} tokens`,`${year} 年 · ${full(annual.total)} Token`));
    for(const b of view.querySelectorAll('[data-heat]'))b.setAttribute('aria-pressed',String(b.dataset.heat===heatMode));showSelection();
  }
  function highlightModel(model){
    if(model)$('plot').dataset.highlight=model;else delete $('plot').dataset.highlight;
    for(const bar of $('plot').querySelectorAll('.bar-segment')){if(model&&bar.dataset.model===model)bar.dataset.highlight='true';else delete bar.dataset.highlight;}
  }
  const chartSummary=node('div','chart-summary');$('detail-title').after(chartSummary);
  const chartHeading=node('div','');$('detail-title').before(chartHeading);chartHeading.append($('detail-title'),chartSummary);
  function renderChart(){
    if(!value)return;syncPalette();$('tip').hidden=true;highlightModel(null);
    const buckets=[];
    if(period==='day'){const start=month(anchor,0),end=add(month(anchor,1),-1);for(let date=start;date<=end;date=add(date,1))buckets.push(totals(date,date,true));text('range-label',start.slice(0,7));}
    else if(period==='week'){const start=add(week(anchor),-11*7);for(let i=0;i<12;i++){const from=add(start,i*7);buckets.push(totals(from,add(from,6),true));}text('range-label',start.slice(5)+' – '+add(week(anchor),6).slice(5));}
    else{for(let i=-11;i<=0;i++){const from=month(anchor,i);buckets.push(totals(from,add(month(from,1),-1),true));}text('range-label',buckets[0].from.slice(0,7)+' – '+month(anchor,0).slice(0,7));}
    $('next').disabled=period==='week'?week(anchor)>=week(value.today):anchor.slice(0,7)>=value.today.slice(0,7);$('legend').replaceChildren();
    for(const model of value.models){const button=node('button',''),dot=node('i','dot');dot.style.setProperty('--model-color',color(model));button.append(dot,document.createTextNode(modelName(model)));button.type='button';button.setAttribute('aria-pressed',String(!disabledModels.has(model)));button.addEventListener('click',()=>{if(disabledModels.has(model))disabledModels.delete(model);else disabledModels.add(model);renderChart();});button.addEventListener('pointerenter',()=>highlightModel(disabledModels.has(model)?null:model));button.addEventListener('pointerleave',()=>highlightModel(null));$('legend').append(button);}
    const max=Math.max(1,...buckets.map(b=>b.total)),ceiling=max>1?Math.ceil(max/(10**Math.floor(Math.log10(max))))*10**Math.floor(Math.log10(max)):1;
    $('axis').replaceChildren();$('plot').replaceChildren();
    for(let i=0;i<=4;i++){const label=node('span','',compact(ceiling*i/4));label.style.bottom=(19+(246-19)*i/4)+'px';$('axis').append(label);const line=node('i','grid-line');line.style.bottom=(19+(246-19)*i/4)+'px';$('plot').append(line);}
    for(const [i,bucket]of buckets.entries()){
      const button=node('button','bar-column');button.type='button';const stack=node('div','stack');
      const segments=value.models.filter(model=>bucket.models[model]?.total>0);
      // Continuous stack: rounding clips only its outer top corners. Internal
      // separators are inset, so small values and total heights remain exact.
      for(const [j,model]of segments.entries()){const r=bucket.models[model],bar=node('i','bar-segment'),height=r.total/ceiling*227;bar.dataset.model=model;bar.setAttribute('aria-hidden','true');bar.style.setProperty('--model-color',color(model));bar.style.height=height+'px';if(j&&height>=3)bar.style.boxShadow='inset 0 -1px 0 color-mix(in srgb,var(--pulse-background) 48%,transparent)';stack.append(bar);}
      if(!bucket.total)stack.append(node('i','empty-bar'));button.append(stack);
      if(period!=='day'||i%3===0||i===buckets.length-1)button.append(node('span','x-label',period==='day'?String(i+1):period==='week'?bucket.from.slice(5):bucket.from.slice(0,7)));
      bindBucket(button,bucket);$('plot').append(button);
    }
    if(!buckets.some(b=>b.total))$('plot').append(node('div','chart-empty',w('所选时段暂无用量记录','No usage recorded in this period','所選時段尚無用量記錄')));
    $('table-head').replaceChildren(...[w('模型','Model','模型'),w('总 Token','Total tokens','總 Token'),w('未缓存输入','Uncached input','未快取輸入'),w('缓存读取','Cache read','快取讀取'),w('缓存写入','Cache write','快取寫入'),w('输出','Output','輸出')].map(label=>node('th','',label)));
    $('table-body').replaceChildren();const rangeTotals=totals(buckets[0].from,buckets.at(-1).to,true);
    chartSummary.replaceChildren(node('strong','',compact(rangeTotals.total)+' Token'),document.createTextNode(' · '+w(`${full(rangeTotals.requests)} 次请求`,`${full(rangeTotals.requests)} requests`,`${full(rangeTotals.requests)} 次請求`)));
    for(const [model,r]of Object.entries(rangeTotals.models).sort((a,b)=>b[1].total-a[1].total)){
      const row=node('tr',''),label=node('td',''),dot=node('span','dot');dot.style.setProperty('--model-color',color(model));label.append(dot,document.createTextNode(modelName(model)));row.append(label,...[r.total,r.uncached,r.cacheRead,r.cacheWrite,r.output].map(n=>node('td','',full(n))));$('table-body').append(row);
    }
    for(const b of view.querySelectorAll('[data-period]'))b.setAttribute('aria-pressed',String(b.dataset.period===period));
  }
  function render(){
    renderGuide();
    if(!value){
      closeYear(false);$('tip').hidden=true;$('overview').hidden=true;$('details').hidden=true;$('usage-waiting').hidden=false;
      text('usage-waiting',w('正在重新连接统计…','Reconnecting usage…','正在重新連線統計資料…'));text('subtitle',w('正在重新连接本机统计','Reconnecting local usage','正在重新連線本機統計'));text('coverage','');text('timezone','');$('alert').hidden=true;
      for(const metric of $('totals').children){metric.title='';metric.querySelector('.value')?.replaceChildren(node('span','','—'));}
      return;
    }
    $('usage-waiting').hidden=true;
    syncPalette();
    text('title',w('用量统计','Token usage','用量統計'));dialog.setAttribute('aria-label',w('用量统计','Token usage','用量統計'));text('subtitle',w(`本机 ${hostLabel} · 当前账号`,`Local ${hostLabel} · current account`,`本機 ${hostLabel} · 目前帳號`));
    text('overview-tab',w('活动概览','Activity','活動總覽'));text('details-tab',w('用量详情','Usage details','用量詳細資料'));text('activity-title',w('Token 活动','Token activity','Token 活動'));text('detail-title',w('按模型统计','Usage by model','依模型統計'));
    languagePicker.update();for(const [id,label]of [['locale',language.t('language')],['refresh',w('刷新用量','Refresh usage','重新整理用量')],['close',w('关闭','Close','關閉')]]){$(id).setAttribute('aria-label',label);$(id).title=label;}text('less',w('少','Less','少'));text('more',w('多','More','多'));text('selection-details',w('查看这段用量 →','View usage →','檢視此時段用量 →'));
    for(const b of view.querySelectorAll('[data-heat]'))b.textContent=b.dataset.heat==='day'?w('每天','Daily','每日'):w('每周','Weekly','每週');
    for(const b of view.querySelectorAll('[data-period]'))b.textContent=({day:w('天','Day','日'),week:w('周','Week','週'),month:w('月','Month','月')})[b.dataset.period];
    $('overview-tab').setAttribute('aria-selected',String(tab==='overview'));$('details-tab').setAttribute('aria-selected',String(tab==='details'));$('overview').hidden=tab!=='overview';$('details').hidden=tab!=='details';
    $('totals').replaceChildren();for(const [label,total]of [[w('今日用量','Today','今日用量'),value.todayTokens],[w('本周用量','This week','本週用量'),value.weekTokens],[w('本月用量','This month','本月用量'),value.monthTokens],[w('累计用量','All time','累積用量'),value.totalTokens]]){
      const metric=node('div','metric'),n=node('div','value',compact(total));n.append(node('span','unit','Token'));metric.append(node('label','',label),n);metric.title=full(total)+' Token';$('totals').append(metric);
    }
    const years=[];const first=Number(value.firstDate?.slice(0,4)||value.today.slice(0,4)),currentYear=Number(value.today.slice(0,4)),minimum=Math.max(first,currentYear-10);for(let y=currentYear;y>=minimum;y--)years.push(y);
    if($('year').dataset.years!==years.join(',')){
      $('year-menu').replaceChildren(...years.map(y=>{const option=node('button','year-option');option.type='button';option.dataset.year=String(y);option.setAttribute('role','option');option.tabIndex=-1;
        setMarkup(option,'<span></span><svg class="year-check" viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7"/></svg>');option.firstElementChild.textContent=String(y);
        option.addEventListener('click',()=>{year=String(y);syncYear();closeYear();renderHeat();});return option;}));$('year').dataset.years=years.join(',');
    }
    syncYear();
    text('coverage',w(`已记录 ${full(value.requests)} 次请求${value.firstDate?' · 始于 '+value.firstDate:''}`,`${full(value.requests)} requests recorded${value.firstDate?' · since '+value.firstDate:''}`,`已記錄 ${full(value.requests)} 次請求${value.firstDate?' · 起始於 '+value.firstDate:''}`));
    text('timezone',value.timeZone+' · '+(value.syncing||value.retryingConversations>0?w('正在同步历史…','Syncing history…','正在同步歷程記錄…'):w('本地统计','Local usage','本機統計')));
    const alerts=[];if(value.unknownRequests)alerts.push(w(`${value.unknownRequests} 次请求日期未知，共 ${compact(value.unknownTokens)} Token`,`${value.unknownRequests} undated requests · ${compact(value.unknownTokens)} tokens`,`${value.unknownRequests} 次請求日期未知，共 ${compact(value.unknownTokens)} Token`));
    const confirmedMissing=value.confirmedMissingConversations??(value.syncing?0:value.missingConversations);
    if(value.partialRequests||value.unreadableFiles||confirmedMissing>0&&!value.syncing||value.persistenceError)alerts.push(w('部分记录暂不可读取，用量可能不完整','Some records are unavailable; usage may be incomplete','部分記錄暫無法讀取，用量可能不完整'));
    $('alert').hidden=!alerts.length;text('alert',alerts.join(' · '));
    if(tab==='overview')renderHeat();else renderChart();
  }
  function changeTab(next){closeYear(false);tab=next;$('tip').hidden=true;render();}
  $('overview-tab').addEventListener('click',()=>changeTab('overview'));$('details-tab').addEventListener('click',()=>changeTab('details'));
  for(const b of view.querySelectorAll('[data-heat]'))b.addEventListener('click',()=>{heatMode=b.dataset.heat;renderHeat();});
  for(const b of view.querySelectorAll('[data-period]'))b.addEventListener('click',()=>{period=b.dataset.period;renderChart();});
  function syncYear(){
    text('year-label',String(year));$('year').setAttribute('aria-label',w('选择年份','Select year','選取年份')+' · '+year);$('year-menu').setAttribute('aria-label',w('年份','Year','年份'));
    for(const option of $('year-menu').children)option.setAttribute('aria-selected',String(option.dataset.year===String(year)));
  }
  function closeYear(restore=true){if(!$('year-menu').matches(':popover-open'))return;$('year-menu').hidePopover();$('year').setAttribute('aria-expanded','false');if(restore)$('year').focus({preventScroll:true});}
  function positionYear(){
    if(!$('year-menu').matches(':popover-open'))return;const menu=$('year-menu'),r=$('year').getBoundingClientRect(),bounds=dialog.getBoundingClientRect(),width=menu.offsetWidth,height=menu.offsetHeight;
    menu.style.left=Math.max(bounds.left+12,Math.min(r.right-width,bounds.right-width-12))+'px';const below=r.bottom+7;
    menu.style.top=(below+height<=bounds.bottom-12?below:Math.max(bounds.top+12,r.top-height-7))+'px';
  }
  function openYear(){
    $('tip').hidden=true;$('year-menu').showPopover();$('year').setAttribute('aria-expanded','true');positionYear();
    ($('year-menu').querySelector('[aria-selected=true]')||$('year-menu').firstElementChild)?.focus({preventScroll:true});
  }
  $('year').addEventListener('click',()=>{$('year-menu').matches(':popover-open')?closeYear():openYear();});
  $('year').addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();openYear();if(event.key==='Home')$('year-menu').firstElementChild?.focus();if(event.key==='End')$('year-menu').lastElementChild?.focus();}});
  $('year-menu').addEventListener('keydown',event=>{
    const options=[...$('year-menu').children],current=options.indexOf(view.activeElement);let next=null;
    if(event.key==='ArrowDown')next=Math.min(options.length-1,current+1);else if(event.key==='ArrowUp')next=Math.max(0,current-1);else if(event.key==='Home')next=0;else if(event.key==='End')next=options.length-1;
    if(next!==null){event.preventDefault();options[next]?.focus({preventScroll:true});}else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeYear();}else if(event.key==='Tab')closeYear();
  });
  view.addEventListener('pointerdown',event=>{const path=event.composedPath();if(!path.includes($('year'))&&!path.includes($('year-menu')))closeYear(false);});
  page.addEventListener('scroll',closeYearOnScroll,{passive:true});function closeYearOnScroll(){closeYear(false);}
  window.addEventListener('resize',positionYear);
  $('heat').addEventListener('keydown',event=>{
    const buttons=[...$('heat').children],index=buttons.indexOf(event.target);if(index<0)return;
    const delta=heatMode==='day'?{ArrowLeft:-7,ArrowRight:7,ArrowUp:-1,ArrowDown:1}:{ArrowLeft:-1,ArrowRight:1,ArrowUp:-Math.ceil(buttons.length/2),ArrowDown:Math.ceil(buttons.length/2)};
    let next=event.key==='Home'?buttons.findIndex(b=>!b.disabled):event.key==='End'?buttons.findLastIndex(b=>!b.disabled):index+(delta[event.key]??NaN);
    if(!Number.isFinite(next)||next<0||next>=buttons.length||buttons[next].disabled)return;event.preventDefault();event.target.tabIndex=-1;buttons[next].tabIndex=0;buttons[next].focus();
  });
  $('selection-details').addEventListener('click',()=>{anchor=(selected?.from||value.today);period=heatMode;changeTab('details');});
  for(const [id,step]of [['previous',-1],['next',1]])$(id).addEventListener('click',()=>{anchor=period==='day'?month(anchor,step):period==='week'?add(anchor,step*84):month(anchor,step*12);renderChart();});
  const languagePicker=language.mountLanguagePicker({button:$('locale'),label:$('locale-label'),parent:dialog,choose:onLanguage});
  $('refresh').addEventListener('click',async()=>{
    if(busy||disposed)return;busy=true;const button=$('refresh'),turn=600,started=performance.now();button.disabled=true;button.setAttribute('aria-busy','true');
    refreshMotion=button.querySelector('svg').animate([{transform:'rotate(0deg)'},{transform:'rotate(360deg)'}],{duration:turn,iterations:Infinity});
    try{await onRefresh();}
    catch{if(!disposed){text('alert',w('暂时无法刷新，请稍后重试','Refresh unavailable. Try again shortly.','暫時無法重新整理，請稍後重試'));$('alert').hidden=false;}}
    finally{
      // Fast requests still paint one whole turn. Slow requests finish their
      // current turn, so cancel never snaps a half-rotated icon back to zero.
      if(!disposed){const elapsed=performance.now()-started,remaining=Math.max(turn,Math.ceil(elapsed/turn)*turn)-elapsed;
        await new Promise(resolve=>{finishRefresh=resolve;refreshDelay=setTimeout(resolve,Math.max(0,remaining));});}
      clearTimeout(refreshDelay);refreshDelay=null;finishRefresh=null;refreshMotion?.cancel();refreshMotion=null;busy=false;
      if(!disposed){button.disabled=false;button.setAttribute('aria-busy','false');}
    }
  });
  // Native showModal()/close() changes inertness across the complete host DOM.
  // In long chats this alone can block Chromium for seconds. A top-layer
  // popover keeps the same backdrop without touching every background node.
  // Contain pointer, focus, Tab, Escape and scrolling explicitly instead.
  function present(){
    if(dialog.matches(':popover-open'))return;
    dialog.removeAttribute('open');dialog.showPopover();dialog.setAttribute('open','');
    $('locale').focus({preventScroll:true});
  }
  function conceal(){
    if(dialog.matches(':popover-open'))dialog.hidePopover();dialog.removeAttribute('open');
  }
  function close(){languagePicker.close(false);closeYear(false);conceal();$('tip').hidden=true;opener?.focus({preventScroll:true});}
  $('close').addEventListener('click',close);dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});
  const contentKey=data=>JSON.stringify([{...data,updatedAt:undefined},language.language,themeSignature()]);
  const within=event=>event.composedPath().includes(dialog);
  function containFocus(event){if(!disposed&&dialog.open&&!within(event)){$('locale').focus({preventScroll:true});}}
  function containKeys(event){
    if(disposed||!dialog.open)return;
    if(event.key==='Escape'){
      event.preventDefault();event.stopImmediatePropagation();
      if($('year-menu').matches(':popover-open'))closeYear();else close();return;
    }
    if(event.key!=='Tab')return;
    // The year menu retains its own Tab dismissal; focus stays in the dialog.
    if($('year-menu').matches(':popover-open'))closeYear(false);
    const controls=[...view.querySelectorAll('button,input,select,a[href],[tabindex]')].filter(n=>n.tabIndex>=0&&!n.disabled&&n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden');
    if(!controls.length){event.preventDefault();return;}
    const index=controls.indexOf(view.activeElement);
    if(index<0||event.shiftKey&&index===0||!event.shiftKey&&index===controls.length-1){
      event.preventDefault();event.stopImmediatePropagation();(event.shiftKey?controls.at(-1):controls[0]).focus({preventScroll:true});
    }
  }
  function containScroll(event){if(!disposed&&dialog.open&&!within(event))event.preventDefault();}
  function containPointer(event){
    if(disposed||!dialog.open)return;
    const r=dialog.getBoundingClientRect();
    const backdropHit=event.composedPath()[0]===dialog;
    if(!within(event)||backdropHit&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)){event.preventDefault();event.stopImmediatePropagation();if(event.type==='click')close();}
  }
  document.addEventListener('focusin',containFocus,true);document.addEventListener('keydown',containKeys,true);
  document.addEventListener('wheel',containScroll,{capture:true,passive:false});document.addEventListener('touchmove',containScroll,{capture:true,passive:false});
  for(const type of ['pointerdown','mousedown','click'])document.addEventListener(type,containPointer,true);
  // CSS surfaces update immediately; JS model colors must follow in the same
  // theme change, rather than waiting for the next metrics poll.
  const themeObserver=new MutationObserver(()=>{if(!disposed&&value&&dialog.open){const key=contentKey(value);if(key!==lastKey){lastKey=key;render();}}});
  if(root.host)themeObserver.observe(root.host,{attributes:true,attributeFilter:['data-pulse-theme','style']});
  return {open(data,trigger){if(!data||disposed)return;accountKey=data.accountKey;value=data;opener=trigger;year||=data.today.slice(0,4);anchor||=data.today;lastKey=contentKey(data);render();present();},
    update(data){if(disposed)return;if(!data){if(!value)return;value=null;lastKey='';if(dialog.open)render();return;}if(accountKey&&accountKey!==data.accountKey){selected=null;disabledModels.clear();year=data.today.slice(0,4);anchor=data.today;}accountKey=data.accountKey;value=data;if(!dialog.open)return;const key=contentKey(data);if(key===lastKey)return;lastKey=key;render();},
    restoreModal(){if(!disposed&&dialog.open&&dialog.isConnected&&!dialog.matches(':popover-open')){closeYear(false);present();}},
    close,syncGuideDismissed(){if(!replayGuide)dismissGuide();},dispose(){disposed=true;languagePicker.dispose();themeObserver.disconnect();clearTimeout(refreshDelay);finishRefresh?.();refreshMotion?.cancel();closeYear(false);window.removeEventListener('resize',positionYear);document.removeEventListener('focusin',containFocus,true);document.removeEventListener('keydown',containKeys,true);document.removeEventListener('wheel',containScroll,true);document.removeEventListener('touchmove',containScroll,true);for(const type of ['pointerdown','mousedown','click'])document.removeEventListener(type,containPointer,true);conceal();dialog.remove();backdrop.remove();},get isOpen(){return dialog.open;}};
};
