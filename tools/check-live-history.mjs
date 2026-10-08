// Optional local recovery/check. Prints only counts and metrics, never host credentials or conversation text.
import { MetricsStore } from '../sidecars/panel/store.mjs';
import { AntigravityClient } from '../sidecars/panel/client.mjs';
import { usableMetrics } from '../sidecars/panel/history.mjs';

const store=new MetricsStore();
const first=await store.snapshot({force:true});
if (!store.identity) throw new Error('Cannot authenticate the current account for local history');
const ids=first.conversations.map(item=>item.id).filter(id=>/^[0-9a-f-]{36}$/i.test(id));
let saved=0, unavailable=0, example=null;
for (const id of ids) {
  try {
    const metrics=await store.session(id,true);
    if (usableMetrics(metrics) && !store.persistenceError) { saved++; example ||= {id,metrics}; }
    else unavailable++;
  } catch { unavailable++; }
}
if (!example) throw new Error('No recoverable request metadata found');
const client=new AntigravityClient();
client.trajectory=async()=>{throw new Error('Simulated unavailable historical backend');};
const restarted=new MetricsStore(client);
const restored=await restarted.snapshot({conversationId:example.id,force:true});
if (!restored.speed?.restoredFromHistory || restored.speed.tps !== example.metrics.tps || restored.speed.cache.hitRate !== example.metrics.cache.hitRate) throw new Error('Persistent history restoration check failed');
console.log(JSON.stringify({conversations:ids.length,saved,unavailable,restartRestoration:true,exampleTps:restored.speed.tps,exampleCacheHit:restored.speed.cache.hitRate,persistenceError:store.persistenceError}));
