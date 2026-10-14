// Shared, serializable translations for the inline widget and native panel.
module.exports = function createDashboardI18n(initialLanguage) {
  const dictionary={
    en:{
      tokenPartial:'Known tokens only (≥): {input} requests lack input usage; {output} lack output usage. Output is counted independently of cache availability.',
      tokenLegacy:'Saved token usage is a lower bound (≥); request-level coverage cannot be verified.',unknownCoverage:'unknown',
      cacheZeroInput:'Reported total input is 0; the cache hit rate has no denominator.',
      savedCache:'Cache ratio uses saved statistics ({time}).',savedSpeed:'Speed uses saved statistics ({time}).',
      panelSpeed:'Speed',panelCache:'Cache',panelContext:'Context',panelDetails:'Metric details',panelUsed:'used',panelSharedQuota:'Shared quota',
      newConversationStats:'New conversation: send a message or open an existing conversation to view its statistics. Account quota is shown separately below.',
      subagentStats:'Current subagent statistics',accountQuota:'Account quota, shared across agents.',
      transcriptTitle:'Recorded text estimate',transcriptUser:'User text',transcriptAssistant:'Replies + thinking',transcriptTool:'Tool output',transcriptSystem:'System text',transcriptMarkers:'Compaction markers',transcriptImages:'Image-generation steps',transcriptPartial:'partial',transcriptLoading:'Loading…',transcriptUnavailable:'Unavailable',transcriptSaved:'saved',transcriptBasis:'Estimated logged text, not active context or billed usage. Hidden prompts, media and tool-call arguments are excluded.',
      contextHostLimit:'Active window (host)',contextProviderCapacity:'Provider capacity reference',contextCompressionLimit:'Compaction threshold',contextLimitUnknown:'Unknown',contextReferenceBasis:'Provider specification; not this session\'s available capacity.',
      context:'Context window',contextShort:'Ctx',contextUsed:'{used}% used ({remaining}% left)',contextTokens:'{used} tokens used / {max} total',contextUnknown:'Context capacity unavailable',contextUnavailable:'Context statistics are unavailable for this request.',contextBasis:'Host estimate at the latest request start; not cumulative tokens or a live streaming counter.',contextModel:'Sampled model',contextLimit:'Window capacity',contextUsage:'Used tokens (estimate)',contextSaved:'Showing saved context statistics ({time}).',contextExceeded:'The host estimate exceeds the reported capacity.',
      savedStats:'Showing saved conversation statistics ({time}).',saveFailed:'Statistics could not be saved locally.',
      strip:'Antigrative Dashboard statistics',session:'Session statistics',cache:'Cache hit',cacheTitle:'Token usage',five:'Five-hour quota',week:'Weekly quota',weekShort:'Wk',
      modelTime:'Model time',toolTime:'Tool time',ttft:'Average TTFT',sessionTps:'Session TPS',latest:'Last request',tokens:'Response / thinking',remaining:'remaining',
      resetIn:'Resets in',resetTime:'Reset time (UTC+8)',group:'Quota group',selectGroup:'Select quota group',refresh:'Refresh quota',refreshStats:'Refresh statistics',refreshing:'Refreshing…',
      waiting:'Waiting for refresh',connecting:'Connecting to Antigravity…',waitingApp:'Waiting for Antigravity',waitingModel:'Waiting for a model request',waitingRequest:'No requests yet',
      hover:'Hover over the strip for details',autoConnect:'Open the app to connect automatically',loadingQuota:'Loading quota…',unavailableQuota:'Quota unavailable',
      live:'Connected to Antigrative Dashboard',stale:'Showing last available quota',offline:'Antigrative Dashboard is offline',
      responseBasis:'Calculation: response tokens ÷ streaming time; session TPS is time-weighted.',allBasis:'Calculation: output tokens ÷ streaming time; response and thinking are not separated.',
      missingTime:'{n} requests lack timing and are excluded from TPS.',shortSample:'Last request is under 1s; its rate may vary substantially.',running:'Generating; showing completed requests.',
      timingUnreliable:'Timing uncertain',ratePending:'Awaiting recalculation',excludedTime:'{n} requests with uncertain timing are excluded from TPS.',rateWarning:'Another {n} short or unusually fast samples remain included in TPS; their rates may fluctuate.',rateWarningOnly:'{n} short or unusually fast samples remain included in TPS; their rates may fluctuate.',rateReasons:'Reason: {reasons}.',rateReasonCount:'{reason}: {n} requests',rateUsageRetained:'Token and cache usage is still retained in full.',legacyRate:'Saved TPS uses the old calculation. Reopen this conversation while connected to recalculate.',
      reasonToken:'Token scope mismatch',reasonDuplicate:'Conflicting request records',reasonRetry:'Retry/token timing scope uncertain',reasonTool:'Short tool-only timing window',reasonOutlier:'Short sample far above same-model baseline',reasonNonfinite:'Invalid calculated rate',
      sample:'{rounds} turns · {steps} steps · {requests} samples',sampleCount:'{n} samples',rounds:'{rounds} turns {steps} steps ·',
      noQuota:'This account did not return this quota window.',disabledQuota:'This quota window is disabled.',noFraction:'The account did not return a remaining fraction.',
      sharedQuota:'Models in this group share quota.',quotaSource:'Balances and reset times come from the account API.',updated:'Updated {time}',health:'Quota updated {time} · actual request metrics',firstUpdate:'Waiting for the first update',
      cacheRate:'Cache hit',cacheRead:'Cache read',cacheInput:'Total input',cacheMiss:'Uncached input',cacheWrite:'Cache write',cacheOutput:'Output',cost:'Cost',totalCost:'Total cost',estimatedCost:'Est. cost',
      cacheBasis:'Cached input ÷ total input, weighted across requests. Cache writes are not hits.',cacheMissing:'{n} requests have unavailable cache statistics.',cacheUnavailable:'Cache statistics are unavailable for this conversation.',
      cacheCoverage:'{measured} of {total} requests',language:'Language',switchLanguage:'Switch to Chinese',languageSaveFailed:'Language preference could not be saved. Please retry.',reconnecting:'Waiting to reconnect',panelUnavailable:'The statistics panel cannot connect right now.',invalidData:'Incompatible statistics data',
      updateAvailable:'New version available: {version}',updateCurrent:'Current version: {version}',updateNow:'Update now',updateLater:'Not now',updating:'Updating…',updateSuccess:'Updated to {version}! Fully active on app restart.',updateFailed:'Update failed. Please retry later.',viewChangelog:'Release notes',newVersionBadge:'New version',
    },
    'zh-CN':{
      tokenPartial:'仅统计已知 Token（≥）：{input} 次请求缺少输入用量，{output} 次缺少输出用量。输出独立于缓存统计。',
      tokenLegacy:'已保存 Token 用量为下界（≥）；无法确认逐请求统计覆盖情况。',unknownCoverage:'未知',
      cacheZeroInput:'报告的总输入为 0，缓存命中率无可计算的分母。',
      savedCache:'缓存率使用已保存统计（{time}）。',savedSpeed:'速度使用已保存统计（{time}）。',
      panelSpeed:'速度',panelCache:'缓存',panelContext:'上下文',panelDetails:'统计详情',panelUsed:'已用',panelSharedQuota:'共享额度',
      newConversationStats:'当前为新对话：发送消息或打开已有对话后显示该会话统计。账号额度在下方单独展示。',
      subagentStats:'当前子代理统计',accountQuota:'账号共享额度，所有代理共用。',
      transcriptTitle:'已记录文本估算',transcriptUser:'用户文本',transcriptAssistant:'回复与思考',transcriptTool:'工具输出',transcriptSystem:'系统文本',transcriptMarkers:'压缩标记记录',transcriptImages:'图像生成步骤',transcriptPartial:'不完整',transcriptLoading:'读取中…',transcriptUnavailable:'不可用',transcriptSaved:'已保存',transcriptBasis:'日志文本估算，非当前上下文或计费用量。不含隐藏提示、媒体和工具调用参数。',
      contextHostLimit:'当前窗口容量（宿主）',contextProviderCapacity:'供应商容量参考',contextCompressionLimit:'压缩触发阈值',contextLimitUnknown:'未知',contextReferenceBasis:'供应商规格参考，不代表当前会话可用容量。',
      context:'上下文窗口',contextShort:'上下文',contextUsed:'{used}% 已用（剩余 {remaining}%）',contextTokens:'已用 {used} 标记，共 {max}',contextUnknown:'上下文容量不可用',contextUnavailable:'此请求暂无可用上下文统计。',contextBasis:'宿主在最近请求开始时的估计值，非累计 Token，也非流式实时计数。',contextModel:'采样模型',contextLimit:'窗口容量',contextUsage:'已用 Token（估计）',contextSaved:'显示已保存的上下文统计（{time}）。',contextExceeded:'宿主估计值超过返回的窗口容量。',
      savedStats:'显示已保存的会话统计（{time}）。',saveFailed:'统计暂时无法保存到本地。',
      strip:'Antigrative Dashboard 会话与额度状态条',session:'会话统计',cache:'缓存命中',cacheTitle:'Token 用量',five:'5h 额度',week:'周额度',weekShort:'周',
      modelTime:'模型调用用时',toolTime:'工具调用用时',ttft:'首 token 平均（TTFT）',sessionTps:'会话输出速率（TPS）',latest:'最近一次请求',tokens:'正文 / 思考输出',remaining:'剩余',
      resetIn:'重置倒计时',resetTime:'重置时间（北京时间）',group:'额度组',selectGroup:'选择额度组',refresh:'刷新额度',refreshStats:'刷新统计',refreshing:'正在刷新…',
      waiting:'等待刷新',connecting:'连接 Antigravity…',waitingApp:'等待 Antigravity',waitingModel:'等待模型生成',waitingRequest:'尚无请求',hover:'悬停状态条，查看详细统计',autoConnect:'打开应用后自动连接',loadingQuota:'读取额度…',unavailableQuota:'额度暂不可用',
      live:'已连接 Antigrative Dashboard',stale:'显示上次成功读取的额度',offline:'Antigrative Dashboard 暂未连接',
      responseBasis:'统计方式：正文 Token ÷ 流式时长；会话 TPS 按总时长加权。',allBasis:'统计方式：输出 Token ÷ 流式时长；此模型未拆分正文与思考。',
      missingTime:'{n} 次请求缺少时长，未计入 TPS。',shortSample:'最近请求不足 1 秒，单次速率波动较大。',running:'生成中，显示已完成请求统计。',
      timingUnreliable:'计时异常',ratePending:'等待重算',excludedTime:'已排除 {n} 次异常计时，不计入 TPS。',rateWarning:'另有 {n} 次短时或高速度采样可能波动，仍计入 TPS。',rateWarningOnly:'{n} 次短时或高速度采样可能波动，仍计入 TPS。',rateReasons:'原因：{reasons}。',rateReasonCount:'{reason}：{n} 次',rateUsageRetained:'Token 和缓存用量仍完整保留。',legacyRate:'已保存的 TPS 使用旧算法；连接后打开此对话即可重新计算。',
      reasonToken:'Token 统计范围不一致',reasonDuplicate:'同一请求的记录冲突',reasonRetry:'重试的 Token 与计时范围不明确',reasonTool:'工具输出的计时窗口过短',reasonOutlier:'短时速率显著高于同模型基线',reasonNonfinite:'计算速率无效',
      sample:'{rounds}轮 {steps}步 · {requests} 次采样',sampleCount:'{n} 次采样',rounds:'{rounds}轮 {steps}步 ·',
      noQuota:'账户未返回此额度窗口。',disabledQuota:'此额度窗口已停用。',noFraction:'账户未返回剩余比例。',sharedQuota:'同组模型共享额度。',quotaSource:'余额与重置时间来自账户接口。',updated:'{time} 更新',health:'额度更新于 {time} · 真实请求统计',firstUpdate:'等待首次更新',
      cacheRate:'缓存命中',cacheRead:'缓存读取',cacheInput:'总输入',cacheMiss:'未缓存输入',cacheWrite:'缓存写入',cacheOutput:'输出',cost:'成本',totalCost:'总成本',estimatedCost:'预估成本',cacheBasis:'缓存读取 token ÷ 总输入 token，按请求 token 总量加权；缓存写入不算命中。',cacheMissing:'{n} 次请求缺少缓存统计。',cacheUnavailable:'此会话暂无可用缓存统计。',cacheCoverage:'{measured} / {total} 次请求',
      language:'语言',switchLanguage:'Switch to English',languageSaveFailed:'语言设置暂时无法保存，请重试。',reconnecting:'等待控件重新连接',panelUnavailable:'统计面板暂时无法连接',invalidData:'统计数据格式不兼容',
      updateAvailable:'发现新版本 {version}',updateCurrent:'当前版本：{version}',updateNow:'立即更新',updateLater:'暂不更新',updating:'正在更新…',updateSuccess:'已成功更新至 {version}！重启应用后完全生效。',updateFailed:'更新失败，请稍后重试。',viewChangelog:'更新日志',newVersionBadge:'新版本',
    },
  };
  let language=initialLanguage==='zh-CN'?'zh-CN':'en';
  const t=(key,args={})=>(dictionary[language][key]||dictionary.en[key]||key).replace(/\{(\w+)\}/g,(_,name)=>String(args[name]??''));
  function countdown(at,now=Date.now(),compact=false){
    const end=Date.parse(at);if(!Number.isFinite(end))return '—';if(end<=now)return t('waiting');
    const left=Math.ceil((end-now)/1000),days=Math.floor(left/86400),hours=Math.floor(left%86400/3600),mins=Math.floor(left%3600/60),secs=left%60,pad=n=>String(n).padStart(2,'0');
    return `${days?`${days}${language==='en'?'d':'天'} `:''}${pad(hours)}:${pad(mins)}${compact&&days?'':`:${pad(secs)}`}`;
  }
  function elapsed(value){
    if(typeof value!=='number'||!Number.isFinite(value))return '—';if(value<60)return `${value.toFixed(2)}${language==='en'?'s':' 秒'}`;
    const whole=Math.round(value),h=Math.floor(whole/3600),m=Math.floor(whole%3600/60),s=whole%60;
    return language==='en'?`${h?`${h}h `:''}${m}m ${s}s`:`${h?`${h}小时`:''}${m}分${s}秒`;
  }
  function resetDate(value){
    const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat(language==='en'?'en-GB':'zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Shanghai'}).format(date):'—';
  }
  function errorMessage(value){
    if(!value)return '';
    const key=Object.keys(dictionary.en).find(key=>dictionary.en[key]===value);
    if(key)return t(key);
    if(language==='zh-CN')return value;
    const errors={
      '请先打开 Antigravity':'Open Antigravity to connect.', '当前采集适配器支持 Windows':'This collector requires Windows.',
      '检测到多个 Antigravity 实例，请保留一个':'Multiple Antigravity instances detected. Keep one open.',
      '未找到 Antigravity 桌面后台':'Antigravity desktop backend was not found.',
      '当前版本未提供可用的本地检测凭据':'Local metrics credentials are unavailable in this version.',
      '等待 Antigravity 本地接口启动':'Waiting for the local Antigravity API.',
      '未找到 Antigravity 语言服务日志，请检查日志路径':'Antigravity language-server log was not found. Check the log path.',
      '会话暂时没有可用统计':'No statistics are available for this conversation yet.',
      '完整会话统计分页暂不可用':'Complete conversation statistics are temporarily unavailable.',
      '会话统计数据超过内存预算':'Conversation statistics exceed the memory budget.',
      '会话统计数据超过采集上限':'Retained conversation statistics exceed the collection budget.',
      '会话统计字段超过采集上限':'A statistics field exceeds the collection budget.',
      '会话统计分页读取超时':'Conversation statistics pagination timed out.',
      '会话统计分页数量无效':'Invalid conversation statistics page count.',
      '会话统计分页格式无效':'Invalid conversation statistics page format.',
      '会话仍在更新，请等待下一次刷新':'The conversation is updating; waiting for the next refresh.',
      '接口响应超过采集上限':'The API response exceeds the collection budget.',
      'Antigravity 接口返回了无法解析的数据':'Antigravity returned an invalid response.',
      'Antigravity 本地接口超时':'The local Antigravity API timed out.',
      '会话标识无效':'Invalid conversation identifier.',
      '等待 Antigrative Dashboard 后台启动':'Waiting for the dashboard background process.',
      '等待 Antigrative Dashboard 重新连接':'Waiting for the dashboard to reconnect.',
      '等待 AG Pulse 后台启动':'Waiting for the dashboard background process.',
      '等待 AG Pulse 重新连接':'Waiting for the dashboard to reconnect.',
    };
    if(errors[value])return errors[value];
    const match=String(value).match(/^Antigravity 接口 (\w+) 返回 (\d+)$/);
    return match?`Antigravity ${match[1]} returned HTTP ${match[2]}.`:'Statistics are temporarily unavailable.';
  }
  function connectPreferences({read,write,cache=()=>{},changed=()=>{}}) {
    let epoch=0,writes=0,revision=-1,disposed=false,error=false,queue=Promise.resolve();
    const valid=value=>value==='en'||value==='zh-CN';
    const notify=()=>{if(!disposed)changed();};
    const remember=()=>{try{cache(language);}catch{}};
    const check=value=>{if(!value||value.error||!Object.hasOwn(value,'language')||value.language!==null&&!valid(value.language))throw new Error('Invalid preference response');return value;};
    function sync(value) {
      if(disposed||writes)return;
      try {
        check(value);const next=Number.isSafeInteger(value.revision)?value.revision:0;
        if(next<revision)return;
        if(error&&epoch>0&&value.language!==language)return; // retain an unsaved choice and its warning
        if(value.language===null&&epoch===0&&valid(initialLanguage)){void choose(initialLanguage);return;}
        revision=next;error=false;
        if(valid(value.language)&&language!==value.language){language=value.language;remember();}
        notify();
      } catch {error=true;notify();}
    }
    function choose(value) {
      if(disposed||!valid(value))return Promise.resolve();
      const choice=++epoch;language=value;writes++;error=false;remember();notify();
      const pending=queue.then(async()=>{
        try {
          const saved=check(await write({language:value}));
          if(saved.language!==value)throw new Error('Preference acknowledgement differs');
          revision=Math.max(revision,Number.isSafeInteger(saved.revision)?saved.revision:0);
          if(choice===epoch)error=false;
        } catch {if(choice===epoch)error=true;}
        finally {writes--;notify();}
      });
      queue=pending;return pending;
    }
    const ready=(async()=>{
      const started=epoch;
      try {
        const saved=check(await read());
        if(disposed||epoch!==started)return;
        if(saved.language===null&&valid(initialLanguage))await choose(initialLanguage); // migrate an existing browser choice once
        else sync(saved);
      }catch{if(!disposed&&epoch===started){error=true;notify();}}
    })();
    return {ready,sync,choose,toggle:()=>choose(language==='en'?'zh-CN':'en'),get error(){return error;},get pending(){return writes>0;},dispose(){disposed=true;}};
  }
  function rateNote(speed) {
    if (!speed) return t('waitingRequest');
    if (speed.latestRateStatus === 'legacy') return t('ratePending');
    return t(speed.rateBasis==='all-output'?'allBasis':'responseBasis');
  }
  return {t,rateNote,countdown,elapsed,resetDate,errorMessage,connectPreferences,get language(){return language;},setLanguage(value){language=value==='zh-CN'?'zh-CN':'en';},toggle(){language=language==='en'?'zh-CN':'en';return language;}};
};
