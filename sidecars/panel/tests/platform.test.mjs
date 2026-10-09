import test from 'node:test';
import assert from 'node:assert/strict';
import { platformPaths,agentExecutables } from '../../../compat/platform.mjs';
import { parsePs,parseLsof,parseProcNet,parseNetstat,linuxPorts,discoverProcesses } from '../discovery.mjs';
import { serverFromDiscovery,AntigravityClient } from '../client.mjs';
import { createServer } from 'node:net';
import { once } from 'node:events';

test('host profile/settings paths follow native Windows, XDG and macOS conventions',()=>{
  const home='/test-user';
  const p=platformPaths({platform:'linux',home,env:{XDG_CONFIG_HOME:'/cfg',XDG_DATA_HOME:'/data'}});
  assert.match(p.profile.replaceAll('\\','/'),/^\/cfg\/Antigravity$/);
  assert.match(p.settings.replaceAll('\\','/'),/^\/data\/AntigravityPulse\/settings.json$/);
  const m=platformPaths({platform:'darwin',home,env:{}});
  assert.ok(m.profile.replaceAll('\\','/').endsWith('/Library/Application Support/Antigravity'));
  const w=platformPaths({platform:'win32',home,env:{LOCALAPPDATA:'/local',APPDATA:'/roaming'}});
  assert.ok(w.profile.replaceAll('\\','/').endsWith('/roaming/Antigravity'));
  assert.equal(platformPaths({platform:'linux',home,env:{AG_PULSE_PROFILE:'/custom'}}).profile,'/custom');
  assert.throws(()=>platformPaths({platform:'ios',home,env:{}}));
  assert.ok(agentExecutables({platform:'darwin',home,env:{},arch:'arm64'}).some(p=>p.endsWith('language_server_macos_arm64')));
});
test('macOS ps and lsof records isolate user, standalone process, PID and ports',async()=>{
  const ps=' 12 501 /Applications/Antigravity.app/Contents/Resources/bin/language_server_macos_arm64 --standalone --csrf_token=test\n 13 502 /bin/language_server --standalone\n 14 501 /bin/language_server --sidecar';
  const parsed=parsePs(ps,501);assert.equal(parsed.length,1);assert.equal(parsed[0].ProcessId,12);
  const ports=parseLsof('p12\nn127.0.0.1:1234\nn[::1]:4321\np90\nn*:9999\n');
  assert.deepEqual(ports.get(12),[1234,4321]);
  const rows=await discoverProcesses({platform:'darwin',uid:501,run:async file=>({stdout:file==='/bin/ps'?ps:'p12\nn127.0.0.1:1234\n'})});
  assert.deepEqual(serverFromDiscovery('listening on random port at 1234 for HTTP\n',rows),{port:1234,pid:12,csrf:'test'});
});
test('Linux /proc TCP parsing accepts only listening sockets with exact owned inodes',()=>{
  const rows=parseProcNet(' sl local_address rem_address st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode\n 0: 0100007F:3039 00000000:0000 0A 00000000:00000000 00:00000000 00000000 1000 0 91234\n 1: 0100007F:303A 00000000:0000 01 0 0 0 1000 0 91235');
  assert.deepEqual(rows,[{inode:'91234',port:12345}]);
});
test('native Unix listening-port discovery works without sudo', {skip:process.platform==='win32'},async t=>{
  const server=createServer();server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
  const port=server.address().port;
  if(process.platform==='linux')assert.ok((await linuxPorts(process.pid)).includes(port));
  else {
    const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');
    const {stdout}=await promisify(execFile)('/usr/sbin/lsof',['-nP','-a','-p',String(process.pid),'-iTCP','-sTCP:LISTEN','-Fpn']);
    assert.ok(parseLsof(stdout).get(process.pid).includes(port));
  }
});

test('macOS logs use Library/Logs with profile fallback; explicit log overrides stay authoritative',()=>{
  const home='/test-user',native='/test-user/Library/Logs/Antigravity/language_server.log';
  const normalize=p=>p.replaceAll('\\','/');
  const mac=platformPaths({platform:'darwin',home,env:{}});
  assert.equal(normalize(mac.log),native);
  assert.deepEqual(mac.logCandidates.map(normalize),[native,'/test-user/Library/Application Support/Antigravity/logs/language_server.log']);
  const custom=platformPaths({platform:'darwin',home,env:{AG_PULSE_PROFILE:'/custom'}});
  assert.deepEqual(custom.logCandidates.map(normalize),[native,'/custom/logs/language_server.log']);
  for(const platform of ['win32','darwin','linux']){
    const overridden=platformPaths({platform,home,env:{AG_PULSE_LOG:'/chosen.log'}});
    assert.equal(overridden.log,'/chosen.log');assert.deepEqual(overridden.logCandidates,['/chosen.log']);
    if(platform!=='darwin'){
      const defaults=platformPaths({platform,home,env:{}});
      assert.deepEqual(defaults.logCandidates,[defaults.log]);
    }
  }
});

