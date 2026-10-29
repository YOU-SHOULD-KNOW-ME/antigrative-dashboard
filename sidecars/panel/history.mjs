import { readFile, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { safeContext } from './context.mjs';
import { safeTranscriptStats } from './transcript.mjs';
import { RATE_VERSION, RATE_REASONS } from './rate-quality.mjs';
import {safeTaskUsage} from './task-usage.mjs';
import {normalizeConversationId} from './delegation.mjs';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCOPE = /^[0-9a-f]{64}$/;
const numeric = ['steps','rounds','requests','measuredRequests','missingTiming','tps','latestTps','streamingSeconds','modelSeconds','toolSeconds','ttftSeconds','excludedTiming','rateWarnings'];
const counts = ['input','output','responseOutput','thinkingOutput','cacheRead','cacheWrite'];
const cache = ['inputTokens','cachedTokens','cacheWriteTokens','uncachedTokens','outputTokens','measuredRequests','missingRequests','totalTokens','hitRate'];
const tokens = ['inputTokens','cachedTokens','cacheWriteTokens','uncachedTokens','outputTokens','measuredRequests','inputRequests','outputRequests','missingInputRequests','missingOutputRequests','totalTokens'];
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

const tokenNumber = value => number(value) && Number.isSafeInteger(value);

export function safeMetrics(value, conversationId) {
  if (!GUID.test(conversationId) || !value || typeof value !== 'object') throw new Error('Invalid conversation statistics');
  const result = { conversationId, counts: {}, cache: {}, source: 'Antigravity request metadata' };
  for (const key of numeric) result[key] = number(value[key]) ? value[key] : null;
  for (const key of counts) result.counts[key] = tokenNumber(value.counts?.[key]) ? value.counts[key] : 0;
  for (const key of cache) result.cache[key] = (key==='hitRate'?number:tokenNumber)(value.cache?.[key]) ? value.cache[key] : null;
  if (result.cache.hitRate > 1) result.cache.hitRate = null;
  for (const key of ['complete','latestShortSample']) result[key] = value[key] === true;
  result.cache.complete = value.cache?.complete === true;
  result.tokens = {};
  if (value.tokens && typeof value.tokens === 'object') {
    for (const key of tokens) result.tokens[key] = tokenNumber(value.tokens[key]) ? value.tokens[key] : null;
    // Earlier token records counted only requests with complete input. That
    // count remains a conservative component-coverage fallback on upgrade.
    for (const key of ['uncachedRequests','cachedRequests','cacheWriteRequests']) result.tokens[key] =
      tokenNumber(value.tokens[key]) ? value.tokens[key] : result.tokens.inputRequests;
    result.tokens.outputAvailable = tokenNumber(result.tokens.outputTokens) &&
      (value.tokens.outputAvailable === true || result.tokens.outputRequests > 0);
    const suppliedTotal = result.tokens.totalTokens;
    const total = (result.tokens.inputTokens??0)+(result.tokens.outputTokens??0);
    result.tokens.totalTokens = (result.tokens.inputTokens!==null||result.tokens.outputTokens!==null)&&tokenNumber(total) ? total : null;
    result.tokens.coverageUnknown = value.tokens.coverageUnknown === true || tokens.some(key=>result.tokens[key]===null) || suppliedTotal!==result.tokens.totalTokens;
    result.tokens.complete = value.tokens.complete === true && !result.tokens.coverageUnknown &&
      result.tokens.missingInputRequests === 0 && result.tokens.missingOutputRequests === 0 &&
      result.tokens.inputRequests === result.requests && result.tokens.outputRequests === result.requests &&
      tokens.every(key=>result.tokens[key]!==null) &&
      result.tokens.inputTokens === result.tokens.uncachedTokens+result.tokens.cachedTokens+result.tokens.cacheWriteTokens &&
      suppliedTotal === result.tokens.totalTokens;
  } else {
    // Schema-1 records used a cache-only total, but already saved all output
    // usage in counts. Recover those real counts without deleting user history.
    const inputRequests = result.cache.measuredRequests || 0;
    const outputAvailable = tokenNumber(value.counts?.output);
    // The legacy counts group already saved readable normalized input parts,
    // including requests rejected by the old cache eligibility check.
    for (const [key,counter] of [['uncachedTokens','input'],['cachedTokens','cacheRead'],['cacheWriteTokens','cacheWrite']]) {
      result.tokens[key] = tokenNumber(value.counts?.[counter]) ? value.counts[counter] : result.cache[key] || 0;
    }
    const inputTotal=result.tokens.uncachedTokens+result.tokens.cachedTokens+result.tokens.cacheWriteTokens;
    result.tokens.inputTokens=tokenNumber(inputTotal)?inputTotal:null;
    const minimumCoverage=field=>Math.max(inputRequests,result.tokens[field]>0?1:0);
    const total=(result.tokens.inputTokens??0)+result.counts.output;
    Object.assign(result.tokens,{outputTokens:result.counts.output,inputRequests,outputRequests:null,outputAvailable,
      uncachedRequests:minimumCoverage('uncachedTokens'),cachedRequests:minimumCoverage('cachedTokens'),cacheWriteRequests:minimumCoverage('cacheWriteTokens'),
      measuredRequests:Math.max(inputRequests,result.counts.output>0||inputTotal>0?1:0),
      missingInputRequests:Math.max(0,(result.requests||0)-inputRequests),
      // Old counts defaulted missing output to zero and did not save coverage.
      // The aggregate can be recovered, but completeness cannot be inferred.
      missingOutputRequests:null,coverageUnknown:true,
      totalTokens:tokenNumber(total)?total:null,
      complete:false});
  }
  for (const key of ['speedRestoredFromHistory','cacheRestoredFromHistory']) result[key] = value[key] === true;
  for (const key of ['speedSavedAt','cacheSavedAt']) result[key] = typeof value[key] === 'string' && Number.isFinite(Date.parse(value[key])) ? new Date(value[key]).toISOString() : null;
  result.rateBasis = value.rateBasis === 'response' ? 'response' : 'all-output';
  result.model = typeof value.model === 'string' ? value.model.slice(0,256) : null;
  result.status = typeof value.status === 'string' && /^[A-Z0-9_]+$/.test(value.status) ? value.status : null;
  result.context = safeContext(value.context) || null;
  const task=safeTaskUsage(value.taskUsage);
  if(task)result.taskUsage=task;
  if(Array.isArray(value.delegatedConversations))result.delegatedConversations=[...new Set(value.delegatedConversations.map(normalizeConversationId).filter(id=>id&&id!==conversationId.toLowerCase()))].slice(0,128);
  const transcript=safeTranscriptStats(value.transcriptStats);
  // Transient loading/I/O status must not churn history timestamps or revive
  // a prior estimate. Persist only a measured numeric snapshot.
  if(transcript&&['ready','partial'].includes(transcript.status)&&(transcript.matchedSteps>0||transcript.complete))result.transcriptStats=transcript;
  result.rateVersion = value.rateVersion === RATE_VERSION ? RATE_VERSION : 0;
  result.timingReasons = Object.fromEntries(RATE_REASONS.map(key=>[key,number(value.timingReasons?.[key]) ? value.timingReasons[key] : 0]));
  result.latestRateStatus = ['ok','missing','unreliable'].includes(value.latestRateStatus) ? value.latestRateStatus : 'missing';
  if (result.rateVersion !== RATE_VERSION) {
    // Old aggregates cannot be repaired without the raw trajectory. Retain
    // usage/context, but never present a legacy unvalidated rate as trustworthy.
    result.tps = result.latestTps = result.streamingSeconds = null;
    result.measuredRequests = 0;
    result.latestRateStatus = 'legacy';
    result.latestShortSample = false;
  }
  return result;
}

export function usableMetrics(metrics) {
  return number(metrics?.tps) && metrics.measuredRequests > 0 || metrics?.tokens?.measuredRequests > 0 || metrics?.cache?.measuredRequests > 0 ||
    metrics?.requests > 0 && metrics?.counts?.output > 0 || !!safeContext(metrics?.context) || safeTaskUsage(metrics?.taskUsage)?.tokens.measuredRequests > 0;
}

export function shouldKeepSaved(saved, fresh) {
  // A quality reclassification can intentionally reduce measuredRequests.
  // Protect raw coverage rather than retaining the older polluted TPS.
  return usableMetrics(saved) && (!usableMetrics(fresh) || fresh.complete === false ||
    fresh.requests < saved.requests || fresh.counts?.output < saved.counts?.output);
}

export function reconcileMetrics(saved, fresh, savedAt = null) {
  if (shouldKeepSaved(saved,fresh)) return {...saved,taskUsage:safeTaskUsage(fresh.taskUsage)||safeTaskUsage(saved.taskUsage),delegatedConversations:fresh.delegatedConversations||saved.delegatedConversations,transcriptStats:fresh.transcriptStats||null,transcriptRestoredFromHistory:false,context:fresh.context || null,contextRestored:false,
    restoredFromHistory:true,savedAt};
  const result = {...fresh,contextRestored:false,transcriptRestoredFromHistory:false,restoredFromHistory:false,
    speedRestoredFromHistory:fresh.speedRestoredFromHistory===true,
    cacheRestoredFromHistory:fresh.cacheRestoredFromHistory===true};
  if (!usableMetrics(saved)) return result;
  // Protect only reduced cache coverage. Current quality reclassification can
  // deliberately reject timing; never revive an older, unvalidated rate.
  if ((fresh.cache?.measuredRequests||0) < (saved.cache?.measuredRequests||0)) {
    result.cache = saved.cache;
    result.cacheRestoredFromHistory = true;
    result.cacheSavedAt = saved.cacheSavedAt || savedAt;
  }
  return result;
}

export class SessionHistory {
  pending = new Map();
  constructor(directory = join(process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR || join(homedir(),'.gemini','antigravity','sidecar_data','antigravity-pulse','panel','data'),'history-v1'), {io={}}={}) {
    this.directory = directory;this.io={readFile,mkdir,writeFile,rename,unlink,...io};
  }
  file(scope, id) {
    if (!SCOPE.test(scope) || !GUID.test(id)) throw new Error('Invalid history scope');
    return join(this.directory, scope, id.toLowerCase() + '.json');
  }
  async load(scope, id) {
    if (!scope) return null;
    try {
      const text = await this.io.readFile(this.file(scope,id),'utf8');
      if (text.length > 65536) return null;
      const record = JSON.parse(text);
      if (record.schema !== 1 || record.account !== scope || record.conversationId !== id.toLowerCase() || !Number.isFinite(Date.parse(record.savedAt))) return null;
      const metrics = safeMetrics(record.metrics,id);
      return usableMetrics(metrics) ? { metrics, savedAt: record.savedAt } : null;
    } catch { return null; }
  }
  async save(scope, id, value, {isCurrent=()=>true}={}) {
    if (!scope||isCurrent()!==true) return null;
    const key = this.file(scope,id);
    const previous = this.pending.get(key) || Promise.resolve();
    const pending = previous.catch(()=>{}).then(()=>isCurrent()===true?this.write(scope,id,value,{isCurrent}):null);
    this.pending.set(key,pending);
    try { return await pending; }
    finally { if (this.pending.get(key) === pending) this.pending.delete(key); }
  }
  async write(scope, id, value, {isCurrent=()=>true}={}) {
    if(isCurrent()!==true)return null;
    let metrics = safeMetrics(value,id);
    const file = this.file(scope,id);
    if (!usableMetrics(metrics)) return null;
    const previous = await this.load(scope,id);
    if(isCurrent()!==true)return null;
    if (previous && shouldKeepSaved(previous.metrics,metrics)) {
      // Regression guards protect cumulative TPS/cache. A valid current context
      // can shrink after compaction; it must still replace the prior snapshot.
      if (!metrics.context&&!Object.hasOwn(value,'transcriptStats')&&!Object.hasOwn(value,'taskUsage')) return previous;
      metrics = reconcileMetrics(previous.metrics,metrics,previous.savedAt);
    } else if (previous) {
      metrics = reconcileMetrics(previous.metrics,metrics,previous.savedAt);
    }
    metrics = safeMetrics(metrics,id);
    if (previous && JSON.stringify(previous.metrics) === JSON.stringify(metrics)) return previous;
    const record = {schema:1,account:scope,conversationId:id.toLowerCase(),savedAt:new Date().toISOString(),metrics};
    const temporary = file + '.' + randomUUID() + '.tmp';
    try {
      await this.io.mkdir(join(this.directory,scope),{recursive:true});
      if(isCurrent()!==true)return null;
      await this.io.writeFile(temporary,JSON.stringify(record),{encoding:'utf8',mode:0o600});
      if(isCurrent()!==true){await this.io.unlink(temporary).catch(()=>{});return null;}
      // Once rename has entered the OS it cannot be revoked. Recheck at its
      // commit boundary; callers still discard late results after ownership loss.
      await this.io.rename(temporary,file);
    }
    catch (error) { await this.io.unlink(temporary).catch(()=>{});if(isCurrent()!==true)return null;throw error; }
    return {metrics,savedAt:record.savedAt};
  }
}
