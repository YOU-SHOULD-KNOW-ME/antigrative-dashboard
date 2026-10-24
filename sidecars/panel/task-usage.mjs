// Task-scoped usage only. Request identities are hashed in memory and are never
// included in persisted task summaries; speed and context stay conversation-local.
import {createHash} from 'node:crypto';
import {tokenCount,trajectoryMetrics} from './metrics.mjs';

const HASH=/^[a-f0-9]{64}$/;
const fields=['inputTokens','cacheReadTokens','cacheWriteTokens','outputTokens'];
const tokenValues=['inputTokens','cachedTokens','cacheWriteTokens','uncachedTokens','outputTokens','totalTokens'];
const tokenCounts=['measuredRequests','inputRequests','outputRequests','missingInputRequests','missingOutputRequests','uncachedRequests','cachedRequests','cacheWriteRequests'];
const cacheValues=['inputTokens','cachedTokens','cacheWriteTokens','uncachedTokens','outputTokens','totalTokens'];
const count=value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const stamp=value=>typeof value==='string'&&/^20\d\d-\d\d-\d\dT/.test(value)&&Number.isFinite(Date.parse(value))?Date.parse(value):null;
const hash=value=>createHash('sha256').update(value).digest('hex');
const provider=value=>typeof value==='string'&&/^(?:API_PROVIDER_)?(?:GOOGLE_GEMINI|OPENAI|ANTHROPIC)$/.test(value)?value:'';
const add=values=>values.every(count)&&count(values.reduce((n,value)=>n+value,0))?values.reduce((n,value)=>n+value,0):null;
const coverage=row=>fields.reduce((n,key)=>n+(row[key]!==null),0);
const rowTotal=row=>fields.reduce((n,key)=>n+BigInt(row[key]??0),0n);
const sameRecord=(a,b)=>a.apiProvider===b.apiProvider&&fields.every(key=>a[key]===b[key]);

function normalizedRecord(value){
  if(!object(value)||typeof value.id!=='string'||!HASH.test(value.id))return null;
  return {id:value.id,apiProvider:provider(value.apiProvider),...Object.fromEntries(fields.map(key=>[key,count(value[key])?value[key]:null]))};
}

// Prefer a more complete observation of one request, never add observations of
// the same request. A whole-row choice avoids combining conflicting counters.
function richer(previous,next){
  const a=coverage(previous),b=coverage(next);
  if(a!==b)return b>a?next:previous;
  return rowTotal(next)>rowTotal(previous)?next:previous;
}

export function mergeTaskRecords(previousRows,nextRows){
  const unique=values=>{
    const result=new Map();
    for(const value of Array.isArray(values)?values:[]){
      const row=normalizedRecord(value);if(!row)continue;
      const old=result.get(row.id);result.set(row.id,old?richer(old,row):row);
    }
    return result;
  };
  const previous=unique(previousRows),next=unique(nextRows),merged=new Map(previous);let restored=false;
  for(const [id,old]of previous)if(!next.has(id))restored=true;
  for(const [id,row]of next){
    const old=previous.get(id);
    // A temporary metadata omission cannot erase recorded consumption or a
    // known component. Retain one coherent old row, not a synthetic field sum.
    const keep=old&&(coverage(old)>coverage(row)||rowTotal(old)>rowTotal(row));
    if(keep){if(!sameRecord(old,row))restored=true;}
    else merged.set(id,row);
  }
  return {rows:[...merged.values()],restored};
}

function contributionTotal(rows){
  // Contribution totals need no timing/cache transform. Nonnegative request
  // components make one checked sum equivalent to summarize(rows).totalTokens.
  let total=0;
  for(const row of rows)for(const key of fields){total+=row[key]??0;if(!count(total))return null;}
  return total;
}

