import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';

const exec = promisify(execFile);
const SERVICE = '/exa.language_server_pb.LanguageServerService/';
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
    if (process.platform !== 'win32') throw new Error('当前采集适配器支持 Windows');
    const logPath = join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Antigravity', 'logs', 'language_server.log');
    const log = await readFile(logPath, 'utf8');
    const port = [...log.matchAll(/listening on random port at (\d+) for HTTP(?:\s|$)/g)].at(-1)?.[1];
    if (!port) throw new Error('等待 Antigravity 本地接口启动');
    if (process.env.ANTIGRAVITY_CSRF_TOKEN && process.env.ANTIGRAVITY_LS_ADDRESS) {
      this.server = { port:Number(port), csrf:process.env.ANTIGRAVITY_CSRF_TOKEN, pid:'host-sidecar' };
      this.discoveredAt = Date.now();
      return this.server;
    }
    const script = "Get-CimInstance Win32_Process -Filter \"Name='language_server.exe'\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress";
    const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 8000, maxBuffer: 1048576 });
    if (!stdout.trim()) throw new Error('请先打开 Antigravity');
    const parsed = JSON.parse(stdout.replace(/^\uFEFF/, ''));
    const rows = (Array.isArray(parsed) ? parsed : [parsed]).filter(p => /--standalone\b/.test(p.CommandLine || ''));
    if (rows.length !== 1) throw new Error(rows.length ? '检测到多个 Antigravity 实例，请保留一个' : '未找到 Antigravity 桌面后台');
    const csrf = rows[0].CommandLine.match(/--csrf_token(?:=|\s+)"?([^\s"]+)/)?.[1];
    if (!csrf) throw new Error('当前版本未提供可用的本地检测凭据');
    // Credentials stay in process memory. They are never logged, persisted, or
    // returned to a browser; all calls go exclusively to 127.0.0.1.
    this.server = { port: Number(port), csrf, pid: rows[0].ProcessId };
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
