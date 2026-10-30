// Pure transforms. No credentials, prompts, or message text enter the public result.
import { contextMetrics } from './context.mjs';
import { classifyRates, RATE_VERSION, RATE_REASONS } from './rate-quality.mjs';
export function seconds(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value === 'string' && /^\d+(?:\.\d+)?s$/.test(value)) {
    const n = Number(value.slice(0, -1));
    return Number.isFinite(n) ? n : null;
  }
  if (value && typeof value === 'object') {
    if (value.seconds === undefined && value.nanos === undefined) return null;
    const whole = Number(value.seconds ?? 0), nanos = Number(value.nanos ?? 0);
    if (!Number.isSafeInteger(whole) || whole < 0 || !Number.isInteger(nanos) || nanos < 0 || nanos >= 1e9) return null;
    const n = whole + nanos / 1e9;
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  return null;
}

export function tokenCount(value) {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/.test(value))) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

export function requestCacheMetrics(usage) {
  const input = tokenCount(usage.inputTokens);
  if ((usage.cacheReadTokens !== undefined && tokenCount(usage.cacheReadTokens) === null) ||
      (usage.cacheWriteTokens !== undefined && tokenCount(usage.cacheWriteTokens) === null)) return null;
  const read = tokenCount(usage.cacheReadTokens) ?? 0;
  const write = tokenCount(usage.cacheWriteTokens) ?? 0;
  const provider = String(usage.apiProvider || '');
  if (input === null) return null;
  // Antigravity ModelUsageStats normalizes inputTokens to uncached input,
  // including Gemini (verified against live records with cacheRead > input).
  // These are NOT upstream Gemini/OpenAI prompt_tokens. Add the separate
  // cache read/write counts exactly once for this local interface.
  const total = input + read + write;
  // A tool follow-up can explicitly report zero input. It is a valid neutral
  // sample, even though an all-zero denominator cannot produce a hit ratio.
  if (!Number.isSafeInteger(total) || total < 0 || read + write > total) return null;
  // A provider label is unnecessary for a validated zero denominator: it
  // contributes neither numerator nor denominator and never invents a ratio.
  if (total > 0 && !/GOOGLE_GEMINI|OPENAI|ANTHROPIC/.test(provider)) return null;
  return { inputTokens:total, cachedTokens:read, cacheWriteTokens:write, uncachedTokens:total-read-write };
}

function unionSeconds(intervals) {
  const sorted = intervals.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b >= a).sort((a, b) => a[0] - b[0]);
  let total = 0, start = null, end = null;
  for (const [a, b] of sorted) {
    if (start === null) { start = a; end = b; }
    else if (a <= end) end = Math.max(end, b);
    else { total += end - start; start = a; end = b; }
  }
  if (start !== null) total += end - start;
  return total / 1000;
}

