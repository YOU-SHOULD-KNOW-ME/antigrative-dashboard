// Verified host relationship fields only. Never infer delegation from titles,
// prompts, tool-result text, workspace paths or an ordinary conversation fork.
export const conversationId=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const normalizeConversationId=value=>typeof value==='string'&&conversationId.test(value)?value.toLowerCase():null;

export function delegatedIds(id,raw,summaries={}){
 const parent=normalizeConversationId(id);if(!parent)return [];
 const ids=new Set(),add=value=>{const child=normalizeConversationId(value);if(child&&child!==parent)ids.add(child);};
 const steps=raw?.trajectory?.steps??raw?.steps;
 if(Array.isArray(steps))for(const step of steps){
  const invocation=step?.invokeSubagent;
  if(!invocation||typeof invocation!=='object'||Array.isArray(invocation))continue;
  add(invocation.conversationId);
  if(Array.isArray(invocation.results))for(const result of invocation.results)add(result?.conversationId);
 }
 if(summaries&&typeof summaries==='object'&&!Array.isArray(summaries))for(const [child,summary]of Object.entries(summaries)){
  const metadata=summary?.trajectoryMetadata;
  if(normalizeConversationId(metadata?.parentConversationId)===parent||normalizeConversationId(metadata?.rootConversationId)===parent)add(child);
 }
 return [...ids];
}
