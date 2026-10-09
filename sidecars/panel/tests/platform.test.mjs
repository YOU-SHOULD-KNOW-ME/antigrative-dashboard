import test from 'node:test';
import assert from 'node:assert/strict';
import { platformPaths,agentExecutables } from '../../../compat/platform.mjs';
import { parsePs,parseLsof,parseProcNet,linuxPorts,discoverProcesses } from '../discovery.mjs';
import { serverFromDiscovery } from '../client.mjs';
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