export function trajectoryMetrics(response, storage = null) {
  const trajectory = response.trajectory || {};
  const generators = trajectory.generatorMetadata || [];
  const samples = storage?.samples || [], ids = storage?.ids || new Map();
  const steps = trajectory.steps || [];
  const counts = { input: 0, output: 0, responseOutput: 0, thinkingOutput: 0, cacheRead: 0, cacheWrite: 0 };
  let modelSeconds = 0, ttftSeconds = 0, ttftSamples = 0, missingTiming = 0;
  const cache = { inputTokens:0, cachedTokens:0, cacheWriteTokens:0, uncachedTokens:0, outputTokens:0, measuredRequests:0, missingRequests:0 };
  // Token availability is independent of cache-ratio availability. In particular,
  // a historical request may retain output usage but lack normalized input data.
  const tokens = { inputTokens:0, cachedTokens:0, cacheWriteTokens:0, uncachedTokens:0, outputTokens:0,
    measuredRequests:0, inputRequests:0, outputRequests:0, missingInputRequests:0, missingOutputRequests:0,
    uncachedRequests:0, cachedRequests:0, cacheWriteRequests:0 };
  for (const [index, generator] of generators.entries()) {
    const chat = generator.chatModel;
    if (!chat?.usage) continue;
    const usage = chat.usage;
    // IDE executionId identifies a planner run/turn, not an individual model
    // request: tool follow-ups share it while having distinct responseIds.
    // Never collapse those follow-ups, even when no request ID was returned.
    const id = usage.responseId ? `response:${usage.apiProvider||''}:${usage.responseId}`
      : usage.messageId ? `message:${usage.messageId}` : `index:${index}`;
    const signature = JSON.stringify([usage.outputTokens,usage.responseOutputTokens,usage.thinkingOutputTokens,
      seconds(chat.streamingDuration),seconds(chat.timeToFirstToken),chat.responseModel,chat.model,usage.model]);
    if (ids.has(id)) {
      const previous = ids.get(id);
      if (previous.signature !== signature && !previous.sample.reasons.includes('duplicate-scope')) previous.sample.reasons.push('duplicate-scope');
      if(storage)ids.set(id,previous);
      continue;
    }
    const cached = requestCacheMetrics(usage);
    if(cached) {
      for(const key of ['inputTokens','cachedTokens','cacheWriteTokens','uncachedTokens'])cache[key]+=cached[key];
      cache.outputTokens+=tokenCount(usage.outputTokens)??0;
      cache.measuredRequests++;
    } else cache.missingRequests++;
    const output = tokenCount(usage.outputTokens);
    // These fields come from the local normalized ModelUsageStats contract,
    // not upstream prompt_tokens. Account for each readable component even
    // when another component (or the cache-ratio provider) is unavailable.
    const input = tokenCount(usage.inputTokens);
    const read = usage.cacheReadTokens === undefined && input !== null ? 0 : tokenCount(usage.cacheReadTokens);
    const write = usage.cacheWriteTokens === undefined && input !== null ? 0 : tokenCount(usage.cacheWriteTokens);
    const parts = [['uncachedTokens','uncachedRequests',input],['cachedTokens','cachedRequests',read],['cacheWriteTokens','cacheWriteRequests',write]];
    for (const [field,coverage,value] of parts) if (value !== null) {
      tokens[field] = tokens[field] === null ? null : tokenCount(tokens[field]+value);
      tokens[coverage]++;
    }
    if (input !== null && read !== null && write !== null && tokenCount(input+read+write) !== null) tokens.inputRequests++;
    else tokens.missingInputRequests++;
    if (output !== null) { tokens.outputTokens = tokens.outputTokens === null ? null : tokenCount(tokens.outputTokens+output); tokens.outputRequests++; }
    else tokens.missingOutputRequests++;
    if (parts.some(([, ,value])=>value!==null) || output !== null) tokens.measuredRequests++;
    const visible = tokenCount(usage.responseOutputTokens);
    const thinking = tokenCount(usage.thinkingOutputTokens);
    // Gemini may finish thinking before the first visible streaming token. Pair the
    // response token count with streamingDuration; do not charge thinking to that span.
    const responseTokens = visible ?? (output !== null && thinking !== null ? Math.max(0, output - thinking) : output);
    const duration = seconds(chat.streamingDuration);
    const ttft = seconds(chat.timeToFirstToken);
    counts.input += tokenCount(usage.inputTokens) ?? 0;
    counts.output += output ?? 0;
    counts.responseOutput += responseTokens ?? 0;
    counts.thinkingOutput += thinking ?? 0;
    counts.cacheRead += tokenCount(usage.cacheReadTokens) ?? 0;
    counts.cacheWrite += tokenCount(usage.cacheWriteTokens) ?? 0;
    if (ttft !== null) { ttftSeconds += ttft; ttftSamples++; }
    modelSeconds += (ttft ?? 0) + (duration ?? 0);
    const reasons = [];
    if (['outputTokens','responseOutputTokens','thinkingOutputTokens'].some(key=>usage[key] !== undefined && tokenCount(usage[key]) === null) ||
        output !== null && (visible !== null && visible > output || thinking !== null && thinking > output ||
          visible !== null && thinking !== null && visible + thinking > output)) reasons.push('token-scope');
    // One retryInfos entry is the ordinary attempt record, not evidence of a retry.
    // Multiple differing usage records lack attempt-specific timing in this API.
    const attempts = (Array.isArray(chat.retryInfos) ? chat.retryInfos : []).filter(info=>info?.usage);
    if (attempts.length > 1 && attempts.some(info=>['outputTokens','responseOutputTokens','thinkingOutputTokens'].some(key=>
        tokenCount(info.usage[key]) !== tokenCount(usage[key])))) reasons.push('retry-scope');
    const planners = (generator.stepIndices || []).map(i=>Number.isInteger(i) && i >= 0 ? steps[i] : null)
      .filter(step=>/PLANNER_RESPONSE/.test(String(step?.type || '')));
    const toolOnly = planners.length > 0 && planners.every(step=>step.plannerResponse?.toolCalls?.length > 0 &&
      !String(step.plannerResponse?.response || '').trim());
    const basis = visible !== null || thinking !== null ? 'response' : 'all-output';
    const sample = { responseTokens, duration, ttft, reasons, toolOnly,
      tps: responseTokens !== null && duration > 0 ? responseTokens / duration : null,
      model: chat.modelDisplayName || chat.responseModel || String(chat.model || usage.model || ''), basis,
      profile: JSON.stringify([usage.apiProvider || '',chat.responseModel || usage.model || chat.model || chat.modelDisplayName || '',basis]) };
    samples.push(sample);
    ids.set(id,{signature,sample});
  }
  (storage?.classify || classifyRates)(samples);
  const accepted = samples.filter(sample=>sample.status === 'ok');
  missingTiming = samples.filter(sample=>sample.status === 'missing' && sample.responseTokens > 0).length;
  const excludedTiming = samples.filter(sample=>sample.status === 'unreliable').length;
  const rateWarnings = samples.filter(sample=>sample.status === 'ok' && (sample.duration < 1 || sample.outlier)).length;
  const timingReasons = Object.fromEntries(RATE_REASONS.map(reason=>[reason,samples.filter(sample=>sample.reasons.includes(reason)).length]));
  const streamingSeconds = accepted.reduce((sum, s) => sum + s.duration, 0);
  const sampledTokens = accepted.reduce((sum, s) => sum + s.responseTokens, 0);
  const basisSamples = accepted.length ? accepted : samples;
  const tools = steps.filter(s => /SEARCH_WEB|BROWSE|RUN_COMMAND|COMMAND|READ|WRITE|EDIT|CODE_ACTION|TOOL|MCP|LIST|GREP|VIEW|FIND|TERMINAL/i.test(String(s.type || '')) || s.metadata?.toolCall);
  const toolSeconds = storage ? storage.toolSeconds() : unionSeconds(tools.map(s => [Date.parse(s.metadata.startedAt || s.metadata.createdAt), Date.parse(s.metadata.completedAt)]));
  const latest = samples.at(-1) || null;
  const lastChat = storage ? storage.lastChat() : [...generators].reverse().find(g => g.chatModel)?.chatModel;
  const inputParts=[tokens.uncachedTokens,tokens.cachedTokens,tokens.cacheWriteTokens];
  tokens.inputTokens = tokenCount(inputParts.reduce((sum,value)=>sum+(value??0),0));
  const totalTokens=tokenCount((tokens.inputTokens??0)+(tokens.outputTokens??0));
  return {
    source: 'Antigravity request metadata', status: response.status || null,
    conversationId: trajectory.cascadeId || null,
    steps: Number(response.numTotalSteps ?? steps.length), rounds: steps.filter(s => /USER_INPUT/.test(String(s.type))).length,
    requests: ids.size, measuredRequests: accepted.length, missingTiming, excludedTiming, rateWarnings, timingReasons, rateVersion: RATE_VERSION, counts,
    tokens:{...tokens,totalTokens,
      complete:tokens.missingInputRequests===0&&tokens.missingOutputRequests===0&&inputParts.every(value=>value!==null)&&tokens.outputTokens!==null&&totalTokens!==null},
    cache:{...cache,totalTokens:cache.inputTokens+cache.outputTokens,hitRate:cache.inputTokens>0?cache.cachedTokens/cache.inputTokens:null,complete:cache.missingRequests===0},
    tps: streamingSeconds > 0 ? sampledTokens / streamingSeconds : null, latestTps: latest?.status === 'ok' ? latest.tps : null,
    latestRateStatus: latest?.status ?? 'missing',
    rateBasis: basisSamples.length && basisSamples.every(s => s.basis === 'response') ? 'response' : 'all-output',
    streamingSeconds, modelSeconds, toolSeconds, ttftSeconds: ttftSamples ? ttftSeconds / ttftSamples : null,
    latestShortSample: latest?.status === 'ok' && latest.duration < 1, model: latest?.model || null,
    context: contextMetrics(lastChat?.chatStartMetadata?.contextWindowMetadata, {
      model:lastChat?.modelDisplayName || lastChat?.responseModel || String(lastChat?.model || ''),
      sampledAt:lastChat?.chatStartMetadata?.createdAt,
    }),
    complete: Number(response.numTotalGeneratorMetadata ?? generators.length) === generators.length,
  };
}

