// Shared theme tokens; text-only release notes. Network checks require a click.
module.exports = function createUpdateMenu({root,row,language,setMarkup,request,onOpen}){
 const button=document.createElement('button');button.type='button';button.className='update-menu-button';button.id='plugin-menu-button';button.textContent='⋯';button.setAttribute('aria-haspopup','menu');button.setAttribute('aria-expanded','false');row.append(button);
 const menu=document.createElement('div');menu.className='update-menu';menu.id='plugin-menu';menu.hidden=true;menu.setAttribute('role','menu');
 setMarkup(menu,'<button type="button" id="check-update" role="menuitem"><span></span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M12 6a5 5 0 1 0 0 4M12 2v4H8"/></svg></button>');row.append(menu);
 const dialog=document.createElement('dialog');dialog.id='plugin-update-dialog';dialog.className='update-dialog';
 setMarkup(dialog,'<header><strong id="update-title"></strong><button id="update-close" type="button">×</button></header><div class="update-status"><span id="update-icon" aria-hidden="true">↻</span><strong id="update-status"></strong></div><dl><div><dt id="update-current-label"></dt><dd id="update-current"></dd></div><div><dt id="update-latest-label"></dt><dd id="update-latest"></dd></div><div><dt id="update-host-label"></dt><dd>Antigravity App</dd></div></dl><section id="update-notes-wrap" hidden><h2 id="update-notes-label"></h2><p id="update-notes"></p></section><footer><span id="update-feedback" role="status"></span><button id="update-action" type="button" hidden></button></footer>');root.append(dialog);
 const progressView=document.createElement('div');progressView.className='update-progress';
 setMarkup(progressView,'<div class="update-progress-caption"><span id="update-progress-label"></span><span id="update-progress-value"></span></div><div id="update-progress-track" class="update-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i id="update-progress-fill"></i><i class="update-progress-sheen"></i></div>');dialog.querySelector('.update-status').after(progressView);
 setMarkup(dialog.querySelector('#update-icon'),'<svg viewBox="0 0 20 20" aria-hidden="true"><path id="update-symbol" d="M15.7 8a6 6 0 1 0-.2 4.5M16 3.5V8h-4.5"/></svg>');
 const css=document.createElement('style');css.textContent=`
 .card-language{position:relative}.update-menu-button{border:0;background:transparent;color:var(--pulse-muted);width:22px;height:24px;padding:0;flex:none;line-height:20px;font-size:18px;border-radius:5px;cursor:pointer}.update-menu-button:hover,.update-menu-button[aria-expanded=true]{color:var(--pulse-foreground);background:var(--pulse-hover)}
 .update-menu{position:absolute;right:0;bottom:calc(100% + 6px);padding:4px;min-width:140px;border:1px solid var(--pulse-border);border-radius:8px;background:var(--pulse-menu);box-shadow:0 6px 22px var(--pulse-shadow);z-index:20}.update-menu[hidden]{display:none}.update-menu button{display:flex;align-items:center;justify-content:space-between;width:100%;gap:14px;padding:8px 10px;border:0;border-radius:5px;background:transparent;color:var(--pulse-foreground);font:inherit;font-size:11px;cursor:pointer}.update-menu button:hover{background:var(--pulse-hover)}.update-menu svg{width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
 .update-dialog{width:min(400px,calc(100vw - 32px));box-sizing:border-box;padding:20px;border:1px solid var(--pulse-border);border-radius:15px;background:var(--pulse-background);color:var(--pulse-foreground);box-shadow:0 20px 80px var(--pulse-shadow);font:12px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif}.update-dialog::backdrop{background:#0007;backdrop-filter:blur(3px)}.update-dialog header{display:flex;align-items:center;justify-content:space-between;margin-bottom:22px}.update-dialog header strong{font-size:14px}.update-dialog header button{width:26px;height:26px;border:0;border-radius:6px;background:transparent;color:var(--pulse-muted);font-size:20px;cursor:pointer}.update-dialog header button:hover{background:var(--pulse-hover);color:var(--pulse-foreground)}.update-status{display:flex;align-items:center;gap:12px;margin:0 0 22px}.update-status>span{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:var(--pulse-hover);color:var(--pulse-accent);font-size:22px}.update-status strong{font-size:16px;font-weight:550}.update-dialog dl>div{display:flex;justify-content:space-between;gap:14px;margin:8px 0}.update-dialog dt{color:var(--pulse-muted);font-size:11px}.update-dialog dd{margin:0;font-size:12px;font-variant-numeric:tabular-nums}.update-dialog section{padding-top:15px;margin-top:18px;border-top:1px solid var(--pulse-separator)}.update-dialog section[hidden]{display:none}.update-dialog h2{font-size:11px;color:var(--pulse-muted);font-weight:500;margin:0 0 7px}.update-dialog section p{max-height:180px;overflow:auto;white-space:pre-line;margin:0;font-size:11px;line-height:1.7}.update-dialog footer{display:flex;align-items:center;justify-content:flex-end;gap:12px;padding-top:18px;margin-top:18px;border-top:1px solid var(--pulse-separator)}.update-dialog footer span{margin-right:auto;color:var(--pulse-muted);font-size:10px}.update-dialog footer button{padding:6px 13px;border:1px solid var(--pulse-border);border-radius:7px;background:var(--pulse-hover);color:var(--pulse-foreground);font:inherit;cursor:pointer}.update-dialog footer button[hidden]{display:none}.update-dialog footer button{border-color:color-mix(in srgb,var(--pulse-accent) 60%,var(--pulse-border));background:color-mix(in srgb,var(--pulse-accent) 18%,var(--pulse-background));font-weight:550}.update-dialog button:active{transform:scale(.97)}.update-dialog button:focus-visible,.update-menu button:focus-visible,.update-menu-button:focus-visible{outline:2px solid var(--pulse-accent);outline-offset:2px}.update-dialog[aria-busy=true] #update-icon{animation:update-spin 900ms linear infinite}@keyframes update-spin{to{transform:rotate(360deg)}}
 `;root.append(css);
 // A glyph uses the inherited text line box and font metrics, which can exceed
 // the 26px button. Center a fixed-size vector independently of either.
 setMarkup(dialog.querySelector('#update-close'),'<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 4l8 8M12 4l-8 8"/></svg>');
 css.textContent+=' .update-dialog header button{display:grid;place-items:center;flex:0 0 26px;min-width:26px;min-height:26px;padding:0;margin:0;line-height:1;appearance:none}.update-dialog header button svg{display:block;width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}';
 css.textContent+=`
 .update-progress{margin:-5px 0 22px;min-height:32px}.update-progress-caption{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:9px;font-size:10px;line-height:16px;color:var(--pulse-muted)}#update-progress-label{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#update-progress-value{flex:none;font-variant-numeric:tabular-nums}
 .update-progress-track{position:relative;height:5px;overflow:hidden;isolation:isolate;border-radius:999px;background:var(--pulse-track)}#update-progress-fill{position:absolute;inset:0;border-radius:inherit;background:var(--pulse-accent);transform-origin:left;transform:scaleX(0);transition:transform 260ms cubic-bezier(.23,1,.32,1),opacity 180ms ease;will-change:transform}.update-progress-sheen{position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--pulse-foreground) 40%,transparent),transparent);opacity:0;transform:translateX(-100%)}
 .update-dialog[data-progress=unknown] #update-progress-fill{animation:update-flow 1400ms linear infinite;transition:opacity 180ms ease}.update-dialog[data-progress=known][aria-busy=true] .update-progress-sheen{opacity:.32;animation:update-sheen 1600ms linear infinite}.update-dialog[data-progress=error] #update-progress-fill{background:var(--pulse-warning);opacity:.65}.update-dialog:not([open]) #update-progress-fill,.update-dialog:not([open]) .update-progress-sheen{animation-play-state:paused}
 .update-dialog[aria-busy=true] #update-icon{animation:none}.update-status>span{flex:none}#update-icon svg{display:block;width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}#update-icon[data-busy=true] svg{animation:update-spin 900ms linear infinite}#update-icon[data-complete=true] svg{animation:update-settle 220ms cubic-bezier(.23,1,.32,1) both}
 @keyframes update-flow{from{transform:translateX(-38%) scaleX(.38)}to{transform:translateX(100%) scaleX(.38)}}@keyframes update-sheen{to{transform:translateX(100%)}}@keyframes update-settle{from{transform:scale(.92);opacity:.45}to{transform:scale(1);opacity:1}}
 @media(prefers-reduced-motion:reduce){.update-dialog[data-progress=unknown] #update-progress-fill{animation:update-breathe 1200ms linear infinite;transform:scaleX(.4)}.update-progress-sheen{animation:none!important}#update-icon[data-busy=true] svg{animation:update-breathe 1200ms linear infinite}#update-icon[data-complete=true] svg{animation:none}}@keyframes update-breathe{0%,100%{opacity:.45}50%{opacity:1}}
 `;
 const $=id=>dialog.querySelector('#'+id),zh=()=>language.language==='zh-CN'||language.language==='zh-TW',tw=()=>language.language==='zh-TW',w=(cn,en,twText)=>(tw()&&twText!==undefined)?twText:(zh()?cn:en);
 let state={state:'idle'},disposed=false,timer=null,epoch=0,busy=false,lastRender='',meterPhase=null,meterFrame=null,meterRestoreFrame=null;
 function closeMenu(){menu.hidden=true;button.setAttribute('aria-expanded','false');}
 function render(){
  const signature=JSON.stringify([language.language,state,busy]);if(signature===lastRender)return;lastRender=signature;
  button.setAttribute('aria-label',w('插件菜单','Plugin menu','外掛功能表'));button.title=button.getAttribute('aria-label');menu.firstElementChild.firstElementChild.textContent=w('检查更新','Check for updates','檢查更新');
  $('update-title').textContent=w('插件更新','Plugin update','外掛更新');$('update-close').setAttribute('aria-label',w('关闭','Close','關閉'));
  const status={checking:w('正在检查…','Checking…','正在檢查…'),current:w('已是最新版本','You’re up to date','已是最新版本'),available:w('发现新版本','Update available','發現新版本'),installing:w('正在校验并安装…','Verifying and installing…','正在驗證並安裝…'),installed:w('更新已完成','Update installed','更新已完成'),reloading:w('正在重新加载…','Reloading…','正在重新載入…'),error:w('更新未完成','Update incomplete','更新未完成'),idle:w('检查更新','Check for updates','檢查更新')};
  $('update-status').textContent=status[state.state]||status.error;dialog.setAttribute('aria-busy',String(['checking','installing','reloading'].includes(state.state)));
  renderProgress();
  $('update-current-label').textContent=w('当前版本','Installed','目前版本');$('update-latest-label').textContent=w('最新版本','Latest','最新版本');$('update-host-label').textContent=w('安装类型','Installation','安裝類型');$('update-current').textContent=state.currentVersion?'v'+state.currentVersion:'—';$('update-latest').textContent=state.latestVersion?'v'+state.latestVersion:'—';
  $('update-notes-wrap').hidden=state.state!=='available'||!state.notes;$('update-notes-label').textContent=w('更新内容','What’s new','更新內容');$('update-notes').textContent=(state.notes||'').split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#')).slice(0,3).join('\n');
  const errors={network:w('连接失败，请稍后重试','Connection failed. Please retry.','連線失敗，請稍後重試'),python:w('未找到 Python','Python was not found.','找不到 Python'),verification:w('未通过安装包校验','Package verification failed.','安裝套件驗證未通過'),location:w('无法确认插件安装目录，请检查目录位置或链接后重试','Plugin installation location could not be verified. Check its location or links and retry.','無法確認外掛安裝目錄，請檢查目錄位置或連結後重試'),busy:w('已有更新正在进行','Another update is in progress.','已有更新正在進行中'),install:w('未能确认安装完成，请重新检查更新','Installation could not be confirmed. Check for updates again.','未能確認安裝完成，請重新檢查更新'),rollback:w('恢复失败，可从备份恢复','Recovery failed; a local backup is available.','還原失敗，可從本機備份還原')};
  const details={
   timeout:w('连接超时，请检查网络后重试','Connection timed out. Check your network and retry.','連線逾時，請檢查網路後重試'),
   dns:w('无法解析 GitHub 地址，请检查网络','Could not resolve GitHub. Check your network.','無法解析 GitHub 位址，請檢查網路'),
   certificate:w('无法验证下载连接的证书，请检查代理证书','The download certificate could not be verified. Check proxy certificate trust.','無法驗證下載連線憑證，請檢查代理憑證'),
   proxy:w('代理连接失败，请检查代理设置','Proxy connection failed. Check proxy settings.','代理連線失敗，請檢查代理設定'),
   http:w('GitHub 暂时拒绝下载，请稍后重试','GitHub rejected the download. Please retry later.','GitHub 暫時拒絕下載，請稍後重試'),
   connection:w('下载连接中断，请检查网络后重试','Download connection failed. Check your network and retry.','下載連線中斷，請檢查網路後重試'),
   permission:w('插件目录被占用或无写入权限，请关闭其他实例后重试','Plugin files are locked or not writable. Close other instances and retry.','外掛目錄被占用或無寫入權限，請關閉其他執行個體後重試'),
   'python-version':w('需要 Python 3.10 或更新版本','Python 3.10 or newer is required.','需要 Python 3.10 或更新版本'),
   'python-missing':w('未找到可用的 Python，请安装 Python 3.10+','No working Python found. Install Python 3.10+.','找不到可用的 Python，請安裝 Python 3.10+'),
   'install-location':errors.location,
   'plan-expired':w('更新信息已变化或过期，请重新检查更新','Update information changed or expired. Check for updates again.','更新資訊已變更或過期，請重新檢查更新'),
  };
  $('update-feedback').textContent=state.state==='error'?(details[state.errorDetail]||errors[state.error]||errors.network):state.state==='available'?w('设置和统计记录将保留','Settings and statistics are retained','現有設定與統計記錄將會保留'):'';
  const actionable=['available','installed','error'].includes(state.state);$('update-action').hidden=!actionable;$('update-action').disabled=busy;
  $('update-action').textContent=state.state==='installed'?w('重新加载插件','Reload plugin','重新載入外掛'):state.state==='error'?w('重试','Retry','重試'):w('更新','Update','更新');
 }
 function renderProgress(){
  const progress=state.progress||{},phase=progress.phase;
  const complete=['current','available','installed'].includes(state.state),active=['checking','installing','reloading'].includes(state.state);
  const labels={check:w('正在连接发布源','Connecting to releases','正在連線至發布來源'),download:w('正在下载更新','Downloading update','正在下載更新'),verify:w('正在校验安装包','Verifying package','正在驗證安裝套件'),extract:w('正在准备文件','Preparing files','正在準備檔案'),backup:w('正在备份当前版本','Backing up installed version','正在備份目前版本'),install:w('正在安装文件','Installing files','正在安裝檔案'),recover:w('正在恢复原版本','Restoring previous version','正在還原先前版本'),complete:w('更新完成','Update complete','更新完成')};
  const known=state.state==='installing'&&phase==='download'&&Number.isSafeInteger(progress.total)&&progress.total>0&&Number.isSafeInteger(progress.received)&&progress.received>=0&&progress.received<=progress.total;
  const fraction=known?progress.received/progress.total:complete?1:null;
  const nextMeterPhase=state.state+':'+(known?'download':phase||'unknown');
  if(meterPhase!==nextMeterPhase){
   meterPhase=nextMeterPhase;cancelAnimationFrame(meterFrame);cancelAnimationFrame(meterRestoreFrame);
   // A finished check is a different task from a fresh download. Do not
   // animate its 100% backwards into the new download's measured fraction.
   $('update-progress-fill').style.transition='none';
   meterFrame=requestAnimationFrame(()=>{meterRestoreFrame=requestAnimationFrame(()=>{if(!disposed)$('update-progress-fill').style.removeProperty('transition');});});
  }
  let label=labels[phase]||w('正在处理','Working','正在處理中');
  if(state.state==='checking')label=labels.check;
  else if(state.state==='current')label=w('检查完成','Check complete','檢查完成');
  else if(state.state==='available')label=w('准备就绪','Ready to update','準備就緒');
  else if(state.state==='installed')label=labels.complete;
  else if(state.state==='reloading')label=w('正在重新加载插件','Reloading plugin','正在重新載入外掛');
  else if(state.state==='error')label=w('操作未完成，可重试','Not completed. Retry available.','操作未完成，可重試');
  $('update-progress-label').textContent=label;
  $('update-progress-value').textContent=known?`${(progress.received/1048576).toFixed(1)} / ${(progress.total/1048576).toFixed(1)} MB · ${Math.floor(fraction*100)}%`:complete?'100%':'';
  dialog.dataset.progress=state.state==='error'?'error':fraction===null?'unknown':'known';
  const track=$('update-progress-track');track.setAttribute('aria-label',label);
  if(fraction!==null){track.setAttribute('aria-valuenow',String(Math.floor(fraction*100)));$('update-progress-fill').style.transform=`scaleX(${fraction})`;}
  else{track.removeAttribute('aria-valuenow');$('update-progress-fill').style.removeProperty('transform');}
  const icon=$('update-icon');icon.dataset.busy=String(active);icon.dataset.complete=String(complete);
  $('update-symbol').setAttribute('d',complete?'M4.5 10l3.5 3.5 7.5-7.5':'M15.7 8a6 6 0 1 0-.2 4.5M16 3.5V8h-4.5');
 }
 async function call(action){
  const ticket=++epoch;busy=true;if(action==='check')state={...state,state:'checking',progress:{phase:'check'}};if(action==='apply')state={...state,state:'installing',progress:{phase:'verify'}};render();
  try{const result=await request({action,...(action==='apply'?{version:state.latestVersion}:{})});if(disposed||ticket!==epoch)return;if(!result||result.error&&!result.state)throw Error('network');state=result;}
  catch{if(!disposed&&ticket===epoch)state={...state,state:'error',error:'network'};}
  finally{if(!disposed&&ticket===epoch){busy=false;render();if(['checking','installing'].includes(state.state)){clearTimeout(timer);timer=setTimeout(()=>void call('status'),800);}}}
 }
 button.addEventListener('click',()=>{menu.hidden=!menu.hidden;button.setAttribute('aria-expanded',String(!menu.hidden));render();});
 menu.firstElementChild.addEventListener('click',()=>{closeMenu();onOpen?.();dialog.showModal();void call('check');});
 $('update-close').addEventListener('click',()=>{dialog.close();closeMenu();});
 $('update-action').addEventListener('click',()=>void call(state.state==='installed'?'reload':state.state==='error'?'check':'apply'));
 root.addEventListener('pointerdown',event=>{const path=event.composedPath();if(!path.includes(menu)&&!path.includes(button))closeMenu();});
 menu.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeMenu();button.focus();}});
 render();return {localize:render,dispose(){disposed=true;epoch++;clearTimeout(timer);cancelAnimationFrame(meterFrame);cancelAnimationFrame(meterRestoreFrame);dialog.close();dialog.remove();menu.remove();button.remove();css.remove();}};
};
