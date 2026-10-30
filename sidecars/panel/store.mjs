import {BackgroundStatistics} from './background-statistics.mjs';
import {dirname,join} from 'node:path';
import {collectionFailure} from './collection-state.mjs';
import { createHash } from 'node:crypto';
import { AntigravityClient } from './client.mjs';
import { quotaMetrics, trajectoryMetrics } from './metrics.mjs';
import { SessionHistory, usableMetrics, reconcileMetrics, safeMetrics } from './history.mjs';
import { TranscriptReader } from './transcript.mjs';
import {DelegatedUsage} from './delegated-usage.mjs';
import {safeTaskUsage} from './task-usage.mjs';
import {delegatedIds} from './delegation.mjs';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BACKGROUND_RECHECK_MS=5*60*1000, BACKGROUND_MANUAL_COOLDOWN_MS=10*1000;
export class MetricsStore {
  constructor(client = new AntigravityClient(), { history = new SessionHistory(), onTrajectory = null, onBackgroundResult = null, background = undefined, transcripts = new TranscriptReader(), owns=()=>true } = {}) {
    this.client = client; this.history = history; this.onTrajectory=onTrajectory; this.onBackgroundResult=onBackgroundResult; this.transcripts=transcripts; this.owns=owns;
    this.background=background===undefined?(typeof client.streamTrajectoryPage==='function'&&history.directory?new BackgroundStatistics({directory:join(dirname(history.directory),'collection-jobs'),owns:()=>this.owned(),onComplete:(...args)=>this.acceptBackground(...args)}):null):background;
    if(this.background&&client.reader)client.reader.isBackgroundManaged=id=>this.sessions.get(id)?.backgroundOnly===true;
    this.delegated=new DelegatedUsage(client,{owns,
      onSource:async(scope,id,raw,options={})=>{if(this.owned()&&scope===this.identity&&this.onTrajectory&&(!options.isCurrent||options.isCurrent()===true))await this.onTrajectory(scope,id,raw,options);},
      onUpdate:async(scope,id,taskUsage,delegatedConversations)=>{
        const entry=this.sessions.get(id);if(!this.owned()||scope!==this.identity||!entry?.data)return;
        const epoch=this.epoch,current=()=>this.owned()&&scope===this.identity&&epoch===this.epoch&&this.sessions.get(id)===entry;
        entry.data={...entry.data,taskUsage,delegatedConversations};
        try{const saved=await this.history.save(scope,id,entry.data,{isCurrent:current});if(saved&&current())entry.savedAt=saved.savedAt;}
        catch{if(current())this.persistenceError='统计暂时无法保存到本地';}
      },
    });
  }
  quota = null;
  quotaAt = 0;
  quotaPending = null;
  identity = null;
  serverPid = null;
  summaries = [];
  summariesAt = 0;
  sessions = new Map();
  persistenceError = null;
  usagePersistenceError = false;
  usagePersistenceFailures = new Set();
  usagePersistenceFailureVersions = new Map();
  usagePersistenceFailureSerial = 0;
  epoch = 0;
  disposed = false;
  // Collection callbacks need a synchronous boolean. A Promise must never grant
  // ownership, and this hot predicate must not start disk I/O.
  owned(){return !this.disposed&&this.owns()===true;}
  setUsagePersistenceError(source,failed){
    if(failed){this.usagePersistenceFailures.add(source);this.usagePersistenceFailureVersions.set(source,++this.usagePersistenceFailureSerial);}else{this.usagePersistenceFailures.delete(source);this.usagePersistenceFailureVersions.delete(source);}
    this.usagePersistenceError=this.usagePersistenceFailures.size>0;
  }
  usageFailureVersion(source){return this.usagePersistenceFailureVersions.get(source)||0;}
  clearUsagePersistenceErrors(){this.usagePersistenceFailures.clear();this.usagePersistenceFailureVersions.clear();this.usagePersistenceError=false;}

