import { createHash } from 'node:crypto';
import { AntigravityClient } from './client.mjs';
import { quotaMetrics, trajectoryMetrics } from './metrics.mjs';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class MetricsStore {
  constructor(client = new AntigravityClient()) { this.client = client; }
  quota = null;
  quotaAt = 0;
  quotaPending = null;
  identity = null;
  serverPid = null;
  summaries = [];
  summariesAt = 0;
  sessions = new Map();

  async refreshQuota(force = false) {
    if (!force && this.quota && Date.now() - this.quotaAt < 60000) return;
    if (this.quotaPending) return this.quotaPending;
    this.quotaPending = (async () => {
      const user = await this.client.call('GetUserStatus');
      const email = user.userStatus?.email;
      const identity = email ? createHash('sha256').update(email).digest('hex') : null;
      if (identity !== this.identity) { this.quota = null; this.quotaAt = 0; this.sessions.clear(); }
      this.identity = identity;
      const response = await this.client.call('RetrieveUserQuotaSummary');
      this.quota = quotaMetrics(response);
      this.quotaAt = Date.now();
    })().finally(() => { this.quotaPending = null; });
    return this.quotaPending;
  }

  async listConversations(force = false) {
    if (!force && Date.now() - this.summariesAt < 5000) return this.summaries;
    const response = await this.client.call('GetAllCascadeTrajectories');
    this.summaries = Object.entries(response.trajectorySummaries || {}).map(([id, value]) => ({
      id, title: value.summary || '未命名会话', modifiedAt: value.lastModifiedTime, status: value.status,
    })).sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt));
    this.summariesAt = Date.now();
    return this.summaries;
  }

  async session(id, force = false) {
    if (!GUID.test(id)) throw new Error('会话标识无效');
    let entry = this.sessions.get(id);
    if (entry?.pending) return entry.pending;
    if (!force && entry?.data && Date.now() - entry.updatedAt < 1800) return entry.data;
    entry ||= {};
    this.sessions.set(id, entry);
    entry.pending = this.client.trajectory(id).then(raw => {
      entry.data = trajectoryMetrics(raw); entry.updatedAt = Date.now(); return entry.data;
    }).finally(() => { entry.pending = null; });
    return entry.pending;
  }

  async snapshot({ conversationId, force = false } = {}) {
    const now = Date.now();
    let connection = 'live', error = null, speed = null, sessionError = null;
    try {
      const server = await this.client.discover();
      if (server.pid !== this.serverPid) {
        this.quota = null; this.quotaAt = 0; this.sessions.clear(); this.summariesAt = 0; this.serverPid = server.pid;
      }
      await this.refreshQuota(force);
      const summaries = await this.listConversations(force);
      const selected = conversationId || summaries[0]?.id;
      if (selected) {
        try { speed = await this.session(selected, force); }
        catch (e) { sessionError = e.message; }
      }
    } catch (e) { connection = this.quota ? 'stale' : 'offline'; error = e.message; }
    return {
      connection, error, sessionError, serverTime: new Date().toISOString(),
      quotaUpdatedAt: this.quotaAt ? new Date(this.quotaAt).toISOString() : null,
      groups: this.quota || [], speed, conversations: this.summaries,
      source: 'Antigravity local API',
    };
  }
}
