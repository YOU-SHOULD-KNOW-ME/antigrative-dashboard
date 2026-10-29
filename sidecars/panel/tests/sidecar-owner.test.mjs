import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SidecarOwner} from '../../../compat/sidecar-owner.mjs';
import {spawn} from 'node:child_process';
import {DelegatedUsage} from '../delegated-usage.mjs';

async function fixture(t){
  const data=await mkdtemp(join(tmpdir(),'ag-owner-'));
  t.after(()=>rm(data,{recursive:true,force:true}));
  const create=(startedAt,token,extra={})=>new SidecarOwner(data,{pid:process.pid,startedAt,token,interval:10,...extra});
  return {data,create};
}
test('newer instance supersedes old instance; late old startup cannot reclaim ownership',async t=>{
  const {create}=await fixture(t),old=create(1,'old'),next=create(2,'new');
  assert.equal(await old.claim(),true);assert.equal(await next.claim(),true);
  assert.equal(await old.isOwner(),false);assert.equal(await next.isOwner(),true);
  assert.equal(await old.claim(),false);old.stop();
  assert.equal(await next.isOwner(),true);next.stop();
});
test('nonce protects reused PIDs and concurrent claims deterministically choose newest instance',async t=>{
  const {create}=await fixture(t),old=create(1,'old'),next=create(2,'new');
  await Promise.all([next.claim(),old.claim()]);
  assert.equal(await next.isOwner(),true);assert.equal(await old.isOwner(),false);
  const a=create(3,'a'),b=create(3,'b');await Promise.all([b.claim(),a.claim()]);
  assert.equal(await b.isOwner(),true);assert.equal(await a.isOwner(),false);
  for(const owner of [old,next,a,b])owner.stop();
});
test('missing/corrupt markers and dead newer PIDs recover, but permission errors fail visibly',async t=>{
  const {data,create}=await fixture(t),owner=create(1,'test',{isAlive:()=>false});
  for(const marker of ['{broken','null',JSON.stringify({pid:999999,startedAt:999,token:'dead'})]){
    await writeFile(owner.file,marker);assert.equal(await owner.claim(),true);owner.stop();
  }
  await writeFile(owner.file+'.lock',JSON.stringify({pid:99999999,token:'abandoned'}));
  assert.equal(await owner.claim(),true);owner.stop();
  const invalid=new SidecarOwner(join(data,'blocked'));
  await writeFile(join(data,'blocked'),'file');await assert.rejects(invalid.claim());
});
test('superseded watcher stops exactly once and preserves newer marker during shutdown',async t=>{
  const {create}=await fixture(t),old=create(1,'old'),next=create(2,'new');
  await old.claim();let count=0;
  const lost=new Promise(resolve=>old.watch(()=>{count++;resolve();}));
  let timer;t.after(()=>clearTimeout(timer));
  await next.claim();await Promise.race([lost,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('watch timeout')),1000);})]);
  old.stop();assert.equal(count,1);assert.equal(await next.isOwner(),true);
  assert.equal(JSON.parse(await readFile(next.file,'utf8')).token,'new');next.stop();
});

test('simultaneous claims in separate live processes retain the newest owner',async t=>{
  const {data}=await fixture(t);
  const moduleUrl=new URL('../../../compat/sidecar-owner.mjs',import.meta.url).href;
  const children=[];
  t.after(()=>{for(const child of children)child.kill();});
  const wait=(child,type)=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{cleanup();reject(new Error('Child ownership test timed out: '+type));},5000);
    const message=value=>{if(value.type==='failed'){cleanup();reject(new Error('Child ownership claim failed: '+value.code+' '+value.message));}else if(value.type===type){cleanup();resolve(value);}};
    const exit=()=>{cleanup();reject(new Error('Child exited before '+type));};
    function cleanup(){clearTimeout(timer);child.off('message',message);child.off('exit',exit);}
    child.on('message',message);child.once('exit',exit);
  });
  for(const generation of [3,1,2]){
    const code=`import {SidecarOwner} from ${JSON.stringify(moduleUrl)};
      const owner=new SidecarOwner(${JSON.stringify(data)},{startedAt:${generation}});
      process.on('message',async command=>{try{if(command==='go'){await owner.claim();process.send({type:'claimed'});}else if(command==='finish'){owner.stop();process.exit(0);}}catch(error){process.send({type:'failed',code:error.code||'',message:error.message});}});
      process.send({type:'ready'});`;
    const child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
    children.push(child);await wait(child,'ready');
  }
  const claimed=children.map(child=>wait(child,'claimed'));
  for(const child of children)child.send('go');
  await Promise.all(claimed);
  const marker=JSON.parse(await readFile(join(data,'active-sidecar.json'),'utf8'));
  assert.equal(marker.startedAt,3);assert.equal(marker.pid,children[0].pid);
  const exited=children.map(child=>new Promise(resolve=>child.once('exit',resolve)));
  for(const child of children)child.send('finish');
  await Promise.all(exited);
});

