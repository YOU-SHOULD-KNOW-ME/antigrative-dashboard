import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {parseNetstat,parseLsof,linuxPorts} from '../sidecars/panel/discovery.mjs';
const exec=promisify(execFile);
// The IDE's 2.5.5 language server is deliberately identified by its native
// name and its IDE sub-client flag.  Do not match the standalone/LSP server:
// the latter can expose a compatible HTTP endpoint but has no IDE renderer.
const flag = (command, name, {value}={}) => {
  const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const pattern=value === undefined
    ? new RegExp(`(?:^|\\s)["']?--${escaped}(?:["']?)(?=\\s|$)`, 'i')
    : new RegExp(`(?:^|\\s)["']?--${escaped}=(?:["']?)${value}(?:["']?)(?=\\s|$)|(?:^|\\s)["']?--${escaped}\\s+["']?${value}["']?(?=\\s|$)`, 'i');
  return pattern.test(String(command||''));
};

const agyExecutable=/^agy(?:\.exe)?$/i;
const commandTokens=command=>String(command||'').match(/"([^"\\]*(?:\\.[^"\\]*)*)"|'([^']*)'|([^\s]+)/g)?.map(token=>{
  const value=token.replace(/^['"]|['"]$/g,'');
  return value.replace(/\\(["'])/g,'$1');
})||[];
const executableBase=value=>String(value||'').replace(/\\/g,'/').split('/').at(-1)||'';

export const ideServer=row=>/^language_server_(?:windows|linux|macos)_(?:x64|arm|arm64)(?:\.exe)?$/i.test(row.Name||'')
  && flag(row.CommandLine,'subclient_type',{value:'ide'})
  && !flag(row.CommandLine,'enable_lsp')
  && !/(?:^|\s)["']?--enable_lsp(?:=|\s|$)/i.test(row.CommandLine||'');
export const agyServer=row=>agyExecutable.test(String(row?.Name||''))
  && agyExecutable.test(executableBase(commandTokens(row?.CommandLine)[0]))
  && flag(row?.CommandLine,'hub')
  && !flag(row?.CommandLine,'enable_lsp')
  && !/(?:^|\s)["']?--enable_lsp(?:=|\s|$)/i.test(row?.CommandLine||'');

const legacyIdeRoot=/^(?:Antigravity IDE(?:\.exe)?|antigravity-ide)$/i;

export const ideRoot=row=>{
  const name=String(row?.Name||'');
  const command=String(row?.CommandLine||'');
  if(legacyIdeRoot.test(name))return !/(?:^|[\s"]|')--(?:type|utility-sub-type)(?:[=\s"]|$)/i.test(command);
  // `agy --hub` is a language-server/hub candidate, never a renderer root.
  return false;
};

export const MAX_LINEAGE_HOPS=4;
function processId(value){return Number.isSafeInteger(Number(value))&&Number(value)>0?Number(value):null;}
function lineage(rows){
  const byPid=new Map();
  for(const row of rows){const pid=processId(row?.ProcessId);if(pid!==null&&!byPid.has(pid))byPid.set(pid,row);}
  return byPid;
}
function isDescendant(pid,rootPid,byPid,maxHops=MAX_LINEAGE_HOPS){
  const target=processId(pid),root=processId(rootPid);if(target===null||root===null)return false;
  if(target===root)return true;
  const seen=new Set([target]);let current=target;
  for(let hop=0;hop<maxHops;hop++){
    const parent=processId(byPid.get(current)?.ParentProcessId);
    if(parent===null||seen.has(parent))return false;
    if(parent===root)return true;
    seen.add(parent);current=parent;
  }
  return false;
}

export function selectIdeServer(rows,portOwners,debugPort) {
  if(!Number.isInteger(debugPort)||debugPort<1||debugPort>65535)throw Error('Invalid IDE renderer port');
  const value=portOwners.get(debugPort);
  const owners=value instanceof Set||Array.isArray(value)?[...value]:value===undefined?[]:[value];
  const pids=new Set(owners.map(processId).filter(pid=>pid!==null));
  const byPid=lineage(rows);
  // The renderer/debug port must be owned by the actual IDE root.  A socket
  // inherited by an Electron helper is not sufficient proof of ownership;
  // this also prevents a stale helper from selecting the wrong IDE instance.
  const roots=rows.filter(r=>pids.has(r.ProcessId)&&ideRoot(r));
  if(!roots.length)throw Error('IDE renderer port does not belong to Antigravity IDE');
  if(roots.length!==1)throw Error('Multiple Antigravity IDE instances own the renderer port');
  const root=roots[0];
  const candidates=rows.filter(r=>(ideServer(r)||agyServer(r))&&isDescendant(r.ProcessId,root.ProcessId,byPid));
  if(candidates.length!==1)throw Error('Waiting for the IDE main language server');
  return {...candidates[0],rootPid:root.ProcessId};
}

export async function discoverIdeProcesses(debugPort,{platform=process.platform,run=exec,uid=process.getuid?.(),linuxPort=linuxPorts}={}) {
  let rows,ports;
  if(platform==='win32'){
    // Keep the complete process table so a helper between agy and the
    // language server can be proven by PID lineage.  Selection remains strict
    // in ideRoot/ideServer below; unknown processes never become candidates.
    const script="Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress";
    // 2.6 keeps the hub behind helper processes, so the bounded process table
    // also carries ancestry evidence. Keep the output capped while allowing a
    // normal Windows desktop process list with long command lines.
    const r=await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:8000,maxBuffer:8388608});
    const parsed=r.stdout.trim()?JSON.parse(r.stdout.replace(/^\uFEFF/,'')):[];rows=(Array.isArray(parsed)?parsed:[parsed]).filter(row=>processId(row?.ProcessId)!==null).map(row=>({...row,ProcessId:processId(row.ProcessId),ParentProcessId:processId(row.ParentProcessId)}));
    ports=parseNetstat((await run('netstat.exe',['-ano','-p','tcp'],{windowsHide:true,timeout:4000,maxBuffer:4194304})).stdout);
  }else{
    const {stdout}=await run('/bin/ps',['-ww','-axo','pid=,ppid=,uid=,args='],{timeout:8000,maxBuffer:4194304});
    rows=stdout.split(/\r?\n/).flatMap(line=>{
      const m=line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);if(!m||Number(m[3])!==uid)return [];
      const command=m[4];const first=commandTokens(command)[0]||'';const base=executableBase(first);let name;
      if(/(?:^|\/)Antigravity IDE(?:\s|$)/i.test(command))name='Antigravity IDE';
      else if(/^(?:antigravity-ide)$/i.test(base))name='antigravity-ide';
      else if(agyExecutable.test(base))name=base;
      else name=base.match(/^language_server_(?:macos|linux)_(?:x64|arm|arm64)$/i)?.[0];
      // Keep unknown same-user rows as ancestry evidence.  Their Name is
      // intentionally opaque and can never satisfy ideRoot/ideServer.
      return [{ProcessId:Number(m[1]),ParentProcessId:Number(m[2]),Name:name||base,CommandLine:command}];
    });
    if(!rows.length)throw Error('Waiting for Antigravity IDE processes');
    const known=rows.filter(r=>ideRoot(r)||ideServer(r)||agyServer(r));
    const byPid=lineage(rows);
    const relevant=new Map();
    for(const row of known){relevant.set(row.ProcessId,row);let current=row.ProcessId;for(let hop=0;hop<MAX_LINEAGE_HOPS;hop++){const parent=byPid.get(current)?.ParentProcessId;const parentId=processId(parent);if(parentId===null||relevant.has(parentId))break;const parentRow=byPid.get(parentId);if(!parentRow)break;relevant.set(parentId,parentRow);current=parentId;}}
    if(!known.length)throw Error('Waiting for Antigravity IDE processes');
    if(platform==='darwin'){
      const {stdout}=await run('/usr/sbin/lsof',['-nP','-a','-p',[...relevant.keys()].join(','),'-iTCP','-sTCP:LISTEN','-Fpn'],{timeout:8000,maxBuffer:2097152}).catch(e=>{if(e.code===1)return{stdout:''};throw e;});
      ports=parseLsof(stdout);
    }else if(platform==='linux')ports=new Map(await Promise.all([...relevant.values()].map(async r=>[r.ProcessId,await linuxPort(r.ProcessId).catch(()=>[])])));
    else throw Error('Unsupported IDE platform');
  }
  const owners=new Map();
  // /proc and lsof may report the same inherited socket for the root, its
  // language server and Electron helpers. Keep all owners; never let process
  // iteration order replace the root or resolve a multi-instance ambiguity.
  for(const [pid,values] of ports)for(const port of values){if(!owners.has(port))owners.set(port,new Set());owners.get(port).add(pid);}
  const selected=selectIdeServer(rows,owners,debugPort);
  return {...selected,Ports:ports.get(selected.ProcessId)||[]};
}

export async function discoverIdeLog(profile,ports,{read=readFile,list=readdir}={}) {
  const names=(await list(join(profile,'logs'))).filter(n=>/^\d{8}T\d{6}$/.test(n)).sort().reverse();
  for(const name of names.slice(0,8)){
    let log;try{log=await read(join(profile,'logs',name,'ls-main.log'),'utf8');}catch{continue;}
    const port=[...log.matchAll(/listening on random port at (\d+) for HTTP(?:\s|$)/g)].reverse().map(m=>Number(m[1])).find(p=>ports.includes(p));
    if(port)return port;
  }
  throw Error('Waiting for the IDE local API port');
}