test('discovery falls back from missing/stale logs and clears old server on failure',async()=>{
  const rows=[{ProcessId:12,CommandLine:'language_server --standalone --csrf_token=test',Ports:[1234]}];
  for(const primary of ['missing','stale','valid']){
    const reads=[];
    const client=new AntigravityClient({paths:()=>({logCandidates:['native','profile']}),processes:async()=>rows,
      readLog:async path=>{
        reads.push(path);
        if(path==='native'&&primary==='missing')throw Object.assign(new Error('missing'),{code:'ENOENT'});
        return `listening on random port at ${path==='native'&&primary==='stale'?9999:1234} for HTTP\n`;
      }});
    assert.deepEqual(await client.discover(),{port:1234,pid:12,csrf:'test'});
    assert.deepEqual(reads,primary==='valid'?['native']:['native','profile']);
    client.readLog=async()=>{throw Object.assign(new Error('missing'),{code:'ENOENT'});};
    await assert.rejects(client.discover(true),/语言服务日志/);assert.equal(client.server,null);
  }
});

test('fallback never selects a log port owned by another process or conceals read permission errors',async()=>{
  const client=new AntigravityClient({paths:()=>({logCandidates:['native','profile']}),
    processes:async()=>[{ProcessId:12,CommandLine:'language_server --standalone --csrf_token=test',Ports:[1234]}],
    readLog:async()=> 'listening on random port at 9999 for HTTP\n'});
  await assert.rejects(client.discover(),/接口启动/);assert.equal(client.server,null);
  client.readLog=async()=>{throw Object.assign(new Error('permission denied'),{code:'EACCES'});};
  await assert.rejects(client.discover(),/permission denied/);
});

test('netstat isolates exact PIDs, IPv4/IPv6 and listening TCP ports',()=>{
  const ports=parseNetstat(`
 TCP 127.0.0.1:1234 0.0.0.0:0 LISTENING 12
 TCP [::1]:4321 [::]:0 LISTENING 12
 TCP 0.0.0.0:1234 0.0.0.0:0 LISTENING 12
 TCP 127.0.0.1:9999 0.0.0.0:0 LISTENING 112
 TCP 127.0.0.1:2222 127.0.0.1:3333 ESTABLISHED 12
 UDP 127.0.0.1:4444 *:* 12
 TCP 127.0.0.1:0 0.0.0.0:0 LISTENING 12
 TCP 127.0.0.1:65536 0.0.0.0:0 LISTENING 12
 TCP 127.0.0.1:8888 0.0.0.0:0 LISTENING 0
 `);
  assert.deepEqual([...ports],[[12,[1234,4321]],[112,[9999]]]);
});

test('Windows discovers standalone candidates first and takes one hidden socket snapshot',async()=>{
  for(const json of [JSON.stringify({ProcessId:12,CommandLine:'ls --standalone'}),JSON.stringify([
    {ProcessId:12,CommandLine:'ls --standalone'},{ProcessId:112,CommandLine:'ls --standalone'},
    {ProcessId:13,CommandLine:'ls --sidecar'},{ProcessId:14,CommandLine:'ls --standalone-extra'}])]){
    const calls=[];
    const rows=await discoverProcesses({platform:'win32',run:async(file,args,options)=>{
      calls.push({file,args,options});
      return {stdout:file==='powershell.exe'?'\uFEFF'+json:' TCP 127.0.0.1:1234 0.0.0.0:0 LISTENING 12\n TCP [::]:9999 [::]:0 LISTENING 112'};
    }});
    assert.deepEqual(rows.map(r=>r.Ports),rows.length===1?[[1234]]:[[1234],[9999]]);
    assert.equal(calls.length,2);assert.equal(calls[1].file,'netstat.exe');
    assert.deepEqual(calls[1].args,['-ano','-p','tcp']);
    assert.ok(calls.every(c=>c.options.windowsHide===true));
    assert.ok(calls[0].args.at(-1).includes('Where-Object'));
    assert.equal(calls[0].args.at(-1).includes('Get-NetTCPConnection'),false);
  }
  let count=0;
  assert.deepEqual(await discoverProcesses({platform:'win32',run:async()=>{count++;return {stdout:'null'};}}),[]);
  assert.equal(count,1);
});