export function taskRecords(raw,conversationId){
  const trajectory=raw?.trajectory||{},steps=Array.isArray(trajectory.steps)?trajectory.steps:[],rows=new Map();
  const generators=Array.isArray(trajectory.generatorMetadata)?trajectory.generatorMetadata:[];
  for(const [index,g]of generators.entries()){
    // Match trajectoryMetrics request presence. A malformed but present usage
    // container is an unknown request, not evidence that no request occurred.
    const chat=g?.chatModel,u=chat?.usage;if(!u)continue;
    const input=tokenCount(u.inputTokens);
    const planners=(Array.isArray(g.stepIndices)?g.stepIndices:[]).map(i=>Number.isInteger(i)&&i>=0?steps[i]:null).filter(s=>/PLANNER_RESPONSE/.test(String(s?.type||'')));
    const times=planners.map(s=>stamp(s.metadata?.createdAt)).filter(t=>t!==null);
    const at=stamp(chat.chatStartMetadata?.createdAt)??(times.length?Math.min(...times):null);
    // Keep this identity contract aligned with usageRecords in usage.mjs. The
    // fallback includes its real conversation, step association and timestamp.
    const identity=u.responseId?`response:${u.apiProvider||''}:${u.responseId}`:u.messageId?`message:${u.apiProvider||''}:${u.messageId}`:
      `fallback:${conversationId}:${JSON.stringify(g.stepIndices||[index])}:${at??'undated'}`;
    const row={id:hash(identity),apiProvider:provider(u.apiProvider),inputTokens:input,
      cacheReadTokens:u.cacheReadTokens===undefined&&input!==null?0:tokenCount(u.cacheReadTokens),
      cacheWriteTokens:u.cacheWriteTokens===undefined&&input!==null?0:tokenCount(u.cacheWriteTokens),outputTokens:tokenCount(u.outputTokens)};
    const previous=rows.get(row.id);rows.set(row.id,previous?richer(previous,row):row);
  }
  return [...rows.values()];
}

function summarize(rows){
  const raw={trajectory:{generatorMetadata:rows.map(row=>({chatModel:{usage:{...Object.fromEntries(fields.map(key=>[key,row[key]])),messageId:row.id,apiProvider:row.apiProvider}}}))}};
  const metrics=trajectoryMetrics(raw),tokens={...metrics.tokens},cache={...metrics.cache};
  // trajectoryMetrics retains known lower-bound components. At task scope an
  // arithmetic overflow must remain unavailable, not become a smaller total.
  tokens.inputTokens=add([tokens.uncachedTokens,tokens.cachedTokens,tokens.cacheWriteTokens]);
  tokens.totalTokens=add([tokens.inputTokens,tokens.outputTokens]);
  tokens.outputAvailable=count(tokens.outputTokens)&&tokens.outputRequests>0;
  tokens.complete=metrics.tokens.complete&&tokenValues.every(key=>count(tokens[key]));
  for(const key of cacheValues)if(!count(cache[key]))cache[key]=null;
  cache.inputTokens=add([cache.uncachedTokens,cache.cachedTokens,cache.cacheWriteTokens]);
  cache.totalTokens=add([cache.inputTokens,cache.outputTokens]);
  cache.hitRate=cache.inputTokens>0&&count(cache.cachedTokens)?cache.cachedTokens/cache.inputTokens:null;
  cache.complete=metrics.cache.complete&&cacheValues.every(key=>count(cache[key]));
  return {tokens,cache};
}

export function aggregateTaskUsage(rootRecords,childRecordSets=[],options={}){
  const rows=new Map();
  const collect=(values,own)=>{
    for(const value of Array.isArray(values)?values:[]){
      const row=normalizedRecord(value);if(!row)continue;
      const old=rows.get(row.id);rows.set(row.id,{row:old?richer(old.row,row):row,own:own||old?.own===true});
    }
  };
  collect(rootRecords,true);
  const children=Array.isArray(childRecordSets)?childRecordSets:[];
  for(const child of children)collect(child,false);
  const all=[...rows.values()],summary=summarize(all.map(value=>value.row));
  const subagents=count(options.subagents)?options.subagents:children.length;
  const loadedSubagents=count(options.loadedSubagents)?Math.min(options.loadedSubagents,subagents):Math.min(children.length,subagents);
  let state=['ready','partial','loading'].includes(options.state)?options.state:options.state===undefined?'ready':'partial';
  if(state==='ready'&&(loadedSubagents!==subagents||!summary.tokens.complete))state='partial';
  const complete=state==='ready'&&loadedSubagents===subagents&&summary.tokens.complete;
  summary.tokens.complete=complete;
  summary.cache.complete=summary.cache.complete&&state==='ready'&&loadedSubagents===subagents;
  return {...summary,ownTokens:contributionTotal(all.filter(value=>value.own).map(value=>value.row)),
    subagentTokens:contributionTotal(all.filter(value=>!value.own).map(value=>value.row)),
    subagents,loadedSubagents,state,complete};
}

