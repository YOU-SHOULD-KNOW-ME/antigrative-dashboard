import { readFile } from 'node:fs/promises';
import { request } from 'node:http';
import { platformPaths } from '../../compat/platform.mjs';
import { discoverProcesses } from './discovery.mjs';

const SERVICE = '/exa.language_server_pb.LanguageServerService/';
export function serverFromDiscovery(log, processes) {
  const rows = (Array.isArray(processes) ? processes : [processes]).filter(p => /--standalone\b/.test(p.CommandLine || ''));
  if (rows.length !== 1) throw new Error(rows.length ? '检测到多个 Antigravity 实例，请保留一个' : '未找到 Antigravity 桌面后台');
  const ports = new Set([rows[0].Ports].flat().map(Number));
  const port = [...log.matchAll(/listening on random port at (\d+) for HTTP(?:\s|$)/g)].reverse().map(m=>Number(m[1])).find(p=>ports.has(p));
  if (!port) throw new Error('等待 Antigravity 本地接口启动');
  const csrf = rows[0].CommandLine.match(/--csrf_token(?:=|\s+)"?([^\s"]+)/)?.[1];
  if (!csrf) throw new Error('当前版本未提供可用的本地检测凭据');
  return {port,csrf,pid:rows[0].ProcessId};
}
export class AntigravityClient {
  server = null;
  discoveredAt = 0;
  discovering = null;

  async discover(force = false) {
    if (!force && this.server && Date.now() - this.discoveredAt < 15000) return this.server;
    if (this.discovering) return this.discovering;
    this.discovering = this.discoverNow().finally(() => { this.discovering = null; });
    return this.discovering;
  }

  async discoverNow() {
    const log = await readFile(platformPaths().log, 'utf8');
    // A sidecar can outlive a renderer/backend restart. Its injected token may
    // then refer to the previous LS instance; pair the current log port with
    // the current standalone process credential instead of mixing generations.
    const parsed = await discoverProcesses();
    if (!parsed || Array.isArray(parsed) && !parsed.length) throw new Error('请先打开 Antigravity');
    // Credentials stay in process memory. They are never logged, persisted, or
    // returned to a browser; all calls go exclusively to 127.0.0.1.
    this.server = serverFromDiscovery(log,parsed);
    this.discoveredAt = Date.now();
    return this.server;
  }

  async call(method, body = {}, retry = true) {
    const server = await this.discover();
    try {
      return await new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = request({ hostname: '127.0.0.1', port: server.port, method: 'POST', path: SERVICE + method,
          headers: { 'Content-Type': 'application/json', 'Connect-Protocol-Version': '1', 'x-codeium-csrf-token': server.csrf, 'Content-Length': Buffer.byteLength(data) } }, res => {
          let text = '';
          res.setEncoding('utf8');
          res.on('data', chunk => { text += chunk; if (text.length > 32 * 1024 * 1024) req.destroy(new Error('会话数据超过采集上限')); });
          res.on('end', () => {
            if (res.statusCode !== 200) return reject(new Error(`Antigravity 接口 ${method} 返回 ${res.statusCode}`));
            try { resolve(JSON.parse(text)); } catch { reject(new Error('Antigravity 接口返回了无法解析的数据')); }
          });
        });
        req.on('error', reject);
        req.setTimeout(12000, () => req.destroy(new Error('Antigravity 本地接口超时')));
        req.end(data);
      });
    } catch (error) {
      this.server = null;
      if (retry) { await this.discover(true); return this.call(method, body, false); }
      throw error;
    }
  }

  async trajectory(id) {
    const first = await this.call('GetCascadeTrajectory', { cascadeId: id, trajectoryVerbosity: 3 });
    const t = first.trajectory;
    if (!t) throw new Error('会话暂时没有可用统计');
    // The LS may page large conversations. Match its frontend pagination so the
    // session TPS never silently represents only the first page.
    for (const [field, count, method, offset] of [
      ['steps', 'numTotalSteps', 'GetCascadeTrajectorySteps', 'stepOffset'],
      ['generatorMetadata', 'numTotalGeneratorMetadata', 'GetCascadeTrajectoryGeneratorMetadata', 'generatorMetadataOffset'],
    ]) {
      t[field] ||= [];
      const target = Number(first[count] ?? t[field].length);
      while (t[field].length < target) {
        const body = { cascadeId: id, [offset]: t[field].length };
        if (field === 'steps') body.trajectoryVerbosity = 3;
        const page = await this.call(method, body);
        const items = page[field] || page.generatorMetadatas || [];
        if (!items.length) throw new Error('完整会话统计分页暂不可用');
        t[field].push(...items);
      }
    }
    return first;
  }
}
