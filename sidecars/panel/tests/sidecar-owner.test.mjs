import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SidecarOwner} from '../../../compat/sidecar-owner.mjs';
import {spawn} from 'node:child_process';

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
    const message=value=>{if(value.type===type){cleanup();resolve(value);}};
    const exit=()=>{cleanup();reject(new Error('Child exited before '+type));};
    function cleanup(){clearTimeout(timer);child.off('message',message);child.off('exit',exit);}
    child.on('message',message);child.once('exit',exit);
  });
  for(const generation of [3,1,2]){
    const code=`import {SidecarOwner} from ${JSON.stringify(moduleUrl)};
      const owner=new SidecarOwner(${JSON.stringify(data)},{startedAt:${generation}});
      process.on('message',async command=>{try{if(command==='go'){await owner.claim();process.send({type:'claimed'});}else if(command==='finish'){owner.stop();process.exit(0);}}catch{process.exit(1);}});
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
