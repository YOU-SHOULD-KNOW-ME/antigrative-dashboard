import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,stat,mkdir,readFile,writeFile,rename,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {SessionHistory} from '../history.mjs';

const account='a'.repeat(64),id='11111111-1111-1111-1111-111111111111';
const metrics={requests:1,rounds:1,complete:true,counts:{input:20,output:10}};
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
async function fixture(t,options){const directory=await mkdtemp(join(tmpdir(),'ag-history-owner-'));t.after(()=>rm(directory,{recursive:true,force:true}));return new SessionHistory(directory,options);}
async function absent(file){await assert.rejects(stat(file),{code:'ENOENT'});}

test('queued history writes are cancelled normally after ownership is lost',async t=>{
  const history=await fixture(t),block=deferred();t.after(()=>block.resolve());let owned=true;
  const file=history.file(account,id);history.pending.set(file,block.promise);
  const pending=history.save(account,id,metrics,{isCurrent:()=>owned});owned=false;block.resolve();
  assert.equal(await pending,null);await absent(file);assert.equal(history.pending.size,0);
});

test('ownership lost while history is loading prevents a later write',async t=>{
  const history=await fixture(t),block=deferred(),started=deferred();t.after(()=>block.resolve());let owned=true;
  history.load=async()=>{started.resolve();await block.promise;return null;};
  const pending=history.save(account,id,metrics,{isCurrent:()=>owned});await started.promise;owned=false;block.resolve();
  assert.equal(await pending,null);await absent(history.file(account,id));assert.equal(history.pending.size,0);
});

test('ownership lost during directory creation prevents temporary file writes',async t=>{
  let owned=true,writes=0;
  const history=await fixture(t,{io:{
    mkdir:async(...args)=>{await mkdir(...args);owned=false;},
    writeFile:async(...args)=>{writes++;return writeFile(...args);},
  }});
  assert.equal(await history.save(account,id,metrics,{isCurrent:()=>owned}),null);
  assert.equal(writes,0);await absent(history.file(account,id));
  assert.deepEqual(await readdir(join(history.directory,account)),[]);
});

test('ownership lost after temporary write cancels rename, preserves history and removes the temporary',async t=>{
  let owned=true,armed=false,commits=0;
  const history=await fixture(t,{io:{
    writeFile:async(...args)=>{await writeFile(...args);if(armed)owned=false;},
    rename:async(...args)=>{commits++;return rename(...args);},
  }});
  const first=await history.save(account,id,metrics);assert.ok(first);
  const file=history.file(account,id),before=await readFile(file,'utf8');armed=true;
  const result=await history.save(account,id,{...metrics,requests:2,counts:{input:40,output:30}},{isCurrent:()=>owned});
  assert.equal(result,null);assert.equal(commits,1,'only the earlier valid history was committed');
  assert.equal(await readFile(file,'utf8'),before);
  assert.deepEqual(await readdir(join(history.directory,account)),[id+'.json']);
  assert.equal(history.pending.size,0);
});

test('owned saves and replacing corrupt history retain normal behavior',async t=>{
  const history=await fixture(t),file=history.file(account,id);
  const first=await history.save(account,id,metrics,{isCurrent:()=>true});assert.ok(first);
  assert.equal((await history.load(account,id)).metrics.counts.output,10);
  await writeFile(file,'{broken');assert.equal(await history.load(account,id),null);
  const repaired=await history.save(account,id,metrics);assert.ok(repaired);
  assert.equal((await history.load(account,id)).metrics.counts.output,10);
  assert.equal(history.pending.size,0);
});

test('an I/O rejection after ownership loss is cancellation and cleans its temporary file',async t=>{
  let owned=true;
  const history=await fixture(t,{io:{writeFile:async(...args)=>{await writeFile(...args);owned=false;throw Error('late write error');}}});
  assert.equal(await history.save(account,id,metrics,{isCurrent:()=>owned}),null);
  await absent(history.file(account,id));assert.deepEqual(await readdir(join(history.directory,account)),[]);
});

test('a rename already handed to the OS is the documented commit boundary',async t=>{
  let owned=true,commits=0;
  const history=await fixture(t,{io:{rename:async(...args)=>{commits++;owned=false;return rename(...args);}}});
  const result=await history.save(account,id,metrics,{isCurrent:()=>owned});
  assert.ok(result);assert.equal(commits,1);assert.equal(owned,false);
  assert.equal((await history.load(account,id)).metrics.counts.output,10);
});
