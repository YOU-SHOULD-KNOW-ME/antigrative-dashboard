// Shared local usage views. Values and model labels are inserted as text.
module.exports = function createUsageDashboard({root,language,setMarkup,hostLabel='Antigravity',guideDismissed=false,onDismissGuide,onLanguage,onRefresh}) {
  const dialog=document.createElement('dialog');dialog.id='usage-dashboard';
  dialog.style.cssText='width:min(1040px,calc(100vw - 40px));max-width:none;height:min(820px,calc(100dvh - 64px));max-height:none;box-sizing:border-box;overflow:hidden;visibility:visible;pointer-events:auto;padding:0;border:1px solid var(--pulse-border);border-radius:18px;background:var(--pulse-background);color:var(--pulse-foreground);box-shadow:0 24px 100px #0006';
  const shell=document.createElement('div'),view=shell.attachShadow({mode:'open'});shell.style.height='100%';dialog.append(shell);root.append(dialog);
  const backdrop=document.createElement('style');backdrop.textContent='#usage-dashboard::backdrop{background:#0006;backdrop-filter:blur(3px)}';root.append(backdrop);
  const css=document.createElement('style');css.textContent=`
    :host{display:block;color:var(--pulse-foreground);font:13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;font-variant-numeric:tabular-nums}
    *{box-sizing:border-box}button,select{font:inherit;color:inherit}button{cursor:pointer}button,select{border:1px solid var(--pulse-border);background:transparent;border-radius:7px}button{transition:background 140ms ease,transform 120ms cubic-bezier(.23,1,.32,1)}button:active{transform:scale(.97)}button:focus-visible,select:focus-visible{outline:2px solid var(--pulse-accent);outline-offset:3px}button[disabled]{opacity:.35;cursor:default}
    .page{padding:28px 32px 24px;max-height:90dvh;overflow:auto;background:var(--pulse-background)}.top{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.eyebrow{font-size:10px;color:var(--pulse-muted);letter-spacing:1.7px;margin-bottom:7px}h1{font-size:24px;letter-spacing:-.7px;line-height:1.2;margin:0 0 8px;font-weight:600}.sub{font-size:12px;color:var(--pulse-muted)}.actions{display:flex;gap:8px;align-items:center}.actions button{display:grid;place-items:center;flex:0 0 32px;width:32px;height:32px;padding:0;line-height:1;border-radius:8px;color:var(--pulse-muted)}.actions button:hover{background:var(--pulse-hover);color:var(--pulse-foreground)}.actions svg{display:block;width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}.locale-label{display:block;min-width:16px;height:16px;line-height:16px;text-align:center;font-size:11px}.live-dot{display:inline-block;width:5px;height:5px;background:var(--pulse-success);border-radius:50%;margin-right:6px}
    .tabs{display:flex;gap:22px;border-bottom:1px solid var(--pulse-separator);margin:25px 0 22px}.tabs button{border:0;border-radius:0;background:transparent;color:var(--pulse-muted);padding:0 2px 11px;position:relative}.tabs button[aria-selected=true]{color:var(--pulse-foreground);font-weight:600}.tabs button[aria-selected=true]:after{content:'';position:absolute;height:2px;background:var(--pulse-accent);bottom:-1px;left:0;right:0}
    .totals{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid var(--pulse-border);border-radius:12px;padding:17px 0;margin-bottom:28px}.metric{padding:0 20px}.metric+.metric{border-left:1px solid var(--pulse-separator)}.metric label{color:var(--pulse-muted);font-size:11px}.value{font-size:27px;letter-spacing:-.9px;margin:5px 0 0;font-weight:550}.unit{font-size:11px;color:var(--pulse-muted);margin-left:5px;font-weight:400;letter-spacing:0}.metric-sub{font-size:11px;color:var(--pulse-muted);margin-top:4px;white-space:nowrap}
    section[hidden]{display:none}.section-head{display:flex;align-items:center;justify-content:space-between;gap:15px;margin:0 0 18px}.chart-controls{display:flex;align-items:center;gap:10px;flex-wrap:nowrap;white-space:nowrap}.range{display:flex;align-items:center;gap:8px;flex-shrink:0;white-space:nowrap}.range button{display:grid;place-items:center;width:24px;height:24px;padding:0;font-size:13px;line-height:1;border-radius:6px;border:1px solid var(--pulse-border);background:transparent;color:var(--pulse-muted)}.range button:hover{background:var(--pulse-hover);color:var(--pulse-foreground)}.range strong{font-size:12px;font-weight:550;letter-spacing:-.2px}h2{font-size:14px;font-weight:600;letter-spacing:-.2px;margin:0}.muted{font-size:11px;color:var(--pulse-muted)}.seg{display:flex;padding:3px;background:var(--pulse-hover);border-radius:8px;gap:2px}.seg button{border:0;padding:4px 12px;border-radius:5px;font-size:11px;color:var(--pulse-muted)}.seg button[aria-pressed=true]{background:var(--pulse-control);color:var(--pulse-foreground);box-shadow:0 1px 3px #0001}select{padding:4px 8px;font-size:11px;background:var(--pulse-background)}
    .heat-wrap{overflow-x:auto;padding:3px 3px 7px}.calendar{min-width:680px}.months{display:grid;margin-left:31px;font-size:10px;color:var(--pulse-muted);margin-bottom:7px}.heat-row{display:flex;gap:9px}.weekdays{display:grid;grid-template-rows:repeat(7,1fr);width:22px;flex:none;font-size:9px;color:var(--pulse-muted)}.heat{display:grid;grid-auto-flow:column;grid-template-rows:repeat(7,1fr);gap:3px;width:100%}.heat button{border:0;border-radius:3px;padding:0;min-width:0;aspect-ratio:1;background:var(--pulse-hover);outline-offset:1px}.heat button[data-level="1"],.swatch[data-level="1"]{background:color-mix(in srgb,var(--pulse-accent) 22%,var(--pulse-hover))}.heat button[data-level="2"],.swatch[data-level="2"]{background:color-mix(in srgb,var(--pulse-accent) 45%,var(--pulse-hover))}.heat button[data-level="3"],.swatch[data-level="3"]{background:color-mix(in srgb,var(--pulse-accent) 68%,var(--pulse-hover))}.heat button[data-level="4"],.swatch[data-level="4"]{background:var(--pulse-accent)}.heat button.future{opacity:.25;cursor:default}.heat.week{grid-template-columns:repeat(26,minmax(0,1fr))!important;grid-template-rows:repeat(2,1fr);grid-auto-flow:row}.week button{max-height:28px;aspect-ratio:1}.heat-footer{display:flex;justify-content:space-between;align-items:center;gap:16px;margin:10px 0 27px;font-size:10px;color:var(--pulse-muted)}.scale{display:flex;align-items:center;gap:4px}.swatch{width:11px;height:11px;border-radius:3px;background:var(--pulse-hover)}
    .selected{padding:14px 18px;border:1px solid var(--pulse-border);border-radius:10px;display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.selected-main{flex:1;min-width:0}.selected-header{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}.selected button{border:0;color:var(--pulse-accent);font-size:12px;padding:5px 0;white-space:nowrap;cursor:pointer;flex:none;margin-top:2px}.selected .title{font-weight:500;margin-bottom:3px}.selected strong{font-weight:550}
    .composition-bar-wrap{margin-top:10px;width:100%}.composition-bar{height:6px;width:100%;background:var(--pulse-track);border-radius:3px;overflow:hidden;display:flex}.comp-seg{height:100%}.comp-seg.uncached{background:var(--pulse-accent)}.comp-seg.cached{background:#2d8a68}.comp-seg.output{background:#cf7429}.comp-legend{display:flex;flex-wrap:wrap;gap:14px;margin-top:8px;font-size:11px}.comp-item{display:flex;align-items:center;gap:5px}.comp-dot{width:8px;height:8px;border-radius:2px;display:inline-block}.comp-dot.uncached{background:var(--pulse-accent)}.comp-dot.cached{background:#2d8a68}.comp-dot.output{background:#cf7429}
    .filter-strip{display:flex;flex-direction:column;gap:8px;margin:0 0 18px}
    .comp-filters,.legend{display:flex;flex-wrap:wrap;gap:4px 18px}
    .comp-filters button,.legend button{display:flex;align-items:center;gap:7px;padding:3px 0;border-radius:3px;font-size:11px;border:0;background:transparent;color:var(--pulse-muted);cursor:pointer}
    .comp-filters button:hover,.comp-filters button[aria-pressed=true],.legend button:hover,.legend button[aria-pressed=true]{color:var(--pulse-foreground)}
    .comp-filters button[aria-pressed=false],.legend button[aria-pressed=false]{opacity:.4;text-decoration:line-through}
    .comp-filters .dot,.legend .dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex:none;background:var(--model-color)}
    .excluded-val{text-decoration:line-through;opacity:.38}
    .table th.sortable{cursor:pointer;user-select:none;transition:color 120ms ease}
    .table th.sortable:hover{color:var(--pulse-foreground)}
    .sort-arrow{display:inline-block;margin-left:4px;font-size:9px;opacity:.75}
    .drilldown-banner{display:flex;justify-content:space-between;align-items:center;padding:7px 12px;background:color-mix(in srgb,var(--pulse-accent) 8%,transparent);border:1px solid color-mix(in srgb,var(--pulse-accent) 25%,transparent);border-radius:8px;margin-bottom:12px;font-size:11px}.drilldown-banner button{border:0;color:var(--pulse-accent);background:transparent;cursor:pointer;padding:2px 6px;font-size:11px}.drilldown-banner button:hover{text-decoration:underline}.drilldown-banner[hidden]{display:none}
    .chart-wrap{overflow-x:auto;border-bottom:1px solid var(--pulse-separator);padding-bottom:17px;margin-bottom:18px}.chart{height:246px;display:flex;gap:10px;min-width:650px}.axis{width:42px;flex:none;position:relative;font-size:9px;color:var(--pulse-muted)}.axis span{position:absolute;right:0;transform:translateY(50%)}.plot{position:relative;flex:1;display:flex;align-items:stretch;gap:6px;padding:0 1px}.grid-line{position:absolute;left:0;right:0;border-top:1px solid var(--pulse-separator);pointer-events:none}.bar-column{position:relative;flex:1;min-width:0;display:flex;align-items:flex-end;border:0;border-radius:4px;background:transparent;padding:0;margin-bottom:19px}.bar-column:hover{background:var(--pulse-hover)}.bar-column.focused-bar:after{content:'';position:absolute;bottom:0;left:10%;right:10%;height:3px;background:var(--pulse-accent);border-radius:2px}.stack{display:flex;flex-direction:column-reverse;width:100%;gap:1px;pointer-events:none;border-radius:3px 3px 0 0;overflow:hidden}.bar-segment{width:100%;background:var(--model-color);min-height:1px}.x-label{position:absolute;top:calc(100% + 5px);left:50%;transform:translateX(-50%);font-size:9px;color:var(--pulse-muted);white-space:nowrap}.empty-bar{height:2px;width:100%;background:var(--pulse-track);border-radius:2px}.chart-empty{position:absolute;left:0;right:0;top:40%;text-align:center;color:var(--pulse-muted);font-size:12px;pointer-events:none}.table-wrap{overflow:auto}.table{width:100%;border-collapse:collapse;text-align:right;font-size:11px;white-space:nowrap}.table th{font-weight:400;color:var(--pulse-muted);padding:8px 12px;border-bottom:1px solid var(--pulse-separator)}.table td{padding:12px;border-bottom:1px solid var(--pulse-separator)}.table th:first-child,.table td:first-child{text-align:left;padding-left:0}.table td:first-child span{margin-right:7px}.table tr:last-child td{border-bottom:0}.footer{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:20px;font-size:10px;color:var(--pulse-muted)}.alert{color:var(--pulse-warning);margin-top:12px;font-size:11px}.tip{position:fixed;z-index:20;max-width:280px;padding:12px 14px;border:1px solid var(--pulse-border);border-radius:9px;background:var(--pulse-menu);box-shadow:0 8px 30px var(--pulse-shadow);color:var(--pulse-foreground);font-size:11px;pointer-events:none}.tip[hidden]{display:none}.tip .tip-title{font-size:10px;color:var(--pulse-muted);margin-bottom:5px}.tip strong{font-size:16px;font-weight:550}.tip-model{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-top:5px}.tip-model .dot{margin-right:6px}
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
    .bar-column:hover{background:transparent}.bar-column:active{transform:none}.stack{width:62%;max-width:30px;margin-inline:auto;gap:0;border-radius:4px 4px 0 0;overflow:hidden}.bar-segment{display:block;flex:none;min-height:0;border-radius:0;pointer-events:auto;background:var(--model-color);transition:opacity 140ms ease}.plot[data-highlight] .bar-segment:not([data-highlight=true]){opacity:.24}.empty-bar{height:1px;opacity:.35}.grid-line{border-top-style:solid;opacity:.45}.grid-line:first-child{opacity:.85}.chart{gap:16px}.plot{gap:5px}.axis,.x-label{font-size:10px}.chart-summary{font-size:11px;color:var(--pulse-muted);margin-top:5px}.chart-summary strong{color:var(--pulse-foreground);font-weight:500}.chart-wrap{padding-top:6px}.table .dot{border-radius:50%}
    .tip-model{padding:3px 0}.tip-model.dimmed{opacity:.5}.tip-model.active{font-weight:600}.model-share{font-size:10px;color:var(--pulse-muted);margin-left:9px}.usage-waiting{display:grid;place-items:center;min-height:260px;color:var(--pulse-muted);font-size:12px}.usage-waiting[hidden]{display:none}
  `;
  const page=document.createElement('div');page.className='page';
  setMarkup(page,`<header class="top"><div><div class="eyebrow">ANTIGRATIVE DASHBOARD</div><h1 id="title"></h1><div class="sub"><span class="live-dot"></span><span id="subtitle"></span></div></div><div class="actions"><button id="locale" type="button" aria-label="Language"><span id="locale-label" class="locale-label">中</span></button><button id="refresh" type="button" aria-label="Refresh"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 7a5 5 0 1 0-1.3 4.4M13 3v4H9"/></svg></button><button id="close" type="button" aria-label="Close"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg></button></div></header><nav class="tabs" role="tablist"><button id="overview-tab" role="tab" aria-controls="overview"></button><button id="details-tab" role="tab" aria-controls="details"></button></nav><div class="totals" id="totals"></div><section id="usage-waiting" class="usage-waiting" role="status" hidden></section><section id="overview" role="tabpanel"><div class="section-head"><div><h2 id="activity-title"></h2><div class="muted" id="heat-sub"></div></div><div class="chart-controls"><div class="seg" id="heat-controls"><button data-heat="day"></button><button data-heat="week"></button></div><div class="year-picker"><button id="year" type="button" class="year-trigger" aria-label="Year" aria-haspopup="listbox" aria-controls="year-menu" aria-expanded="false"><span id="year-label"></span><svg class="year-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></button><div id="year-menu" class="year-menu" role="listbox" aria-label="Year" popover="manual"></div></div></div></div><div class="heat-wrap"><div class="calendar"><div class="months" id="months"></div><div class="heat-row"><div class="weekdays" id="weekdays"></div><div class="heat" id="heat"></div></div></div></div><div class="heat-footer"><span id="heat-summary"></span><div class="scale"><span id="less"></span><i class="swatch"></i><i class="swatch" data-level="1"></i><i class="swatch" data-level="2"></i><i class="swatch" data-level="3"></i><i class="swatch" data-level="4"></i><span id="more"></span></div></div><div class="selected" id="selection-card"><div class="selected-main"><div class="selected-header"><div class="title" id="selection-title"></div><span class="muted" id="selection-value"></span></div><div class="composition-bar-wrap" id="selection-comp-wrap" hidden><div class="composition-bar" id="selection-comp-bar"></div><div class="comp-legend" id="selection-comp-legend"></div></div></div><button id="selection-details"></button></div></section><section id="details" role="tabpanel" hidden><div class="section-head"><h2 id="detail-title"></h2><div class="chart-controls"><div class="range"><button id="previous" aria-label="Previous">‹</button><strong id="range-label"></strong><button id="next" aria-label="Next">›</button></div><div class="seg" id="period-controls"><button data-period="day"></button><button data-period="week"></button><button data-period="month"></button></div></div></div><div class="filter-strip"><div class="comp-filters" id="comp-filters"></div><div class="legend" id="legend"></div></div><div class="chart-wrap"><div class="chart"><div class="axis" id="axis"></div><div class="plot" id="plot"></div></div></div><div class="drilldown-banner" id="drilldown-banner" hidden><span id="drilldown-banner-text"></span><button type="button" id="clear-drilldown"></button></div><div class="table-wrap"><table class="table"><thead><tr id="table-head"></tr></thead><tbody id="table-body"></tbody></table></div></section><div class="alert" id="alert" hidden></div><footer class="footer"><span id="coverage"></span><span id="timezone"></span></footer><div class="tip" id="tip" role="status" hidden></div>`);view.append(page);
  const intro=document.createElement('section');intro.id='usage-intro';intro.className='usage-intro';intro.hidden=true;intro.setAttribute('aria-labelledby','usage-intro-title');
  setMarkup(intro,'<div class="intro-heading"><span class="intro-mark" aria-hidden="true"><svg viewBox="0 0 16 16"><ellipse cx="8" cy="4" rx="5" ry="2"/><path d="M3 4v8c0 2 10 2 10 0V4M3 8c0 2 10 2 10 0"/></svg></span><h2 id="usage-intro-title"></h2></div><div class="intro-copy"><p id="usage-intro-history"></p><p id="usage-intro-scope"></p><p id="usage-intro-storage"></p></div><div class="intro-bottom"><span id="usage-intro-error" role="status"></span><button id="usage-intro-done" type="button"></button></div>');
  page.querySelector('.top').after(intro);
  const updateBanner=document.createElement('section');updateBanner.id='update-banner';updateBanner.className='update-banner';updateBanner.hidden=true;updateBanner.setAttribute('aria-labelledby','update-banner-title');
  setMarkup(updateBanner,'<div class="update-banner-head"><div class="update-banner-title"><span class="update-banner-icon" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M8 1v14M1 8l7-7 7 7"/></svg></span><h2 id="update-banner-title"></h2></div><span class="update-banner-current" id="update-banner-current"></span></div><div class="update-banner-notes" id="update-banner-notes"></div><div class="update-banner-actions"><span class="update-banner-msg" id="update-banner-msg" role="status"></span><button id="update-banner-ignore" type="button" class="update-btn update-btn-ghost"></button><button id="update-banner-apply" type="button" class="update-btn update-btn-primary"></button></div>');
  intro.after(updateBanner);
  css.textContent+=`
    .usage-intro{margin:18px 0 0;padding:17px 20px 14px;border:1px solid var(--pulse-border);border-radius:12px;background:var(--pulse-control)}.usage-intro[hidden]{display:none}
    .intro-heading{display:flex;align-items:center;gap:9px;margin-bottom:9px}.intro-heading h2{font-size:13px;font-weight:550;margin:0}.intro-mark{display:flex;color:var(--pulse-accent)}.intro-mark svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round}
    .intro-copy{display:grid;gap:5px;color:var(--pulse-muted);font-size:11px;line-height:1.65}.intro-copy p{margin:0}.intro-bottom{display:flex;justify-content:flex-end;align-items:center;gap:14px;margin-top:11px}.intro-bottom span{margin-right:auto;color:var(--pulse-warning);font-size:11px}
    #usage-intro-done{padding:6px 13px;min-height:30px;border:1px solid var(--pulse-border);border-radius:7px;background:var(--pulse-hover);color:var(--pulse-foreground);font:inherit;font-size:11px;cursor:pointer;transition:background-color 140ms ease,transform 120ms ease}#usage-intro-done:hover{background:var(--pulse-selected)}#usage-intro-done:active{transform:scale(.98)}#usage-intro-done:disabled{opacity:.55;cursor:wait}
    @media(max-width:520px){.usage-intro{padding:14px}.intro-bottom{align-items:flex-start}.intro-bottom span{line-height:1.5}}
    .update-banner{margin:18px 0 0;padding:16px 18px 14px;border:1px solid color-mix(in srgb, var(--pulse-accent) 30%, var(--pulse-border));border-radius:12px;background:color-mix(in srgb, var(--pulse-accent) 7%, var(--pulse-control));display:flex;flex-direction:column;gap:10px}.update-banner[hidden]{display:none}
    .update-banner-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.update-banner-title{display:flex;align-items:center;gap:8px}.update-banner-title h2{font-size:13px;font-weight:600;margin:0;color:var(--pulse-foreground)}.update-banner-icon{display:flex;color:var(--pulse-accent)}.update-banner-icon svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
    .update-banner-current{font-size:11px;color:var(--pulse-muted)}
    .update-banner-notes{max-height:120px;overflow-y:auto;font-size:11px;line-height:1.6;color:var(--pulse-muted);background:var(--pulse-background);border:1px solid var(--pulse-border);border-radius:8px;padding:9px 12px;white-space:pre-wrap;word-break:break-word}
    .update-banner-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px}
    .update-banner-msg{margin-right:auto;font-size:11px}.update-banner-msg.success{color:var(--pulse-success);font-weight:500}.update-banner-msg.error{color:var(--pulse-warning)}
    .update-btn{padding:5px 13px;min-height:28px;border-radius:7px;font:inherit;font-size:11px;cursor:pointer;transition:background-color 140ms ease,transform 120ms ease}.update-btn:active{transform:scale(.98)}
    .update-btn-primary{border:1px solid var(--pulse-accent);background:var(--pulse-accent);color:#fff;font-weight:550}.update-btn-primary:hover{filter:brightness(1.1)}.update-btn-primary:disabled{opacity:.55;cursor:wait}
    .update-btn-ghost{border:1px solid var(--pulse-border);background:transparent;color:var(--pulse-muted)}.update-btn-ghost:hover{background:var(--pulse-hover);color:var(--pulse-foreground)}
  `;
  const $=id=>view.getElementById(id),text=(id,value)=>{if($(id).textContent!==value)$(id).textContent=value;};
  let value=null,tab='overview',heatMode='day',period='day',focusedBucket=null,year=null,selected=null,disabledModels=new Set(),disabledComponents=new Set(),sortKey='total',sortOrder='desc',lastKey='',busy=false,opener=null;
  const periodAnchors={day:null,week:null,month:null};
  const getAnchor=p=>{const a=periodAnchors[p]||value?.today||new Date().toISOString().slice(0,10);return value?.today&&a>value.today?value.today:a;};
  let disposed=false,refreshMotion=null,refreshDelay=null,finishRefresh=null,accountKey=null,tipTarget=null,tipModel=null;
  const zh=()=>language.language==='zh-CN',w=(cn,en)=>zh()?cn:en;
  let guideSaving=false,guideError=false,guideSignature=null;
  const replayGuide=window.__agPulseUsageGuidePreview===true;
  function renderGuide(){
    const signature=language.language+'|'+themeSignature();
    if(replayGuide&&signature!==guideSignature){guideDismissed=false;guideError=false;}
    guideSignature=signature;intro.hidden=guideDismissed;
    text('usage-intro-title',w('先了解你的用量统计','About your token usage'));
    text('usage-intro-history',w('自动汇总当前账号可读取的本地历史对话，再持续记录新请求；已删除或缺失的历史可能无法补齐。','Available local conversations for this account are imported automatically, then new requests are recorded. Deleted or missing history may leave gaps.'));
    text('usage-intro-scope',w('统计仅代表本机已记录的 Token 用量，不是账户账单；天、周、月均按 UTC+8 划分。','Totals cover usage recorded on this device, not account billing. Days, weeks and months use UTC+8.'));
    text('usage-intro-storage',w('只在本地保存时间、模型和用量，不保存对话正文。删除对话不会扣除已记录的用量。','Only times, models and usage counters are saved locally, never conversation text. Deleting a chat does not subtract usage already recorded.'));
    text('usage-intro-done',guideSaving?w('保存中…','Saving…'):w('知道了','Got it'));
    text('usage-intro-error',guideError?w('未能保存，请再试一次。','Could not save. Please try again.'):'' );
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
  let updateApplying=false,updateDone=false;
  function renderUpdateBanner(){
    const u=value?.update;
    if(!u||!u.hasUpdate||updateDone){
      updateBanner.hidden=true;
      return;
    }
    updateBanner.hidden=false;
    text('update-banner-title',w(`🎉 发现新版本 v${u.latestVersion}`,`🎉 Update Available: v${u.latestVersion}`));
    text('update-banner-current',w(`当前版本: v${u.currentVersion}`,`Current: v${u.currentVersion}`));
    text('update-banner-notes',u.notes||w('暂无更新说明','No release notes provided'));
    text('update-banner-apply',updateApplying?w('正在更新…','Updating…'):w('立即更新','Update now'));
    text('update-banner-ignore',w('暂不更新','Not now'));
    $('update-banner-apply').disabled=updateApplying;
    $('update-banner-ignore').disabled=updateApplying;
  }
  $('update-banner-apply').addEventListener('click',async()=>{
    if(updateApplying||disposed)return;
    updateApplying=true;
    text('update-banner-msg',w('正在下载并覆盖更新…','Downloading and applying update…'));
    $('update-banner-msg').className='update-banner-msg';
    renderUpdateBanner();
    try{
      const res=await window.agPulseHost.applyUpdate();
      if(res?.error)throw new Error(res.error);
      updateDone=true;
      text('update-banner-msg',w(`🎉 已成功更新至 v${res?.version||value?.update?.latestVersion}！重启应用后生效。`,`🎉 Updated to v${res?.version||value?.update?.latestVersion}! Restart app to take effect.`));
      $('update-banner-msg').className='update-banner-msg success';
      $('update-banner-apply').hidden=true;
      $('update-banner-ignore').hidden=true;
      setTimeout(()=>{if(!disposed&&updateBanner)updateBanner.hidden=true;},5000);
    }catch(e){
      $('update-banner-msg').className='update-banner-msg error';
      text('update-banner-msg',w('更新失败：'+(e.message||'请稍后重试'),'Update failed: '+(e.message||'Please try again')));
    }finally{
      updateApplying=false;
      if(!disposed&&!updateDone)renderUpdateBanner();
    }
  });
  $('update-banner-ignore').addEventListener('click',async()=>{
    const ver=value?.update?.latestVersion;
    updateBanner.hidden=true;
    if(ver&&window.agPulseHost?.ignoreUpdate){
      try{await window.agPulseHost.ignoreUpdate(ver);}catch{}
    }
  });
  const full=n=>Number(n||0).toLocaleString(zh()?'zh-CN':'en-US');
  const compact=n=>{n=Number(n||0);const limits=[[1e9,'B'],[1e6,'M'],[1e3,'K']];for(const [base,suffix]of limits)if(n>=base)return (n/base).toFixed(1).replace(/\.0$/,'')+suffix;return full(n);};
  const add=(date,days)=>{const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
  const week=date=>{const d=new Date(date+'T00:00:00Z');return add(date,-((d.getUTCDay()+6)%7));};
  const month=(date,shift)=>{const d=new Date(date.slice(0,7)+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+shift);return d.toISOString().slice(0,10);};
  const modelName=model=>model.replace(/-n$/,'').replace(/^gemini-/i,'Gemini ').replace(/^claude-/i,'Claude ').replace(/^gpt-/i,'GPT ').replace(/-/g,' ');
  const defaultPricing={'google/gemini-4-argon':{prompt:0.000002,completion:0.00001,cacheRead:0.0000001,cacheWrite:0.0000001875},'google/gemini-3.8-flash':{prompt:0.00000075,completion:0.00000375,cacheRead:0.000000075,cacheWrite:0.0000000416666666666667},'google/gemini-3.8-pro':{prompt:0.00000125,completion:0.000005,cacheRead:0.0000003125,cacheWrite:0.00000125},'anthropic/claude-opus-5.5':{prompt:0.000004,completion:0.00002,cacheRead:0.0000002,cacheWrite:0.000005},'anthropic/claude-opus-4.6':{prompt:0.000005,completion:0.000025,cacheRead:0.0000005,cacheWrite:0.00000625},'anthropic/claude-sonnet-5.5':{prompt:0.000002,completion:0.00001,cacheRead:0.0000001,cacheWrite:0.0000025},'anthropic/claude-haiku-5.5':{prompt:0.0000001,completion:0.0000005,cacheRead:0.00000001,cacheWrite:0.000000125},'openai/gpt-4o':{prompt:0.0000025,completion:0.00001,cacheRead:0.00000125,cacheWrite:0}};
  const normalizeKey=str=>typeof str==='string'?str.toLowerCase().trim().replace(/^https?:\/\/[^\/]+\//,'').replace(/^[~@]/,'').replace(/^(?:google|anthropic|openai)\//,'').replace(/-(?:n|thinking|preview|latest)$/, '').replace(/:batch$/, '').replace(/\s+/g,'-'):'';
  function findPricing(model){
    const catalog=value?.pricing?.models||defaultPricing,raw=String(model).trim().toLowerCase();
    if(catalog[raw])return catalog[raw];
    for(const prefix of ['google/','anthropic/','openai/']){if(catalog[prefix+raw])return catalog[prefix+raw];}
    const norm=normalizeKey(raw);if(!norm)return null;
    for(const [key,p]of Object.entries(catalog)){if(normalizeKey(key)===norm)return p;}
    const dotNorm=norm.replace(/-(\d+)-(\d+)/g,'-$1.$2'),dashNorm=norm.replace(/\./g,'-');
    for(const [key,p]of Object.entries(catalog)){const kNorm=normalizeKey(key);if(kNorm===dotNorm||kNorm===dashNorm)return p;}
    for(const [key,p]of Object.entries(catalog)){const kNorm=normalizeKey(key);if(kNorm.startsWith(norm)||norm.startsWith(kNorm))return p;}
    if(norm.startsWith('gemini-4')){const c=Object.entries(catalog).find(([k])=>normalizeKey(k).startsWith('gemini-4'));if(c)return c[1];}
    if(norm.includes('opus')){const c=Object.entries(catalog).find(([k])=>normalizeKey(k).includes('opus'));if(c)return c[1];}
    if(norm.includes('sonnet')){const c=Object.entries(catalog).find(([k])=>normalizeKey(k).includes('sonnet'));if(c)return c[1];}
    if(norm.includes('flash')){const c=Object.entries(catalog).find(([k])=>normalizeKey(k).includes('flash'));if(c)return c[1];}
    return null;
  }
  function modelActiveTokens(r){
    if(!r)return 0;
    let sum=0;
    if(!disabledComponents.has('uncached'))sum+=Number(r.uncached||0);
    if(!disabledComponents.has('cacheRead'))sum+=Number(r.cacheRead||0);
    if(!disabledComponents.has('output'))sum+=Number(r.output||0);
    return sum;
  }
  function costOf(model,r,respectFilters=true){
    const p=findPricing(model);if(!p)return null;
    const filter=respectFilters&&tab==='details';
    const uncached=(!filter||!disabledComponents.has('uncached'))?Number(r.uncached||0):0;
    const read=(!filter||!disabledComponents.has('cacheRead'))?Number(r.cacheRead||0):0;
    const write=(!filter||!disabledComponents.has('uncached'))?Number(r.cacheWrite||0):0;
    const output=(!filter||!disabledComponents.has('output'))?Number(r.output||0):0;
    const usd=(uncached*(p.prompt||0))+(read*(p.cacheRead||0))+(write*(p.cacheWrite||0))+(output*(p.completion||0));
    const rate=Number(value?.pricing?.exchangeRate)||6.705;
    const amount=zh()?usd*rate:usd,symbol=zh()?'¥':'$';
    return {usd,amount,symbol};
  }
  function rangeCost(models,respectFilters=true){
    let usd=0,has=false;
    for(const [model,r]of Object.entries(models||{})){
      if(respectFilters&&tab==='details'&&disabledModels.has(model))continue;
      const c=costOf(model,r,respectFilters);
      if(c){usd+=c.usd;has=true;}
    }
    const rate=Number(value?.pricing?.exchangeRate)||6.705;
    return has?{usd,amount:zh()?usd*rate:usd,symbol:zh()?'¥':'$'}:null;
  }
  function formatCost(cost){
    if(!cost||Number.isNaN(cost.amount))return '—';
    const {amount,symbol}=cost;
    if(amount===0)return symbol+'0.00';
    if(amount>0&&amount<0.01)return '< '+symbol+'0.01';
    return symbol+amount.toLocaleString(zh()?'zh-CN':'en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  }
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
    const dark=luminance(background)<.35,offsets=[0,-18,18,-36,36,-9,9,-27,27],tones=dark?[.64,.52,.73,.59,.68]:[.43,.33,.51,.38,.47];
    const end=contrast([255,255,255],background)>contrast([0,0,0],background)?1:0;
    models.forEach((model,i)=>{const hue=(h+offsets[i%offsets.length]+360)%360,saturation=s<.08?.07:Math.max(.28,Math.min(.55,s*.72));let lightness=tones[i%tones.length],c=fromHsl(hue,saturation,lightness);
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
    const tip=$('tip');tip.replaceChildren(node('div','tip-title',bucket.from===bucket.to?bucket.from:bucket.from+' – '+bucket.to),node('strong','',full(bucket.total)+' Token'),node('div','muted',w(`${bucket.requests} 次请求`,`${bucket.requests} requests`)));
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
    button.addEventListener('click',()=>{
      selected=bucket;
      showSelection();
    });
  };
  function showSelection(){
    const bucket=selected||totals(value.today,value.today);
    const isSingleDay=bucket.from===bucket.to;
    let titleStr=isSingleDay?bucket.from:bucket.from+' – '+bucket.to;
    if(isSingleDay){
      const d=new Date(bucket.from+'T00:00:00Z');
      const dayNames=zh()?['周日','周一','周二','周三','周四','周五','周六']:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      titleStr+=' · '+dayNames[d.getUTCDay()];
    }
    text('selection-title',titleStr);

    const uncached=Object.values(bucket.models).reduce((n,r)=>n+(r.uncached||0),0);
    const cacheRead=Object.values(bucket.models).reduce((n,r)=>n+(r.cacheRead||0),0);
    const output=Object.values(bucket.models).reduce((n,r)=>n+(r.output||0),0);
    const c=rangeCost(bucket.models);
    const costText=c?' · '+w(`预估成本 ${formatCost(c)}`,`Est. cost ${formatCost(c)}`):'';
    text('selection-value',full(bucket.total)+' Token · '+w(`${full(bucket.requests)} 次请求`,`${full(bucket.requests)} requests`)+costText);

    const compWrap=$('selection-comp-wrap'),compBar=$('selection-comp-bar'),compLegend=$('selection-comp-legend');
    if(compWrap&&compBar&&compLegend){
      compBar.replaceChildren();compLegend.replaceChildren();
      if(bucket.total>0){
        const uPct=(uncached/bucket.total*100).toFixed(1);
        const cPct=(cacheRead/bucket.total*100).toFixed(1);
        const oPct=(output/bucket.total*100).toFixed(1);
        if(uncached>0){const s=node('div','comp-seg uncached');s.style.width=uPct+'%';compBar.append(s);}
        if(cacheRead>0){const s=node('div','comp-seg cached');s.style.width=cPct+'%';compBar.append(s);}
        if(output>0){const s=node('div','comp-seg output');s.style.width=oPct+'%';compBar.append(s);}
        const items=[
          {label:w('未缓存输入','Uncached'),val:compact(uncached),pct:uPct,type:'uncached'},
          {label:w('缓存读取','Cache read'),val:compact(cacheRead),pct:cPct,type:'cached'},
          {label:w('输出','Output'),val:compact(output),pct:oPct,type:'output'}
        ];
        for(const it of items){
          const itemNode=node('div','comp-item');
          const dot=node('i','comp-dot '+it.type);
          const lbl=node('span','',it.label+':');
          const strong=node('strong','',it.val);
          const sub=node('span','muted',`(${it.pct}%)`);
          itemNode.append(dot,lbl,strong,sub);
          compLegend.append(itemNode);
        }
        compWrap.hidden=false;
      }else{
        compWrap.hidden=true;
      }
    }
  }
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
    text('heat-sub',heatMode==='day'?w('每格代表一天','Each square is one day'):w('每格代表一周 · 周一开始','Each square is one week · starts Monday'));
    const annual=totals(year+'-01-01',year+'-12-31');text('heat-summary',w(`${year} 年 · ${full(annual.total)} Token`,`${year} · ${full(annual.total)} tokens`));
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
    const anchor=getAnchor(period);
    const buckets=[];
    if(period==='day'){const start=month(anchor,0),end=add(month(anchor,1),-1);for(let date=start;date<=end;date=add(date,1))buckets.push(totals(date,date,true));text('range-label',start.slice(0,7));}
    else if(period==='week'){const start=add(week(anchor),-11*7);for(let i=0;i<12;i++){const from=add(start,i*7);buckets.push(totals(from,add(from,6),true));}text('range-label',start.slice(5)+' – '+add(week(anchor),6).slice(5));}
    else{for(let i=-11;i<=0;i++){const from=month(anchor,i);buckets.push(totals(from,add(month(from,1),-1),true));}text('range-label',buckets[0].from.slice(0,7)+' – '+month(anchor,0).slice(0,7));}
    $('next').disabled=period==='week'?week(anchor)>=week(value.today):anchor.slice(0,7)>=value.today.slice(0,7);

    // Row 1: Token Composition filters
    const compFilters=$('comp-filters');
    if(compFilters){
      compFilters.replaceChildren();
      const compItems=[
        ['uncached',w('未缓存输入','Uncached input'),'var(--pulse-accent)'],
        ['cacheRead',w('缓存读取','Cache read'),'#2d8a68'],
        ['output',w('输出','Output'),'#cf7429']
      ];
      for(const [key,label,c] of compItems){
        const button=node('button',''),dot=node('i','dot');
        dot.style.setProperty('--model-color',c);
        button.append(dot,document.createTextNode(label));
        button.type='button';
        const isActive=!disabledComponents.has(key);
        button.setAttribute('aria-pressed',String(isActive));
        button.addEventListener('click',()=>{
          if(disabledComponents.has(key))disabledComponents.delete(key);
          else disabledComponents.add(key);
          renderTotals();
          renderChart();
        });
        compFilters.append(button);
      }
    }

    // Row 2: Models
    $('legend').replaceChildren();
    for(const model of value.models){
      const button=node('button',''),dot=node('i','dot');dot.style.setProperty('--model-color',color(model));
      button.append(dot,document.createTextNode(modelName(model)));button.type='button';button.setAttribute('aria-pressed',String(!disabledModels.has(model)));
      button.addEventListener('click',()=>{
        if(disabledModels.has(model))disabledModels.delete(model);else disabledModels.add(model);
        renderTotals();
        renderChart();
      });
      button.addEventListener('pointerenter',()=>highlightModel(disabledModels.has(model)?null:model));button.addEventListener('pointerleave',()=>highlightModel(null));
      $('legend').append(button);
    }

    for(const b of buckets){
      b.activeTotal=Object.entries(b.models).reduce((sum,[m,r])=>disabledModels.has(m)?sum:sum+modelActiveTokens(r),0);
    }
    const max=Math.max(1,...buckets.map(b=>b.activeTotal));
    const ceiling=max>1?Math.ceil(max/(10**Math.floor(Math.log10(max))))*10**Math.floor(Math.log10(max)):1;

    $('axis').replaceChildren();$('plot').replaceChildren();
    for(let i=0;i<=4;i++){
      const val=ceiling*i/4;
      const label=node('span','',compact(val));
      label.style.bottom=(19+(246-19)*i/4)+'px';$('axis').append(label);
      const line=node('i','grid-line');line.style.bottom=(19+(246-19)*i/4)+'px';$('plot').append(line);
    }

    for(const [i,bucket]of buckets.entries()){
      const button=node('button','bar-column');button.type='button';const stack=node('div','stack');
      const isFocused=focusedBucket&&focusedBucket.from===bucket.from&&focusedBucket.to===bucket.to;
      if(isFocused)button.classList.add('focused-bar');

      const segments=value.models.filter(m=>!disabledModels.has(m)&&modelActiveTokens(bucket.models[m]||{})>0);
      for(const [j,model]of segments.entries()){
        const r=bucket.models[model];
        const activeTokens=modelActiveTokens(r);
        const bar=node('i','bar-segment');
        const height=activeTokens/ceiling*227;
        bar.dataset.model=model;bar.setAttribute('aria-hidden','true');
        bar.style.setProperty('--model-color',color(model));bar.style.height=height+'px';
        if(j&&height>=3)bar.style.boxShadow='inset 0 -1px 0 color-mix(in srgb,var(--pulse-background) 48%,transparent)';
        stack.append(bar);
      }
      if(!bucket.activeTotal)stack.append(node('i','empty-bar'));

      button.append(stack);
      if(period!=='day'||i%3===0||i===buckets.length-1)button.append(node('span','x-label',period==='day'?String(i+1):period==='week'?bucket.from.slice(5):bucket.from.slice(0,7)));
      bindBucket(button,bucket);

      button.addEventListener('click',()=>{
        if(isFocused){
          focusedBucket=null;
        }else{
          let lbl=bucket.from===bucket.to?bucket.from:bucket.from+' – '+bucket.to;
          if(period==='month')lbl=bucket.from.slice(0,7);
          focusedBucket={from:bucket.from,to:bucket.to,label:lbl,models:bucket.models};
        }
        renderTotals();
        renderChart();
      });

      $('plot').append(button);
    }
    if(!buckets.some(b=>b.activeTotal))$('plot').append(node('div','chart-empty',w('所选时段暂无用量记录','No usage recorded in this period')));

    const drilldownBanner=$('drilldown-banner');
    if(focusedBucket){
      const focusedModels=focusedBucket.models||totals(focusedBucket.from,focusedBucket.to,true).models;
      const focusedTotal=Object.entries(focusedModels).reduce((sum,[m,r])=>disabledModels.has(m)?sum:sum+modelActiveTokens(r),0);
      const c=rangeCost(focusedModels,true);
      const costStr=c?formatCost(c):'—';
      text('drilldown-banner-text',w(`筛选：${focusedBucket.label} · ${compact(focusedTotal)} Token · 预估成本 ${costStr}`,`Filtered: ${focusedBucket.label} · ${compact(focusedTotal)} tokens · Est. cost ${costStr}`));
      text('clear-drilldown',w('清除筛选','Clear filter'));
      drilldownBanner.hidden=false;
    }else{
      drilldownBanner.hidden=true;
    }
    $('clear-drilldown').onclick=()=>{
      focusedBucket=null;
      renderTotals();
      renderChart();
    };

    const tableSource=focusedBucket?(focusedBucket.models||totals(focusedBucket.from,focusedBucket.to,true).models):totals(buckets[0].from,buckets.at(-1).to,true).models;
    const activeModelsList=Object.entries(tableSource).filter(([m])=>!disabledModels.has(m));
    const tableTotalTokens=activeModelsList.reduce((sum,[m,r])=>sum+modelActiveTokens(r),0);
    const tableTotalRequests=activeModelsList.reduce((sum,[m,r])=>sum+(r.requests||0),0);
    const tableCostObj=rangeCost(tableSource,true);
    const summaryExtra=tableCostObj?' · '+w(`预估成本 ${formatCost(tableCostObj)}`,`Est. cost ${formatCost(tableCostObj)}`):'';
    chartSummary.replaceChildren(
      node('strong','',compact(tableTotalTokens)+' Token'),
      document.createTextNode(' · '+w(`${full(tableTotalRequests)} 次请求`,`${full(tableTotalRequests)} requests`)+summaryExtra)
    );

    const columns=[
      {key:'model',label:w('模型','Model')},
      {key:'total',label:w('总 Token','Total tokens')},
      {key:'uncached',label:w('未缓存输入','Uncached input')},
      {key:'cacheRead',label:w('缓存读取','Cache read')},
      {key:'output',label:w('输出','Output')},
      {key:'cost',label:w('成本','Cost')}
    ];
    $('table-head').replaceChildren(...columns.map(col=>{
      const th=node('th','sortable');
      th.append(node('span','',col.label));
      if(sortKey===col.key){
        th.append(node('span','sort-arrow',sortOrder==='asc'?'▲':'▼'));
      }
      th.addEventListener('click',()=>{
        if(sortKey===col.key){
          sortOrder=sortOrder==='asc'?'desc':'asc';
        }else{
          sortKey=col.key;
          sortOrder=col.key==='model'?'asc':'desc';
        }
        renderChart();
      });
      return th;
    }));

    $('table-body').replaceChildren();
    const rowsData=[];
    for(const [model,r]of Object.entries(tableSource)){
      if(disabledModels.has(model))continue;
      const activeTokens=modelActiveTokens(r);
      const c=costOf(model,r,true);
      rowsData.push({model,r,activeTokens,costUSD:c?c.usd:0,costObj:c});
    }

    rowsData.sort((a,b)=>{
      let cmp=0;
      if(sortKey==='model')cmp=a.model.localeCompare(b.model);
      else if(sortKey==='total')cmp=a.activeTokens-b.activeTokens;
      else if(sortKey==='uncached')cmp=(a.r.uncached||0)-(b.r.uncached||0);
      else if(sortKey==='cacheRead')cmp=(a.r.cacheRead||0)-(b.r.cacheRead||0);
      else if(sortKey==='output')cmp=(a.r.output||0)-(b.r.output||0);
      else if(sortKey==='cost')cmp=a.costUSD-b.costUSD;
      return sortOrder==='asc'?cmp:-cmp;
    });

    for(const item of rowsData){
      const {model,r,activeTokens,costObj}=item;
      const row=node('tr','');
      const label=node('td',''),dot=node('span','dot');dot.style.setProperty('--model-color',color(model));
      label.append(dot,document.createTextNode(modelName(model)));

      const tdTotal=node('td','',full(activeTokens));
      const makeValCell=(key,val)=>{
        const td=node('td','');
        if(disabledComponents.has(key)){
          const s=node('s','excluded-val',full(val));
          td.append(s);
        }else{
          td.textContent=full(val);
        }
        return td;
      };

      const tdUncached=makeValCell('uncached',r.uncached||0);
      const tdCacheRead=makeValCell('cacheRead',r.cacheRead||0);
      const tdOutput=makeValCell('output',r.output||0);
      const tdCost=node('td','',formatCost(costObj));

      row.append(label,tdTotal,tdUncached,tdCacheRead,tdOutput,tdCost);
      $('table-body').append(row);
    }

    for(const b of view.querySelectorAll('[data-period]'))b.setAttribute('aria-pressed',String(b.dataset.period===period));
  }
  function renderTotals(){
    $('totals').replaceChildren();
    if(!value)return;

    if(tab==='overview'){
      const all=totals('2000-01-01','2099-12-31');
      const activeDays=(value.days||[]).filter(d=>Object.values(d.models||{}).some(r=>r.total>0)).length;
      const uncached=Object.values(all.models).reduce((n,r)=>n+(r.uncached||0),0);
      const cacheRead=Object.values(all.models).reduce((n,r)=>n+(r.cacheRead||0),0);
      const output=Object.values(all.models).reduce((n,r)=>n+(r.output||0),0);
      const unPct=all.total>0?(uncached/all.total*100).toFixed(1):'0.0';
      const hitRate=(uncached+cacheRead)>0?(cacheRead/(uncached+cacheRead)*100).toFixed(1):'0.0';
      const mult=uncached>0?(cacheRead/uncached).toFixed(1):'—';
      const allCost=rangeCost(all.models,false);
      const costStr=allCost?formatCost(allCost):'—';

      const cards=[
        {
          label:w('累计用量','Total usage'),
          val:compact(all.total),
          unit:'Token',
          title:full(all.total)+' Token',
          sub:w(`共 ${full(value.requests)} 次请求 · 活跃 ${activeDays} 天`,`${full(value.requests)} requests · ${activeDays} active days`)
        },
        {
          label:w('未缓存输入','Uncached input'),
          val:compact(uncached),
          unit:'Token',
          title:full(uncached)+' Token',
          sub:w(`输入占比 ${unPct}%`,`${unPct}% of total`)
        },
        {
          label:w('缓存读取','Cache read'),
          val:compact(cacheRead),
          unit:'Token',
          title:full(cacheRead)+' Token',
          sub:w(`缓存命中率 ${hitRate}% · 节省约 ${mult} 倍`,`Hit rate ${hitRate}% · ~${mult}x savings`)
        },
        {
          label:w('输出','Output'),
          val:compact(output),
          unit:'Token',
          title:full(output)+' Token',
          sub:w(`预估成本 ${costStr}`,`Est. cost ${costStr}`)
        }
      ];

      for(const c of cards){
        const metric=node('div','metric');
        const n=node('div','value',c.val);
        n.append(node('span','unit',c.unit));
        metric.append(node('label','',c.label),n,node('div','metric-sub',c.sub));
        metric.title=c.title;
        $('totals').append(metric);
      }
      return;
    }

    let rangeStart,rangeEnd,scopeLabel;
    const anchor=getAnchor(period);
    if(focusedBucket){
      rangeStart=focusedBucket.from;rangeEnd=focusedBucket.to;
      scopeLabel=focusedBucket.label;
    }else if(period==='day'){
      rangeStart=value.today;rangeEnd=value.today;
      scopeLabel=w('今日用量','Today');
    }else if(period==='week'){
      rangeStart=week(anchor);rangeEnd=add(rangeStart,6);
      scopeLabel=w('本周用量','This week');
    }else{
      rangeStart=month(anchor,0);rangeEnd=add(month(anchor,1),-1);
      scopeLabel=w('本月用量','This month');
    }

    const scoped=totals(rangeStart,rangeEnd,true);
    const activeModels=Object.entries(scoped.models).filter(([m])=>!disabledModels.has(m));
    const activeTotal=activeModels.reduce((n,[m,r])=>n+modelActiveTokens(r),0);
    const uncached=activeModels.reduce((n,[m,r])=>n+(r.uncached||0),0);
    const cacheRead=activeModels.reduce((n,[m,r])=>n+(r.cacheRead||0),0);
    const output=activeModels.reduce((n,[m,r])=>n+(r.output||0),0);
    const scopedCost=rangeCost(scoped.models,true);
    const costStr=scopedCost?formatCost(scopedCost):'—';

    let card1Sub=w(`${full(scoped.requests)} 次请求`,`${full(scoped.requests)} requests`);
    if(focusedBucket){
      card1Sub=w(`聚焦切片 · ${full(scoped.requests)} 次请求`,`Slice · ${full(scoped.requests)} requests`);
    }else if(period==='week'){
      const avg=(scoped.total/7/1e6).toFixed(1);
      card1Sub=w(`${full(scoped.requests)} 次请求 · 日均 ${avg}M`,`${full(scoped.requests)} reqs · ${avg}M/day`);
    }else if(period==='month'){
      const mDays=(value.days||[]).filter(d=>d.date>=rangeStart&&d.date<=rangeEnd&&Object.values(d.models||{}).some(r=>r.total>0)).length;
      card1Sub=w(`${full(scoped.requests)} 次请求 · 活跃 ${mDays} 天`,`${full(scoped.requests)} reqs · ${mDays} active days`);
    }

    const cards=[
      {
        label:scopeLabel,
        val:compact(activeTotal),
        unit:'Token',
        title:full(activeTotal)+' Token',
        excluded:false,
        sub:card1Sub
      },
      {
        label:period==='week'?w('周未缓存输入','Week uncached'):(period==='month'?w('月未缓存输入','Month uncached'):w('未缓存输入','Uncached input')),
        val:compact(uncached),
        unit:'Token',
        title:full(uncached)+' Token',
        excluded:disabledComponents.has('uncached'),
        sub:disabledComponents.has('uncached')?w('未计入本次计算','Excluded from total'):w(`占总计 ${(activeTotal>0?(uncached/activeTotal*100).toFixed(1):'0.0')}%`,`${(activeTotal>0?(uncached/activeTotal*100).toFixed(1):'0.0')}% of total`)
      },
      {
        label:period==='week'?w('周缓存读取','Week cache read'):(period==='month'?w('月缓存读取','Month cache read'):w('缓存读取','Cache read')),
        val:compact(cacheRead),
        unit:'Token',
        title:full(cacheRead)+' Token',
        excluded:disabledComponents.has('cacheRead'),
        sub:disabledComponents.has('cacheRead')?w('未计入本次计算','Excluded from total'):w(`缓存读取 ${(cacheRead>0?(cacheRead/(uncached+cacheRead)*100).toFixed(1):'0.0')}%`,`${(cacheRead>0?(cacheRead/(uncached+cacheRead)*100).toFixed(1):'0.0')}% of total`)
      },
      {
        label:period==='week'?w('周输出','Week output'):(period==='month'?w('月输出','Month output'):w('输出','Output')),
        val:compact(output),
        unit:'Token',
        title:full(output)+' Token',
        excluded:disabledComponents.has('output'),
        sub:w(`预估成本 ${costStr}`,`Est. cost ${costStr}`)
      }
    ];

    for(const c of cards){
      const metric=node('div','metric');
      const n=node('div','value');
      if(c.excluded){
        const s=node('s','excluded-val',c.val);
        n.append(s);
      }else{
        n.textContent=c.val;
      }
      n.append(node('span','unit',c.unit));
      metric.append(node('label','',c.label),n,node('div','metric-sub',c.sub));
      metric.title=c.title;
      $('totals').append(metric);
    }
  }
  function render(){
    renderGuide();
    renderUpdateBanner();
    if(!value){
      closeYear(false);$('tip').hidden=true;$('overview').hidden=true;$('details').hidden=true;$('usage-waiting').hidden=false;
      text('usage-waiting',w('正在重新连接统计…','Reconnecting usage…'));text('subtitle',w('正在重新连接本机统计','Reconnecting local usage'));text('coverage','');text('timezone','');$('alert').hidden=true;
      for(const metric of $('totals').children){metric.title='';metric.querySelector('.value')?.replaceChildren(node('span','','—'));}
      return;
    }
    $('usage-waiting').hidden=true;
    syncPalette();
    text('title',w('用量统计','Token usage'));text('subtitle',w(`本机 ${hostLabel} · 当前账号`,`Local ${hostLabel} · current account`));
    text('overview-tab',w('活动概览','Activity'));text('details-tab',w('用量详情','Usage details'));text('activity-title',w('Token 活动','Token activity'));text('detail-title',w('按模型统计','Usage by model'));
    text('locale-label',zh()?'EN':'中');for(const [id,label]of [['locale',w('切换到英文','Switch to Chinese')],['refresh',w('刷新用量','Refresh usage')],['close',w('关闭','Close')]]){$(id).setAttribute('aria-label',label);$(id).title=label;}text('less',w('少','Less'));text('more',w('多','More'));text('selection-details',w('查看这段用量 →','View usage →'));
    for(const b of view.querySelectorAll('[data-heat]'))b.textContent=b.dataset.heat==='day'?w('每天','Daily'):w('每周','Weekly');
    for(const b of view.querySelectorAll('[data-period]'))b.textContent=({day:w('天','Day'),week:w('周','Week'),month:w('月','Month')})[b.dataset.period];
    $('overview-tab').setAttribute('aria-selected',String(tab==='overview'));$('details-tab').setAttribute('aria-selected',String(tab==='details'));$('overview').hidden=tab!=='overview';$('details').hidden=tab!=='details';
    renderTotals();
    const years=[];const first=Number(value.firstDate?.slice(0,4)||value.today.slice(0,4)),currentYear=Number(value.today.slice(0,4)),minimum=Math.max(first,currentYear-10);for(let y=currentYear;y>=minimum;y--)years.push(y);
    if($('year').dataset.years!==years.join(',')){
      $('year-menu').replaceChildren(...years.map(y=>{const option=node('button','year-option');option.type='button';option.dataset.year=String(y);option.setAttribute('role','option');option.tabIndex=-1;
        setMarkup(option,'<span></span><svg class="year-check" viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7"/></svg>');option.firstElementChild.textContent=String(y);
        option.addEventListener('click',()=>{year=String(y);syncYear();closeYear();renderHeat();});return option;}));$('year').dataset.years=years.join(',');
    }
    syncYear();
    text('coverage',w(`已记录 ${full(value.requests)} 次请求${value.firstDate?' · 始于 '+value.firstDate:''}`,`${full(value.requests)} requests recorded${value.firstDate?' · since '+value.firstDate:''}`));
    text('timezone',value.timeZone+' · '+(value.syncing?w('正在补录历史…','Syncing history…'):w('本地统计','Local usage')));
    const alerts=[];if(value.unknownRequests)alerts.push(w(`${value.unknownRequests} 次请求日期未知，共 ${compact(value.unknownTokens)} Token`,`${value.unknownRequests} undated requests · ${compact(value.unknownTokens)} tokens`));
    if(value.partialRequests||value.unreadableFiles||value.missingConversations||value.persistenceError)alerts.push(w('部分记录暂不可读取，用量可能不完整','Some records are unavailable; usage may be incomplete'));
    $('alert').hidden=!alerts.length;text('alert',alerts.join(' · '));
    if(tab==='overview')renderHeat();else renderChart();
  }
  function changeTab(next){closeYear(false);tab=next;$('tip').hidden=true;renderTotals();render();}
  $('overview-tab').addEventListener('click',()=>changeTab('overview'));$('details-tab').addEventListener('click',()=>changeTab('details'));
  for(const b of view.querySelectorAll('[data-heat]'))b.addEventListener('click',()=>{heatMode=b.dataset.heat;renderHeat();});
  for(const b of view.querySelectorAll('[data-period]'))b.addEventListener('click',()=>{
    const nextPeriod=b.dataset.period;
    focusedBucket=null;
    if(period!==nextPeriod){
      period=nextPeriod;
      if(!periodAnchors[period]||(value?.today&&periodAnchors[period].slice(0,7)>=value.today.slice(0,7))){
        periodAnchors[period]=value?.today||null;
      }
    }
    renderTotals();
    renderChart();
  });
  function syncYear(){
    text('year-label',String(year));$('year').setAttribute('aria-label',w('选择年份','Select year')+' · '+year);$('year-menu').setAttribute('aria-label',w('年份','Year'));
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
  $('selection-details').addEventListener('click',()=>{
    const target=selected?.from||value?.today;
    period=heatMode==='week'?'week':'day';
    periodAnchors[period]=value?.today&&target>value.today?value.today:target;
    if(period==='day')focusedBucket={from:target,to:target,label:target};
    changeTab('details');
  });
  for(const [id,step]of [['previous',-1],['next',1]])$(id).addEventListener('click',()=>{
    focusedBucket=null;
    const cur=getAnchor(period);
    let nextDate;
    if(period==='day'){
      nextDate=month(cur,step);
      if(step>0&&value?.today&&nextDate>value.today)nextDate=value.today;
    }else if(period==='week'){
      nextDate=add(week(cur),step*84);
      if(step>0&&value?.today&&nextDate>value.today)nextDate=value.today;
    }else{
      nextDate=month(cur,step*12);
      if(step>0&&value?.today&&nextDate>value.today)nextDate=value.today;
    }
    periodAnchors[period]=nextDate;
    renderTotals();
    renderChart();
  });
  $('locale').addEventListener('click',()=>void onLanguage(zh()?'en':'zh-CN'));
  $('refresh').addEventListener('click',async()=>{
    if(busy||disposed)return;busy=true;const button=$('refresh'),turn=600,started=performance.now();button.disabled=true;button.setAttribute('aria-busy','true');
    refreshMotion=button.querySelector('svg').animate([{transform:'rotate(0deg)'},{transform:'rotate(360deg)'}],{duration:turn,iterations:Infinity});
    try{await onRefresh();}
    catch{if(!disposed){text('alert',w('暂时无法刷新，请稍后重试','Refresh unavailable. Try again shortly.'));$('alert').hidden=false;}}
    finally{
      if(!disposed){const elapsed=performance.now()-started,remaining=Math.max(turn,Math.ceil(elapsed/turn)*turn)-elapsed;
        await new Promise(resolve=>{finishRefresh=resolve;refreshDelay=setTimeout(resolve,Math.max(0,remaining));});}
      clearTimeout(refreshDelay);refreshDelay=null;finishRefresh=null;refreshMotion?.cancel();refreshMotion=null;busy=false;
      if(!disposed){button.disabled=false;button.setAttribute('aria-busy','false');}
    }
  });
  function close(){closeYear(false);dialog.close();$('tip').hidden=true;opener?.focus({preventScroll:true});}
  $('close').addEventListener('click',close);dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});
  const contentKey=data=>JSON.stringify([{...data,updatedAt:undefined},language.language,themeSignature()]);
  const themeObserver=new MutationObserver(()=>{if(!disposed&&value&&dialog.open){const key=contentKey(value);if(key!==lastKey){lastKey=key;render();}}});
  if(root.host)themeObserver.observe(root.host,{attributes:true,attributeFilter:['data-pulse-theme','style']});
  return {open(data,trigger){if(!data||disposed)return;accountKey=data.accountKey;value=data;opener=trigger;year=data.today.slice(0,4);periodAnchors.day=data.today;periodAnchors.week=data.today;periodAnchors.month=data.today;focusedBucket=null;lastKey=contentKey(data);render();if(!dialog.open)dialog.showModal();},
    update(data){if(disposed)return;if(!data){if(!value)return;value=null;lastKey='';if(dialog.open)render();return;}const prevToday=value?.today;if(accountKey&&accountKey!==data.accountKey){selected=null;disabledModels.clear();focusedBucket=null;year=data.today.slice(0,4);periodAnchors.day=data.today;periodAnchors.week=data.today;periodAnchors.month=data.today;}else if(prevToday&&prevToday!==data.today){year=data.today.slice(0,4);for(const p of ['day','week','month'])if(!periodAnchors[p]||periodAnchors[p]>=prevToday)periodAnchors[p]=data.today;}accountKey=data.accountKey;value=data;if(!dialog.open)return;const key=contentKey(data);if(key===lastKey)return;lastKey=key;render();},
    restoreModal(){if(!disposed&&dialog.open&&dialog.isConnected&&!dialog.matches(':modal')){closeYear(false);dialog.close();dialog.showModal();}},
    close,syncGuideDismissed(){if(!replayGuide)dismissGuide();},dispose(){disposed=true;themeObserver.disconnect();clearTimeout(refreshDelay);finishRefresh?.();refreshMotion?.cancel();closeYear(false);window.removeEventListener('resize',positionYear);dialog.close();dialog.remove();backdrop.remove();},get isOpen(){return dialog.open;}};
};