  async cachedSession(id) {
    if (!this.owned() || !GUID.test(id) || !this.identity) return null;
    id=id.toLowerCase();
    const scope = this.identity, epoch = this.epoch;
    const entry = this.sessions.get(id);
    if (usableMetrics(entry?.data)) return { ...entry.data, transcriptRestoredFromHistory:!!entry.data.transcriptStats, restoredFromHistory: true, savedAt: entry.savedAt || null };
    const saved = await this.history.load(scope,id);
    if (!this.owned() || scope !== this.identity || epoch !== this.epoch) return null;
    if (!saved) return null;
    if (!this.sessions.has(id)) this.sessions.set(id,{data:saved.metrics,savedAt:saved.savedAt,updatedAt:0});
    return {...saved.metrics,transcriptRestoredFromHistory:!!saved.metrics.transcriptStats,restoredFromHistory:true,savedAt:saved.savedAt};
  }

  async refreshQuota(force = false) {
    if (!this.owned()) throw new Error('后台已重新连接，请等待刷新');
    if (!force && this.quota && Date.now() - this.quotaAt < 60000) return;
    if (this.quotaPending) return this.quotaPending;
    const epoch = this.epoch;
    this.quotaPending = (async () => {
      const user = await this.client.call('GetUserStatus');
      if (!this.owned() || epoch !== this.epoch) throw new Error('后台已重新连接，请等待刷新');
      const email = user.userStatus?.email;
      const identity = email ? createHash('sha256').update(email).digest('hex') : null;
      if (identity !== this.identity) { this.background?.reset();this.delegated.reset();this.transcripts?.reset(); this.client.resetTrajectories?.(); this.quota = null; this.quotaAt = 0; this.sessions.clear(); this.summaries = []; this.summariesAt = 0;this.clearUsagePersistenceErrors(); }
      this.identity = identity;
      const response = await this.client.call('RetrieveUserQuotaSummary');
      if (!this.owned() || epoch !== this.epoch || identity !== this.identity) throw new Error('后台已重新连接，请等待刷新');
      this.quota = quotaMetrics(response);
      this.quotaAt = Date.now();
    })().finally(() => { this.quotaPending = null; });
    return this.quotaPending;
  }

