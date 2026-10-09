// Shared, serializable translations for the inline widget and native panel.
module.exports = function createDashboardI18n(initialLanguage) {
  const dictionary={
    en:{
      context:'Context window',contextShort:'Ctx',contextUsed:'{used}% used ({remaining}% left)',contextTokens:'{used} tokens used / {max} total',contextUnknown:'Context capacity unavailable',contextUnavailable:'Context statistics are unavailable for this request.',contextBasis:'Host estimate at the latest request start; not cumulative tokens or a live streaming counter.',contextModel:'Sampled model',contextLimit:'Window capacity',contextUsage:'Used tokens (estimate)',contextSaved:'Showing saved context statistics ({time}).',contextExceeded:'The host estimate exceeds the reported capacity.',
      savedStats:'Showing saved conversation statistics ({time}).',saveFailed:'Statistics could not be saved locally.',
      strip:'Antigrative Dashboard statistics',session:'Session statistics',cache:'Cache hit',cacheTitle:'Token usage',five:'Five-hour quota',week:'Weekly quota',weekShort:'Wk',
      modelTime:'Model time',toolTime:'Tool time',ttft:'Average TTFT',sessionTps:'Session TPS',latest:'Last request',tokens:'Response / thinking',remaining:'remaining',
      resetIn:'Resets in',resetTime:'Reset time (UTC+8)',group:'Quota group',selectGroup:'Select quota group',refresh:'Refresh quota',refreshStats:'Refresh statistics',
      waiting:'Waiting for refresh',connecting:'Connecting to Antigravity…',waitingApp:'Waiting for Antigravity',waitingModel:'Waiting for a model request',waitingRequest:'No requests yet',
      hover:'Hover over the strip for details',autoConnect:'Open the app to connect automatically',loadingQuota:'Loading quota…',unavailableQuota:'Quota unavailable',
      live:'Connected to Antigrative Dashboard',stale:'Showing last available quota',offline:'Antigrative Dashboard is offline',
      responseBasis:'Response tokens ÷ streaming duration; session rate is time-weighted.',allBasis:'Output tokens ÷ streaming duration; this model does not separate response and thinking.',
      missingTime:'{n} requests lack timing and are excluded from TPS.',shortSample:'Last request is under 1s; its rate may vary substantially.',running:'Generating; showing completed requests.',
      sample:'{rounds} turns · {steps} steps · {requests} samples',sampleCount:'{n} samples',rounds:'{rounds} turns {steps} steps ·',
      noQuota:'This account did not return this quota window.',disabledQuota:'This quota window is disabled.',noFraction:'The account did not return a remaining fraction.',
      sharedQuota:'Models in this group share quota.',quotaSource:'Balances and reset times come from the account API.',updated:'Updated {time}',health:'Quota updated {time} · actual request metrics',firstUpdate:'Waiting for the first update',
      cacheRate:'Cache hit',cacheRead:'Cache read',cacheInput:'Total input',cacheMiss:'Uncached input',cacheWrite:'Cache write',cacheOutput:'Output',
      cacheBasis:'Cached input ÷ total input, weighted across requests. Cache writes are not hits.',cacheMissing:'{n} requests have unavailable cache statistics.',cacheUnavailable:'Cache statistics are unavailable for this conversation.',
      cacheCoverage:'{measured} of {total} requests',language:'Language',switchLanguage:'Switch to Chinese',reconnecting:'Waiting to reconnect',panelUnavailable:'The statistics panel cannot connect right now.',invalidData:'Incompatible statistics data',
    },
    'zh-CN':{
      context:'上下文窗口',contextShort:'上下文',contextUsed:'{used}% 已用（剩余 {remaining}%）',contextTokens:'已用 {used} 标记，共 {max}',contextUnknown:'上下文容量不可用',contextUnavailable:'此请求暂无可用上下文统计。',contextBasis:'宿主在最近请求开始时的估计值，非累计 Token，也非流式实时计数。',contextModel:'采样模型',contextLimit:'窗口容量',contextUsage:'已用 Token（估计）',contextSaved:'显示已保存的上下文统计（{time}）。',contextExceeded:'宿主估计值超过返回的窗口容量。',
      savedStats:'显示已保存的会话统计（{time}）。',saveFailed:'统计暂时无法保存到本地。',
      strip:'Antigrative Dashboard 会话与额度状态条',session:'会话统计',cache:'缓存命中',cacheTitle:'Token 用量',five:'5h 额度',week:'周额度',weekShort:'周',
      modelTime:'模型调用用时',toolTime:'工具调用用时',ttft:'首 token 平均（TTFT）',sessionTps:'会话输出速率（TPS）',latest:'最近一次请求',tokens:'正文 / 思考输出',remaining:'剩余',
      resetIn:'重置倒计时',resetTime:'重置时间（北京时间）',group:'额度组',selectGroup:'选择额度组',refresh:'刷新额度',refreshStats:'刷新统计',
      waiting:'等待刷新',connecting:'连接 Antigravity…',waitingApp:'等待 Antigravity',waitingModel:'等待模型生成',waitingRequest:'尚无请求',hover:'悬停状态条，查看详细统计',autoConnect:'打开应用后自动连接',loadingQuota:'读取额度…',unavailableQuota:'额度暂不可用',
      live:'已连接 Antigrative Dashboard',stale:'显示上次成功读取的额度',offline:'Antigrative Dashboard 暂未连接',
      responseBasis:'正文输出 token ÷ 流式生成时长；会话值按总时长加权。',allBasis:'输出 token ÷ 流式生成时长；此模型未拆分正文与思考。',
      missingTime:'{n} 次请求缺少时长，未计入 TPS。',shortSample:'最近请求不足 1 秒，单次速率波动较大。',running:'生成中，显示已完成请求统计。',
      sample:'{rounds}轮 {steps}步 · {requests} 次采样',sampleCount:'{n} 次采样',rounds:'{rounds}轮 {steps}步 ·',
      noQuota:'账户未返回此额度窗口。',disabledQuota:'此额度窗口已停用。',noFraction:'账户未返回剩余比例。',sharedQuota:'同组模型共享额度。',quotaSource:'余额与重置时间来自账户接口。',updated:'{time} 更新',health:'额度更新于 {time} · 真实请求统计',firstUpdate:'等待首次更新',
      cacheRate:'缓存命中',cacheRead:'缓存读取',cacheInput:'总输入',cacheMiss:'未缓存输入',cacheWrite:'缓存写入',cacheOutput:'输出',cacheBasis:'缓存读取 token ÷ 总输入 token，按请求 token 总量加权；缓存写入不算命中。',cacheMissing:'{n} 次请求缺少缓存统计。',cacheUnavailable:'此会话暂无可用缓存统计。',cacheCoverage:'{measured} / {total} 次请求',
      language:'语言',switchLanguage:'Switch to English',reconnecting:'等待控件重新连接',panelUnavailable:'统计面板暂时无法连接',invalidData:'统计数据格式不兼容',
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
      '会话暂时没有可用统计':'No statistics are available for this conversation yet.',
      '完整会话统计分页暂不可用':'Complete conversation statistics are temporarily unavailable.',
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
  return {t,countdown,elapsed,resetDate,errorMessage,get language(){return language;},setLanguage(value){language=value==='zh-CN'?'zh-CN':'en';},toggle(){language=language==='en'?'zh-CN':'en';return language;}};
};
