import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const exec = promisify(execFile);
const languageServer = command => /(?:^|[\/\\])language_server(?:_(?:linux|macos|darwin)(?:_(?:x64|arm64))?)?(?:\.exe)?(?:\s|$)/.test(command);

export function parsePs(text, uid) {
  return text.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/);
    if (!match || Number(match[2]) !== uid || !languageServer(match[3]) || !/--standalone\b/.test(match[3])) return [];
    return [{ ProcessId:Number(match[1]), CommandLine:match[3] }];
  });
}

export function parseLsof(text) {
  // Machine-readable fields: p (PID), n (socket name). Never parse human columns.
  let pid = null; const ports = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (/^p\d+$/.test(line)) { pid = Number(line.slice(1)); if (!ports.has(pid)) ports.set(pid,[]); }
    const port = line[0] === 'n' && line.match(/:(\d+)(?:\s|$)/)?.[1];
    if (pid && port) ports.get(pid).push(Number(port));
  }
  return ports;
}

export function parseProcNet(text) {
  return text.split(/\r?\n/).flatMap(line => {
    const fields = line.trim().split(/\s+/);
    if (fields[3] !== '0A' || !/^\d+$/.test(fields[9] || '')) return [];
    const hex = fields[1]?.split(':')[1];
    const port = /^[0-9A-F]{4}$/i.test(hex || '') ? parseInt(hex,16) : 0;
    return port > 0 ? [{inode:fields[9],port}] : [];
  });
}

export async function linuxPorts(pid, { proc = '/proc' } = {}) {
  const { readlink } = await import('node:fs/promises');
  const inodes = new Set();
  for (const fd of await readdir(join(proc,String(pid),'fd'))) {
    try { const link = await readlink(join(proc,String(pid),'fd',fd)); const m=link.match(/^socket:\[(\d+)\]$/); if(m)inodes.add(m[1]); } catch { /* Closed FD. */ }
  }
  const rows = [];
  for (const name of ['tcp','tcp6']) {
    try { rows.push(...parseProcNet(await readFile(join(proc,String(pid),'net',name),'utf8'))); } catch { /* IPv6 may be disabled. */ }
  }
  return [...new Set(rows.filter(row=>inodes.has(row.inode)).map(row=>row.port))];
}

export async function discoverProcesses({ platform = process.platform, run = exec, uid = process.getuid?.(), proc = '/proc' } = {}) {
  if (platform === 'win32') {
    const script = "Get-CimInstance Win32_Process -Filter \"Name='language_server.exe'\" | ForEach-Object { $agProcess = $_; [pscustomobject]@{ProcessId=$agProcess.ProcessId; CommandLine=$agProcess.CommandLine; Ports=@(Get-NetTCPConnection -State Listen -OwningProcess $agProcess.ProcessId -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort)} } | ConvertTo-Json -Compress";
    const {stdout}=await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:8000,maxBuffer:1048576});
    return stdout.trim() ? JSON.parse(stdout.replace(/^\uFEFF/,'')) : [];
  }
  if (platform === 'darwin') {
    const {stdout}=await run('/bin/ps',['-ww','-axo','pid=,uid=,args='],{timeout:8000,maxBuffer:4194304});
    const rows=parsePs(stdout,uid);
    if(!rows.length)return [];
    const {stdout:sockets}=await run('/usr/sbin/lsof',['-nP','-a','-p',rows.map(r=>r.ProcessId).join(','),'-iTCP','-sTCP:LISTEN','-Fpn'],{timeout:8000,maxBuffer:1048576}).catch(error=>{if(error.code===1)return {stdout:error.stdout||''};throw error;});
    const ports=parseLsof(sockets);
    return rows.map(row=>({...row,Ports:ports.get(row.ProcessId)||[]}));
  }
  if (platform === 'linux') {
    const rows=[];
    for(const pid of (await readdir(proc)).filter(p=>/^\d+$/.test(p))) {
      try {
        const status=await readFile(join(proc,pid,'status'),'utf8');
        if(Number(status.match(/^Uid:\s+(\d+)/m)?.[1])!==uid)continue;
        const command=(await readFile(join(proc,pid,'cmdline'),'utf8')).split('\0').filter(Boolean).join(' ');
        if(!languageServer(command)||!/--standalone\b/.test(command))continue;
        rows.push({ProcessId:Number(pid),CommandLine:command,Ports:await linuxPorts(pid,{proc})});
      } catch { /* Processes can exit during discovery; inaccessible processes are not candidates. */ }
    }
    return rows;
  }
  throw new Error('Supported platforms: Windows, Linux, macOS');
}
