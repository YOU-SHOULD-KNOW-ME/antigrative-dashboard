import { readFile, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCOPE = /^[0-9a-f]{64}$/;
const numeric = ['steps','rounds','requests','measuredRequests','missingTiming','tps','latestTps','streamingSeconds','modelSeconds','toolSeconds','ttftSeconds'];
const counts = ['input','output','responseOutput','thinkingOutput','cacheRead','cacheWrite'];
const cache = ['inputTokens','cachedTokens','cacheWriteTokens','uncachedTokens','outputTokens','measuredRequests','missingRequests','totalTokens','hitRate'];
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function safeMetrics(value, conversationId) {
  if (!GUID.test(conversationId) || !value || typeof value !== 'object') throw new Error('Invalid conversation statistics');
  const result = { conversationId, counts: {}, cache: {}, source: 'Antigravity request metadata' };
  for (const key of numeric) result[key] = number(value[key]) ? value[key] : null;
  for (const key of counts) result.counts[key] = number(value.counts?.[key]) ? value.counts[key] : 0;
  for (const key of cache) result.cache[key] = number(value.cache?.[key]) ? value.cache[key] : null;
  if (result.cache.hitRate > 1) result.cache.hitRate = null;
  for (const key of ['complete','latestShortSample']) result[key] = value[key] === true;
  result.cache.complete = value.cache?.complete === true;
  result.rateBasis = value.rateBasis === 'response' ? 'response' : 'all-output';
  result.model = typeof value.model === 'string' ? value.model.slice(0,256) : null;
  result.status = typeof value.status === 'string' && /^[A-Z0-9_]+$/.test(value.status) ? value.status : null;
  return result;
}

export function usableMetrics(metrics) {
  return number(metrics?.tps) && metrics.measuredRequests > 0 || metrics?.cache?.measuredRequests > 0;
}

export function shouldKeepSaved(saved, fresh) {
  return usableMetrics(saved) && (!usableMetrics(fresh) || fresh.complete === false ||
    fresh.requests < saved.requests || fresh.measuredRequests < saved.measuredRequests ||
    (fresh.cache?.measuredRequests || 0) < (saved.cache?.measuredRequests || 0));
}

export class SessionHistory {
  pending = new Map();
  constructor(directory = join(process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR || join(homedir(),'.gemini','antigravity','sidecar_data','antigravity-pulse','panel','data'),'history-v1')) {
    this.directory = directory;
  }
  file(scope, id) {
    if (!SCOPE.test(scope) || !GUID.test(id)) throw new Error('Invalid history scope');
    return join(this.directory, scope, id.toLowerCase() + '.json');
  }
  async load(scope, id) {
    if (!scope) return null;
    try {
      const text = await readFile(this.file(scope,id),'utf8');
      if (text.length > 65536) return null;
      const record = JSON.parse(text);
      if (record.schema !== 1 || record.account !== scope || record.conversationId !== id.toLowerCase() || !Number.isFinite(Date.parse(record.savedAt))) return null;
      const metrics = safeMetrics(record.metrics,id);
      return usableMetrics(metrics) ? { metrics, savedAt: record.savedAt } : null;
    } catch { return null; }
  }
  async save(scope, id, value) {
    if (!scope) return null;
    const key = this.file(scope,id);
    const previous = this.pending.get(key) || Promise.resolve();
    const pending = previous.catch(()=>{}).then(()=>this.write(scope,id,value));
    this.pending.set(key,pending);
    try { return await pending; }
    finally { if (this.pending.get(key) === pending) this.pending.delete(key); }
  }
  async write(scope, id, value) {
    const metrics = safeMetrics(value,id), file = this.file(scope,id);
    if (!usableMetrics(metrics)) return null;
    const previous = await this.load(scope,id);
    if (previous && shouldKeepSaved(previous.metrics,metrics)) return previous;
    if (previous && JSON.stringify(previous.metrics) === JSON.stringify(metrics)) return previous;
    const record = {schema:1,account:scope,conversationId:id.toLowerCase(),savedAt:new Date().toISOString(),metrics};
    const temporary = file + '.' + randomUUID() + '.tmp';
    await mkdir(join(this.directory,scope),{recursive:true});
    try { await writeFile(temporary,JSON.stringify(record),{encoding:'utf8',mode:0o600}); await rename(temporary,file); }
    catch (error) { await unlink(temporary).catch(()=>{}); throw error; }
    return {metrics,savedAt:record.savedAt};
  }
}
