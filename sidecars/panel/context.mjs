// The host estimates the prompt at request start. This is not cumulative usage
// and not a per-token live meter. Unknown capacities are never guessed by model.
const count = value => (typeof value === 'number' || typeof value === 'string' && /^\d+$/.test(value)) && Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
export function contextMetrics(metadata, { model = null, sampledAt = null } = {}) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const usedTokens=count(metadata.estimatedTokensUsed), rawMax=count(metadata.maxContextTokens);
  const maxTokens=rawMax > 0 ? rawMax : null;
  if (usedTokens === null) return null;
  return {
    usedTokens, maxTokens, remainingTokens:maxTokens === null ? null : Math.max(0,maxTokens-usedTokens),
    usedFraction:maxTokens === null ? null : usedTokens/maxTokens,
    remainingFraction:maxTokens === null ? null : Math.max(0,1-usedTokens/maxTokens),
    model:typeof model === 'string' ? model.slice(0,256) : null,
    sampledAt:typeof sampledAt === 'string' && Number.isFinite(Date.parse(sampledAt)) ? new Date(sampledAt).toISOString() : null,
    source:'Antigravity context window metadata', estimated:true,
  };
}

export function safeContext(value) {
  return value && contextMetrics({estimatedTokensUsed:value.usedTokens,maxContextTokens:value.maxTokens},value);
}