test('hot ownership guards are synchronous and perform no file reads',async t=>{
  const {create}=await fixture(t),owner=create(1,'old'),next=create(2,'new');
  t.after(()=>{owner.stop();next.stop();});
  assert.equal(owner.owns(),false);await owner.claim();assert.equal(owner.owns(),true);
  let reads=0;const read=owner.read.bind(owner);owner.read=()=>{reads++;return read();};
  for(let i=0;i<10000;i++)assert.equal(owner.owns(),true);
  assert.equal(reads,0);
  await next.claim();assert.equal(await owner.isOwner(),false);assert.equal(owner.owns(),false);
  owner.stop();assert.equal(owner.owns(),false);
});

test('concurrent boundary checks are coalesced and a late read cannot revive a stopped owner',async t=>{
  const {create}=await fixture(t),owner=create(1,'test');t.after(()=>owner.stop());
  await owner.claim();let reads=0,resolve;
  owner.read=()=>{reads++;return new Promise(done=>{resolve=done;});};
  const pending=Array.from({length:100},()=>owner.isOwner());assert.equal(reads,1);
  owner.stop();resolve({pid:owner.pid,token:owner.token,startedAt:owner.startedAt});
  assert.deepEqual(await Promise.all(pending),Array(100).fill(false));assert.equal(owner.owns(),false);
});

test('invalid ownership markers fail closed with a boolean guard',async t=>{
  const {create}=await fixture(t),owner=create(1,'test');t.after(()=>owner.stop());
  for(const marker of ['null','{bad','{}']){
    await owner.claim();await writeFile(owner.file,marker);
    assert.equal(await owner.isOwner(),false);assert.equal(owner.owns(),false);
  }
});

test('marker events during verification recheck the latest generation without false shutdown',async t=>{
  const {create}=await fixture(t),owner=create(1,'test',{interval:60000});t.after(()=>owner.stop());
  await owner.claim();const record=await owner.read(),read=owner.read.bind(owner);let resolve,reads=0,lost=0;
  owner.read=()=>++reads===1?new Promise(done=>{resolve=done;}):read();
  owner.watch(()=>{lost++;});assert.equal(reads,1,'watch verifies immediately');
  t.after(()=>resolve?.(record));await writeFile(owner.file,JSON.stringify(record));
  const until=async predicate=>{const deadline=Date.now()+2000;while(!predicate()){if(Date.now()>deadline)throw Error('marker notification timeout');await new Promise(done=>setTimeout(done,5));}};
  await until(()=>owner.owns()===false);resolve(record);
  await until(()=>owner.owns()===true);
  assert.ok(reads>=2);assert.equal(lost,0);assert.equal(owner.running,true);
});

test('ownership marker notifications stop collection before the polling fallback',async t=>{
  const {create}=await fixture(t),old=create(1,'old',{interval:60000}),next=create(2,'new');
  t.after(()=>{old.stop();next.stop();});
  await old.claim();let timer;
  const lost=new Promise(resolve=>old.watch(resolve));
  t.after(()=>clearTimeout(timer));await next.claim();
  await Promise.race([lost,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('ownership notification timeout')),2000);})]);
  assert.equal(old.owns(),false);assert.equal(next.owns(),true);
});

test('real ownership handover discards a pending delegated result before writes',async t=>{
  const {create}=await fixture(t),old=create(1,'old'),next=create(2,'new');
  t.after(()=>{old.stop();next.stop();});await old.claim();
  const parent='11111111-1111-1111-1111-111111111111',child='22222222-2222-2222-2222-222222222222';
  let resolve,start,sources=0,updates=0;
  const pending=new Promise(done=>{resolve=done;}),started=new Promise(done=>{start=done;});
  const tracker=new DelegatedUsage({trajectory:async()=>{start();return pending;}},{owns:()=>old.owns(),onSource:()=>{sources++;},onUpdate:()=>{updates++;}});
  t.after(()=>{resolve({trajectory:{steps:[{}],generatorMetadata:[]}});tracker.dispose();});
  tracker.request('a'.repeat(64),parent,{trajectory:{steps:[],generatorMetadata:[]}},{knownIds:[child]});
  await started;await next.claim();await old.isOwner();
  resolve({trajectory:{steps:[{}],generatorMetadata:[]}});await tracker.idle();
  assert.equal(sources,0);assert.equal(updates,0);assert.equal(tracker.tasks.get(parent).sources.has(child),false);
});
