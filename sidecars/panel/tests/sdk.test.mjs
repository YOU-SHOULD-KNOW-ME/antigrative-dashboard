import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,readdir,rm,utimes} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {extractBundledSdk,validateSdkResources,loadBundledSdk} from '../sdk.mjs';
const preload='(function() {\nwindow.sidecar = {};\n})();';
const fixture=(host='BIND_HOST',declaration="const BIND_HOST = '127.0.0.1';",extra='')=>`import { execFileSync } from 'node:child_process';
import {createServer} from 'node:http';
${declaration}
export class Response { constructor(body){this.body=body;} }
export class SidecarApp {
 #token; #server;
 api(){} page(){}
 run(){const server=createServer((req,res)=>res.end('fixture'));this.#server=server.listen(0, ${host});return this.#server;}
 close(){return new Promise(resolve=>this.#server?this.#server.close(resolve):resolve());}
 verify(provided){
 ${extra}
 return provided === this.#token;
  }
}
`;
const binary=sdk=>Buffer.from('native-header\0'+sdk+'\0native-middle\0'+preload+'\0native-tail');
test('legacy constant and explicit loopback SDK bindings accept supported export structure',()=>{
 assert.equal(validateSdkResources(fixture(),preload).binding,'constant');
 assert.equal(validateSdkResources(fixture('"127.0.0.1"',''),preload).binding,'literal');
 assert.equal(validateSdkResources(fixture('LOCAL_HOST','const LOCAL_HOST = "127.0.0.1";'),preload).binding,'constant');
 const source=fixture();assert.deepEqual(extractBundledSdk(binary(source)),{sdk:source,preload});
});
test('class-name presence never bypasses wildcard, remote, omitted or mutable binding rejection',()=>{
 for(const source of [fixture('"0.0.0.0"',''),fixture('"example.com"',''),fixture('"::"',''),fixture('process.env.HOST',''),fixture('BIND_HOST',"let BIND_HOST = '127.0.0.1';"),fixture('BIND_HOST',"const BIND_HOST = '0.0.0.0';"),fixture().replace('0, BIND_HOST','0'),fixture('({host:"127.0.0.1"})','')]){
  assert.throws(()=>validateSdkResources(source,preload),/监听地址/);assert.throws(()=>extractBundledSdk(binary(source)),/监听地址/);
 }
 assert.throws(()=>validateSdkResources(fixture(),''),/校验/);
 assert.throws(()=>validateSdkResources(fixture().replace('export class Response','class Response'),preload),/校验/);
});
test('comments and string decoys cannot stand in for actual loopback network calls',()=>{
 const source=fixture('"0.0.0.0"','// const BIND_HOST = \'127.0.0.1\';\nconst note="server.listen(0, \'127.0.0.1\')";');
 assert.throws(()=>validateSdkResources(source,preload));
 assert.throws(()=>validateSdkResources(fixture().replace('this.#server=server.listen(0, BIND_HOST);','const note="server.listen(0, BIND_HOST)";'),preload));
 assert.throws(()=>validateSdkResources(fixture('BIND_HOST',"const BIND_HOST = '127.0.0.1' + '.bad';"),preload));
 assert.throws(()=>validateSdkResources(fixture('BIND_HOST',"const BIND_HOST = '127.0.0.1';",'another.listen(0,"0.0.0.0");'),preload));
});
test('incompatible/truncated native resource layouts are rejected before import',()=>{
 for(const data of [Buffer.from('export class SidecarApp'),binary(fixture()).subarray(0,40),Buffer.from(fixture()+preload).subarray(0,200)])assert.throws(()=>extractBundledSdk(data));
 assert.throws(()=>extractBundledSdk('not binary'));
});
test('bundled cache coalesces loads, validates corruption and changes generation after host updates',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'ag-sdk-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const executable=join(directory,'host.bin'),cache=join(directory,'cache');await writeFile(executable,binary(fixture()));
 const options={executable,directory:cache};
 const first=loadBundledSdk(options),second=loadBundledSdk(options);assert.equal(first,second);const sdk=await first;
 assert.equal(typeof sdk.SidecarApp,'function');assert.equal(typeof sdk.Response,'function');
 const generation=(await readdir(cache))[0];assert.deepEqual((await readdir(join(cache,generation))).sort(),['index.mjs','manifest.json','preload.js']);
 const manifest=JSON.parse(await readFile(join(cache,generation,'manifest.json'),'utf8'));assert.ok(manifest.stamp.includes('sdk-loopback-v2'));
 await writeFile(join(cache,generation,'index.mjs'),fixture('"0.0.0.0"',''));await writeFile(join(cache,generation,'preload.js'),'broken');
 const repaired=await loadBundledSdk(options);assert.equal(repaired,sdk);assert.equal(await readFile(join(cache,generation,'index.mjs'),'utf8'),fixture());
 await writeFile(executable,binary(fixture('"127.0.0.1"','')));await utimes(executable,new Date(12345),new Date(56789));
 const updated=await loadBundledSdk(options);assert.notEqual(updated,sdk);assert.equal((await readdir(cache)).length,2);
 assert.equal(await readFile(join(cache,generation,'index.mjs'),'utf8'),fixture());
});
test('an accepted SDK really binds its HTTP server to loopback and closes cleanly',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'ag-sdk-live-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 for(const inline of [false,true]){
  const executable=join(directory,inline?'modern.bin':'legacy.bin');await writeFile(executable,binary(inline?fixture('"127.0.0.1"',''):fixture()));
  const {SidecarApp}=await loadBundledSdk({executable,directory:join(directory,'cache')});const app=new SidecarApp();const server=app.run();
  await new Promise(resolve=>server.once('listening',resolve));assert.equal(server.address().address,'127.0.0.1');
  try{assert.equal(await(await fetch('http://127.0.0.1:'+server.address().port)).text(),'fixture');}finally{await app.close();}
 }
});
test('official-style SDK may omit optional close while required methods remain enforced',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'ag-sdk-optional-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const withoutClose=fixture().replace(/ close\(\)\{[^\n]+\n/,'');
 const executable=join(directory,'official.bin');await writeFile(executable,binary(withoutClose));
 const sdk=await loadBundledSdk({executable,directory:join(directory,'cache')});assert.equal(typeof sdk.SidecarApp.prototype.close,'undefined');
 for(const method of ['api','page','run']){
  const broken=join(directory,method+'.bin');await writeFile(broken,binary(withoutClose.replace(method+'()',method+'Missing()')));
  await assert.rejects(loadBundledSdk({executable:broken,directory:join(directory,'cache')}),/接口不兼容/);
 }
});
test('failed regeneration cannot replace an earlier validated SDK generation',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'ag-sdk-failure-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const executable=join(directory,'host.bin'),cache=join(directory,'cache');await writeFile(executable,binary(fixture()));
 const options={executable,directory:cache};await loadBundledSdk(options);const generation=(await readdir(cache))[0];const saved=await readFile(join(cache,generation,'index.mjs'),'utf8');
 await writeFile(executable,binary(fixture('"0.0.0.0"','')));await utimes(executable,new Date(20000),new Date(30000));
 await assert.rejects(loadBundledSdk(options),/监听地址/);assert.deepEqual(await readdir(cache),[generation]);assert.equal(await readFile(join(cache,generation,'index.mjs'),'utf8'),saved);
});