  async listConversations(force = false) {
    if (!this.owned()) throw new Error('后台已重新连接，请等待刷新');
    if (!force && Date.now() - this.summariesAt < 5000) return this.summaries;
    const scope = this.identity, epoch = this.epoch;
    const response = await this.client.call('GetAllCascadeTrajectories',{excludeSubtrajectories:false});
    if (!this.owned() || scope !== this.identity || epoch !== this.epoch) throw new Error('后台已重新连接，请等待刷新');
    this.summaries = Object.entries(response.trajectorySummaries || {}).map(([id, value]) => ({
      id, title: value.summary || '未命名会话', modifiedAt: value.lastModifiedTime, status: value.status,stepCount:value.stepCount,lastUserInputStepIndex:value.lastUserInputStepIndex,
    })).sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt));
    this.summariesAt = Date.now();
    return this.summaries;
  }

  async acceptBackground(scope,id,result,{database,revision,isCurrent}) {
    const entry=this.sessions.get(id),epoch=this.epoch;
    const current=()=>isCurrent()&&this.owned()&&scope===this.identity&&epoch===this.epoch&&this.sessions.get(id)===entry;
    if(!entry||!current())return;
    const fresh=safeMetrics(result.metrics,id);
    fresh.delegatedConversations=[...new Set([...(result.delegatedIds||[]),...(entry.data?.delegatedConversations||[])])].filter(x=>GUID.test(x)).slice(0,128);
    // A large parent snapshot does not verify its descendants. Display the
    // new root alone, never an old root/subagent aggregate as current. Keep
    // the previous verified aggregate separately for recovery, not arithmetic.
    const previousTask=safeTaskUsage(entry.data?.previousTaskUsage)||safeTaskUsage(entry.data?.taskUsage);
    if(previousTask)fresh.previousTaskUsage=previousTask;
    if(fresh.delegatedConversations.length||result.delegatedTruncated){
      fresh.taskUsage={tokens:{...fresh.tokens,outputAvailable:fresh.tokens.outputRequests>0,complete:false},cache:{...fresh.cache,complete:false},ownTokens:fresh.tokens.totalTokens,subagentTokens:0,subagents:Math.max(1,fresh.delegatedConversations.length),loadedSubagents:0,state:'partial',complete:false};
    }
    if(this.onBackgroundResult){
      try{await this.onBackgroundResult(scope,id,database,{isCurrent:current});if(current()){this.setUsagePersistenceError('background:'+id,false);entry.backgroundUsageComplete=true;}}
      catch(error){if(current()){this.setUsagePersistenceError('background:'+id,true);entry.backgroundUsageComplete=false;throw error;}return;}
    }
    if(!current())return;
    entry.data={...reconcileMetrics(entry.data,fresh,entry.savedAt||null),...(previousTask?{previousTaskUsage:previousTask}:{}),conversationId:id};entry.collection=null;entry.backgroundRevision=revision;entry.backgroundCheckedAt=Date.now();entry.backgroundCompletedAt=Date.now();entry.backgroundReady=true;entry.updatedAt=Date.now();entry.lastSuccessAt=new Date().toISOString();
    try{const saved=await this.history.save(scope,id,entry.data,{isCurrent:current});if(saved&&current())entry.savedAt=saved.savedAt;}catch{if(current())this.persistenceError='统计暂时无法保存到本地';}
  }
  startBackground(scope,id,entry,current){
    const started=this.background?.request(scope,id,this.client.server||this.client.reader?.endpoint,{summary:this.client.reader?.summaries?.[id],isCurrent:current});
    if(started){entry.backgroundOnly=true;entry.backgroundReady=false;}
    return started;
  }
  async session(id, force = false) {
    if (!GUID.test(id)) throw new Error('会话标识无效');
    if (!this.owned()) throw new Error('后台已重新连接，请等待刷新');
    id=id.toLowerCase();
    const scope = this.identity, epoch = this.epoch;
    let entry = this.sessions.get(id);
    if (entry?.pending) return entry.pending;
    if (!force && entry?.data && Date.now() - entry.updatedAt < 1800) return entry.data;
    entry ||= {};
    this.sessions.set(id, entry);
    const current = () => this.owned() && scope === this.identity && epoch === this.epoch && this.sessions.get(id) === entry;
    entry.pending = (async () => {
      if (!entry.data && scope) {
        const saved = await this.history.load(scope,id);
        if (!current()) throw new Error('后台已重新连接，请等待刷新');
        if (saved) { entry.data = saved.metrics; entry.savedAt = saved.savedAt; entry.lastSuccessAt=saved.savedAt; }
      }
      if(entry.backgroundOnly&&this.background){
        const state=this.background.state(id);
        if(state?.state==='processing')return entry.data||null;
        if(entry.backgroundReady){
          // Host summaries can stay unchanged while final token/timing metadata
          // arrives. Revalidate slowly, with a shorter manual cooldown, rather
          // than returning an indefinitely frozen result or scanning each poll.
          const age=Date.now()-(entry.backgroundCompletedAt||0);
          if(force&&age<BACKGROUND_MANUAL_COOLDOWN_MS)return entry.data;
          if(!force&&Date.now()-entry.backgroundCheckedAt<30000)return entry.data;
          const summary=await this.client.reader.summary(id,null,force);if(!current())throw Error('后台已重新连接，请等待刷新');
          entry.backgroundCheckedAt=Date.now();const revision=JSON.stringify([summary.stepCount??null,summary.lastModifiedTime??null,summary.status??null,summary.lastUserInputStepIndex??null]);
          if(revision===entry.backgroundRevision&&age<(force?BACKGROUND_MANUAL_COOLDOWN_MS:BACKGROUND_RECHECK_MS))return entry.data;
        }
        this.startBackground(scope,id,entry,current);return entry.data||null;
      }
      const raw = await this.client.trajectory(id,{force,isCurrent:current});
      if (!current()) throw new Error('后台已重新连接，请等待刷新');
      if(this.onTrajectory&&scope){try{const result=await this.onTrajectory(scope,id,raw,{isCurrent:current,guardKey:entry});if(current()&&result?.deferred!==true)this.setUsagePersistenceError('foreground:'+id,false);}catch{if(current())this.setUsagePersistenceError('foreground:'+id,true);}}
      if (!current()) throw new Error('后台已重新连接，请等待刷新');
      entry.collection=null;entry.lastSuccessAt=new Date().toISOString();
      const fresh = trajectoryMetrics(raw);
      fresh.delegatedConversations=[...new Set([...delegatedIds(id,raw,this.client.reader?.summaries||{}),...(entry.data?.delegatedConversations||[])])].slice(0,128);
      fresh.taskUsage=this.delegated.request(scope,id,raw,{saved:entry.data?.taskUsage,knownIds:fresh.delegatedConversations,force,isCurrent:current});
      // Optional background I/O cannot delay or fail the core metrics request.
      try { if(scope&&this.transcripts)fresh.transcriptStats=this.transcripts.request(scope,id,raw); } catch {}
      entry.data = {...reconcileMetrics(entry.data,fresh,entry.savedAt || null),conversationId:id}; entry.updatedAt = Date.now();
      try { const saved = await this.history.save(scope,id,entry.data,{isCurrent:current}); if (saved&&current()) entry.savedAt = saved.savedAt; if (current()) this.persistenceError = null; }
      catch { if(current())this.persistenceError = '统计暂时无法保存到本地'; }
      if (!current()) throw new Error('后台已重新连接，请等待刷新');
      return entry.data;
    })().catch(error => {
      if(current()){
        entry.collection=collectionFailure(error);
        if(entry.collection&&entry.collection.kind!=='field')this.startBackground(scope,id,entry,current);
      }
      if (current() && usableMetrics(entry.data)) { entry.updatedAt = Date.now(); entry.data = {...entry.data,transcriptRestoredFromHistory:!!entry.data.transcriptStats,restoredFromHistory:true,savedAt:entry.savedAt || null}; return entry.data; }
      throw error;
    }).finally(() => { entry.pending = null; });
    return entry.pending;
  }

  async snapshot({ conversationId, force = false, selectLatest = true } = {}) {
    let connection = 'live', error = null, speed = null, sessionError = null, collection = null;
    try {
      if (!this.owned()) throw new Error('后台已重新连接，请等待刷新');
      const server = await this.client.discover();
      if (!this.owned()) throw new Error('后台已重新连接，请等待刷新');
      if (server.pid !== this.serverPid) {
        this.epoch++; this.background?.reset();this.delegated.reset();this.transcripts?.reset(); this.quota = null; this.quotaAt = 0; this.sessions.clear(); this.identity = null; this.summaries = []; this.summariesAt = 0; this.serverPid = server.pid;this.clearUsagePersistenceErrors();
      }
      try { await this.refreshQuota(force); }
      catch (e) { connection = this.quota ? 'stale' : 'offline'; error = e.message; }
      let summaries = this.summaries;
      // The inline composer already supplies its exact ID. Enumerating every
      // conversation first adds unrelated RPC latency to a route transition.
      // An unresolved inline composer must not read an unrelated recent chat.
      // Standalone panels retain their default automatic conversation selection.
      if (!conversationId && selectLatest !== false) {
        try { summaries = await this.listConversations(force); }
        catch (e) { connection = this.quota ? 'stale' : 'offline'; error ||= e.message; }
      }
      const selected = conversationId || (selectLatest !== false ? summaries[0]?.id : null);
      if (selected) {
        try { speed = await this.session(selected, force); }
        catch (e) { sessionError = e.message; }
        const entry=this.sessions.get(selected.toLowerCase());
        if(entry?.collection||this.background?.state(selected.toLowerCase()))collection={...entry?.collection,...this.background?.state(selected.toLowerCase()),freshness:usableMetrics(speed)?'saved':'unavailable',lastSuccessAt:entry.lastSuccessAt||null};
      }
    } catch (e) {
      connection = this.quota ? 'stale' : 'offline'; error = e.message;
      if (conversationId) speed = await this.cachedSession(conversationId);
    }
    if(!collection&&conversationId){
      const entry=this.sessions.get(conversationId.toLowerCase());
      if(entry?.collection||this.background?.state(conversationId.toLowerCase()))collection={...entry?.collection,...this.background?.state(conversationId.toLowerCase()),freshness:usableMetrics(speed)?'saved':'unavailable',lastSuccessAt:entry.lastSuccessAt||null};
    }
    return {
      connection, error, sessionError, collection, serverTime: new Date().toISOString(),
      quotaUpdatedAt: this.quotaAt ? new Date(this.quotaAt).toISOString() : null,
      groups: this.quota || [], speed, conversations: this.summaries,
      persistenceError: this.persistenceError,
      source: 'Antigravity local API',
    };
  }
  dispose(){this.disposed=true;this.background?.dispose();this.delegated.dispose();this.transcripts?.reset();this.epoch++;}
}