export function quotaMetrics(response, now = Date.now()) {
  const root = response.response || response;
  const groups = root.groups?.length ? root.groups : root.buckets?.length ? [{ displayName: '账户额度', buckets: root.buckets }] : [];
  return groups.map((group, index) => ({
    id: group.buckets?.[0]?.bucketId?.replace(/-(5h|weekly)$/, '') || `group-${index}`,
    name: group.displayName || `额度组 ${index + 1}`, description: group.description || '',
    windows: Object.fromEntries(['5h', 'weekly'].map(window => {
      const bucket = (group.buckets || []).find(b => b.window === window || b.bucketId?.endsWith(`-${window}`));
      if (!bucket) return [window, { available: false, reason: '账户未返回此额度窗口' }];
      const fraction = Number(bucket.remainingFraction);
      const remaining = bucket.remainingFraction !== undefined && Number.isFinite(fraction) && fraction >= 0 && fraction <= 1 ? fraction : null;
      const date = Date.parse(bucket.resetTime);
      return [window, { available: true, id: bucket.bucketId, remaining, amount: tokenCount(bucket.remainingAmount),
        resetAt: Number.isFinite(date) ? new Date(date).toISOString() : null,
        expired: Number.isFinite(date) && date <= now, disabled: bucket.disabled === true, description: bucket.description || '' }];
    })),
  }));
}
