// Pure transforms. No credentials, prompts, or message text enter the public result.
export function seconds(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value === 'string' && /^\d+(?:\.\d+)?s$/.test(value)) return Number(value.slice(0, -1));
  if (value && typeof value === 'object') {
    const n = Number(value.seconds || 0) + Number(value.nanos || 0) / 1e9;
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  return null;
}

export function tokenCount(value) {
  if (value === undefined || value === null || value === '') return null;
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
  if (input === null || !/GOOGLE_GEMINI|OPENAI|ANTHROPIC/.test(provider)) return null;
  // Antigravity ModelUsageStats normalizes inputTokens to uncached input,
  // including Gemini (verified against live records with cacheRead > input).
  // These are NOT upstream Gemini/OpenAI prompt_tokens. Add the separate
  // cache read/write counts exactly once for this local interface.
  const total = input + read + write;
  if (!Number.isSafeInteger(total) || total <= 0 || read + write > total) return null;
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

export function trajectoryMetrics(response) {
  const trajectory = response.trajectory || {};
  const generators = trajectory.generatorMetadata || [];
  const samples = [], ids = new Set();
  const counts = { input: 0, output: 0, responseOutput: 0, thinkingOutput: 0, cacheRead: 0, cacheWrite: 0 };
  let modelSeconds = 0, ttftSeconds = 0, ttftSamples = 0, missingTiming = 0;
  const cache = { inputTokens:0, cachedTokens:0, cacheWriteTokens:0, uncachedTokens:0, outputTokens:0, measuredRequests:0, missingRequests:0 };
  for (const [index, generator] of generators.entries()) {
    const chat = generator.chatModel;
    if (!chat?.usage) continue;
    const usage = chat.usage;
    const id = usage.messageId || generator.executionId || `index:${index}`;
    if (ids.has(id)) continue;
    ids.add(id);
    const cached = requestCacheMetrics(usage);
    if(cached) {
      for(const key of ['inputTokens','cachedTokens','cacheWriteTokens','uncachedTokens'])cache[key]+=cached[key];
      cache.outputTokens+=tokenCount(usage.outputTokens)??0;
      cache.measuredRequests++;
    } else cache.missingRequests++;
    const output = tokenCount(usage.outputTokens);
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
    if (responseTokens !== null && duration > 0) {
      samples.push({ id, responseTokens, duration, tps: responseTokens / duration,
        model: chat.modelDisplayName || chat.responseModel || String(chat.model || usage.model || ''),
        basis: visible !== null || thinking !== null ? 'response' : 'all-output', shortSample: duration < 1 });
    } else if (responseTokens > 0) missingTiming++;
  }
  const streamingSeconds = samples.reduce((sum, s) => sum + s.duration, 0);
  const sampledTokens = samples.reduce((sum, s) => sum + s.responseTokens, 0);
  const steps = trajectory.steps || [];
  const tools = steps.filter(s => /SEARCH_WEB|BROWSE|RUN_COMMAND|COMMAND|READ|WRITE|EDIT|CODE_ACTION|TOOL|MCP|LIST|GREP|VIEW|FIND|TERMINAL/i.test(String(s.type || '')) || s.metadata?.toolCall);
  const toolSeconds = unionSeconds(tools.map(s => [Date.parse(s.metadata.startedAt || s.metadata.createdAt), Date.parse(s.metadata.completedAt)]));
  const latest = samples.at(-1) || null;
  const lastChat = [...generators].reverse().find(g => g.chatModel)?.chatModel;
  return {
    source: 'Antigravity request metadata', status: response.status || null,
    conversationId: trajectory.cascadeId || null,
    steps: Number(response.numTotalSteps ?? steps.length), rounds: steps.filter(s => /USER_INPUT/.test(String(s.type))).length,
    requests: ids.size, measuredRequests: samples.length, missingTiming, counts,
    cache:{...cache,totalTokens:cache.inputTokens+cache.outputTokens,hitRate:cache.inputTokens>0?cache.cachedTokens/cache.inputTokens:null,complete:cache.missingRequests===0},
    tps: streamingSeconds > 0 ? sampledTokens / streamingSeconds : null, latestTps: latest?.tps ?? null,
    rateBasis: samples.length && samples.every(s => s.basis === 'response') ? 'response' : 'all-output',
    streamingSeconds, modelSeconds, toolSeconds, ttftSeconds: ttftSamples ? ttftSeconds / ttftSamples : null,
    latestShortSample: latest?.shortSample ?? false, model: latest?.model || null,
    context: lastChat?.chatStartMetadata?.contextWindowMetadata || null,
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