// Strict structural validation, with conservative completeness. No raw rows,
// identifiers, provider labels, titles or caller-supplied extra keys survive.
export function safeTaskUsage(value){
  if(!object(value)||!object(value.tokens)||!object(value.cache))return null;
  const t=value.tokens,c=value.cache;
  if(!tokenValues.every(key=>t[key]===null||count(t[key]))||!tokenCounts.every(key=>count(t[key]))||
    !cacheValues.every(key=>c[key]===null||count(c[key]))||!['measuredRequests','missingRequests'].every(key=>count(c[key]))||
    !['ownTokens','subagentTokens'].every(key=>value[key]===null||count(value[key]))||
    !count(value.subagents)||!count(value.loadedSubagents)||value.loadedSubagents>value.subagents||
    typeof t.complete!=='boolean'||typeof t.outputAvailable!=='boolean'||typeof c.complete!=='boolean'||typeof value.complete!=='boolean')return null;
  const state=value.state==='unavailable'?'partial':value.state;
  if(!['ready','partial','loading'].includes(state))return null;
  const requests=add([t.inputRequests,t.missingInputRequests]);
  if(requests===null||requests!==add([t.outputRequests,t.missingOutputRequests])||requests!==add([c.measuredRequests,c.missingRequests])||
    tokenCounts.some(key=>t[key]>requests)||t.inputRequests>Math.min(t.uncachedRequests,t.cachedRequests,t.cacheWriteRequests)||
    t.measuredRequests<Math.max(t.inputRequests,t.outputRequests,t.uncachedRequests,t.cachedRequests,t.cacheWriteRequests)||c.measuredRequests>t.inputRequests)return null;
  if(t.inputTokens!==add([t.uncachedTokens,t.cachedTokens,t.cacheWriteTokens])||t.totalTokens!==add([t.inputTokens,t.outputTokens])||
    c.inputTokens!==add([c.uncachedTokens,c.cachedTokens,c.cacheWriteTokens])||c.totalTokens!==add([c.inputTokens,c.outputTokens])||
    t.totalTokens!==add([value.ownTokens,value.subagentTokens]))return null;
  if(['uncachedTokens','cachedTokens','cacheWriteTokens','inputTokens','outputTokens'].some(key=>count(c[key])&&count(t[key])&&c[key]>t[key]))return null;
  const ratio=c.inputTokens>0&&count(c.cachedTokens)?c.cachedTokens/c.inputTokens:null;
  if(c.hitRate!==ratio||c.hitRate!==null&&(!Number.isFinite(c.hitRate)||c.hitRate<0||c.hitRate>1))return null;
  const covered=state==='ready'&&value.loadedSubagents===value.subagents;
  const tokens={...Object.fromEntries([...tokenValues,...tokenCounts].map(key=>[key,t[key]])),
    outputAvailable:count(t.outputTokens)&&t.outputRequests>0,
    complete:t.complete&&covered&&t.missingInputRequests===0&&t.missingOutputRequests===0&&tokenValues.every(key=>count(t[key]))};
  const cache={...Object.fromEntries([...cacheValues,'measuredRequests','missingRequests'].map(key=>[key,c[key]])),
    hitRate:ratio,complete:c.complete&&covered&&c.missingRequests===0&&cacheValues.every(key=>count(c[key]))};
  return {tokens,cache,ownTokens:value.ownTokens,subagentTokens:value.subagentTokens,subagents:value.subagents,loadedSubagents:value.loadedSubagents,
    state,complete:value.complete&&tokens.complete&&covered};
}
