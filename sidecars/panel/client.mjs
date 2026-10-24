import { readFile } from 'node:fs/promises';
import { request } from 'node:http';
import { platformPaths } from '../../compat/platform.mjs';
import { discoverProcesses } from './discovery.mjs';
import { TrajectoryJson } from './trajectory-json.mjs';
import { TrajectoryReader } from './trajectory-reader.mjs';

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
  constructor({paths=platformPaths,readLog=readFile,processes=discoverProcesses,now=Date.now,onRpc=null}={}) {
    this.paths=paths;this.readLog=readLog;this.processes=processes;this.now=now;this.onRpc=onRpc;this.reader=new TrajectoryReader(this);
  }
  server = null;
  discoveredAt = 0;
  discovering = null;
  lastScanAt = -Infinity;
  retryAt = 0;
  discoveryFailures = 0;
  discoveryError = null;

  async discover(force = false) {
    if (!force && this.server && this.now() - this.discoveredAt < 15000) return this.server;
    if (this.discovering) return this.discovering;
    if (!force && this.discoveryError && this.now() < this.retryAt) throw this.discoveryError;
    this.lastScanAt=this.now();
    this.discovering = this.discoverNow().then(server=>{
      this.discoveredAt=this.now();this.discoveryFailures=0;this.discoveryError=null;this.retryAt=0;return server;
    }).catch(error=>{
      this.discoveryError=error;this.discoveryFailures++;
      this.retryAt=this.now()+Math.min(30000,3000*2**Math.min(4,this.discoveryFailures-1));throw error;
    }).finally(() => { this.discovering = null; });
    return this.discovering;
  }

  async discoverNow() {
    this.server=null;
    // A sidecar can outlive a renderer/backend restart. Its injected token may
    // then refer to the previous LS instance; pair the current log port with
    // the current standalone process credential instead of mixing generations.
    const parsed = await this.processes();
    if (!parsed || Array.isArray(parsed) && !parsed.length) throw new Error('请先打开 Antigravity');
    // Credentials stay in process memory. They are never logged, persisted, or
    // returned to a browser; all calls go exclusively to 127.0.0.1.
    let foundLog=false,lastError=null;
    const paths=this.paths();
    for(const file of paths.logCandidates||[paths.log]) {
      try {
        const log=await this.readLog(file,'utf8');foundLog=true;
        this.server=serverFromDiscovery(log,parsed);break;
      } catch(error) {
        if(error.code!=='ENOENT'&&error.code!=='ENOTDIR')lastError=error;
      }
    }
    if(!this.server)throw lastError||new Error(foundLog?'等待 Antigravity 本地接口启动':'未找到 Antigravity 语言服务日志，请检查日志路径');
    this.discoveredAt = this.now();
    return this.server;
  }

  async call(method, body = {}, retry = true) {
    const server = await this.discover();
    try {
      return await new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const projection=['GetCascadeTrajectory','GetCascadeTrajectorySteps','GetCascadeTrajectoryGeneratorMetadata','GetAllCascadeTrajectories'].includes(method);
        const started=this.now();
        // A rejected stream destroys its socket. Do not leave that socket in
        // the shared agent where an immediate quota refresh could reuse it.
        const req = request({ hostname: '127.0.0.1', port: server.port, method: 'POST', path: SERVICE + method, ...(projection?{agent:false}:{}),
          headers: { 'Content-Type': 'application/json', 'Connect-Protocol-Version': '1', 'x-codeium-csrf-token': server.csrf, 'Content-Length': Buffer.byteLength(data) } }, res => {
          const projected=projection?new TrajectoryJson():null;
          let text = '',bytes=0,failed=false;
          // Parsing can fail after the request has finished sending. Destroying
          // that request does not always emit another request error, and the
          // response's error/end handlers deliberately ignore failed streams.
          // Settle here before closing transport so malformed replies never hang.
          const fail=error=>{if(failed)return;failed=true;reject(error);req.destroy(error);};
          res.setEncoding('utf8');
          res.on('error',error=>{if(!failed)reject(error);});
          res.on('data', chunk => {
            if(failed)return;bytes+=Buffer.byteLength(chunk);
            // Projected streams have no whole-response byte ceiling. The
            // retained statistics budget, parser depth and time bound work.
            if(!(projected&&res.statusCode===200)&&bytes>32*1024*1024){fail(new Error('接口响应超过采集上限'));return;}
            try { if(projected&&res.statusCode===200)projected.write(chunk);else text+=chunk; }
            catch(error){fail(error);}
          });
          res.on('end', () => {
            if(failed)return;
            if (res.statusCode !== 200) return reject(Object.assign(new Error(`Antigravity 接口 ${method} 返回 ${res.statusCode}`),{status:res.statusCode}));
            try {
              const value=projected?projected.end():JSON.parse(text);
              try{this.onRpc?.({method,bytes,retainedBytes:projected?.retained??Buffer.byteLength(text),ms:this.now()-started});}catch{}
              resolve(value);
            }
            catch(error) { reject(projected?error:new Error('Antigravity 接口返回了无法解析的数据')); }
          });
        });
        req.on('error', reject);
        req.setTimeout(12000, () => req.destroy(new Error('Antigravity 本地接口超时')));
        // Bound wall time as well as idle time for slow large streams.
        const deadline=setTimeout(()=>req.destroy(new Error('Antigravity 本地接口超时')),30000);deadline.unref();
        req.once('close',()=>clearTimeout(deadline));
        req.end(data);
      });
    } catch (error) {
      // A missing historical cascade, busy API or malformed response does not
      // prove the process/credential changed. Do not launch CIM scans for it.
      const endpointLost=[401,403].includes(error.status)||['ECONNREFUSED','ECONNRESET','EPIPE','ENOTCONN'].includes(error.code);
      if(!endpointLost)throw error;
      // A late failure from an old endpoint cannot invalidate a newer one.
      if(this.server===server){
        this.server=null;this.discoveryError=error;
        this.retryAt=Math.max(this.retryAt,this.lastScanAt+3000);
      }
      if(retry){await this.discover();return this.call(method,body,false);}
      throw error;
    }
  }

  resetTrajectories(){this.reader.reset();}
  trajectory(id,options){return this.reader.read(id,options);}
}
