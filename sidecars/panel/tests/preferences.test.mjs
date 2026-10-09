import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {PreferencesStore} from '../../../compat/preferences.mjs';
const create=createRequire(import.meta.url)('../../../compat/i18n.cjs');
async function fixture(t) {
  const directory=await mkdtemp(join(tmpdir(),'pulse-preferences-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const file=join(directory,'preferences.json');return {directory,file,store:new PreferencesStore({file})};
}
const connect=(language,store,extra={})=>language.connectPreferences({read:()=>store.get(),write:input=>store.set(input),...extra});

test('Chinese and English survive a new backend and a renderer with empty origin storage',async t=>{
  const {file,store}=await fixture(t);assert.deepEqual(await store.get(),{language:null,revision:0});
  const first=create(null),controller=connect(first,store);await controller.ready;await controller.toggle();
  assert.equal(first.language,'zh-CN');controller.dispose();
  const afterRestart=create(null),restored=connect(afterRestart,new PreferencesStore({file}));await restored.ready;
  assert.equal(afterRestart.language,'zh-CN');await restored.toggle();restored.dispose();
  const again=create(null);await connect(again,new PreferencesStore({file})).ready;assert.equal(again.language,'en');
  const json=JSON.parse(await readFile(file,'utf8'));assert.deepEqual(Object.keys(json).sort(),['language','revision','schema']);
});

test('existing browser choice migrates once; durable preference overrides stale browser storage',async t=>{
  const {store}=await fixture(t);const old=create('zh-CN');await connect(old,store).ready;
  assert.equal((await store.get()).language,'zh-CN');await store.set({language:'en'});
  const stale=create('zh-CN');await connect(stale,store).ready;assert.equal(stale.language,'en');
});

test('atomic rapid writes persist the final choice and reject unrecognized values/keys',async t=>{
  const {store,directory}=await fixture(t);
  const values=await Promise.all(['zh-CN','en','zh-CN'].map(language=>store.set({language})));
  assert.ok(values[0].revision<values[1].revision&&values[1].revision<values[2].revision);
  for(const input of [{language:'zh'},{language:'../../other'},{language:'en',file:'other'},null,[]])await assert.rejects(store.set(input));
  assert.equal((await store.get()).language,'zh-CN');assert.deepEqual(await readdir(directory),['preferences.json']);
});

test('invalid files surface errors; failed replacement leaves the existing target intact',async t=>{
  const {store,file,directory}=await fixture(t);await writeFile(file,'not JSON');await assert.rejects(store.get());
  assert.ok((await store.snapshot()).error);assert.equal(await readFile(file,'utf8'),'not JSON');
  await store.set({language:'zh-CN'});assert.equal((await store.get()).language,'zh-CN');
  const blocked=join(directory,'blocked.json');await mkdir(blocked);const failed=new PreferencesStore({file:blocked});
  await assert.rejects(failed.set({language:'en'}));assert.deepEqual(await readdir(blocked),[]);
  assert.equal((await readdir(directory)).some(name=>name.endsWith('.tmp')),false);
});

test('a delayed startup read and stale polling response cannot undo a newer selection',async()=>{
  let resolve;const language=create(null);const pending=new Promise(done=>resolve=done);
  const controller=language.connectPreferences({read:()=>pending,write:async()=>({language:'zh-CN',revision:20})});
  await controller.choose('zh-CN');resolve({language:'en',revision:1});await controller.ready;
  controller.sync({language:'en',revision:1});assert.equal(language.language,'zh-CN');
  controller.sync({language:'en',revision:21});assert.equal(language.language,'en');controller.dispose();
});

test('rapid renderer toggles serialize writes; failed save is visible and can be retried',async()=>{
  let saved=null,revision=0,fail=false;const writes=[];const language=create(null);
  const controller=language.connectPreferences({read:async()=>({language:saved,revision}),cache:()=>{throw new Error('Storage blocked');},write:async input=>{
    await new Promise(resolve=>setTimeout(resolve,5));if(fail)throw new Error('Disk unavailable');
    saved=input.language;writes.push(saved);return {language:saved,revision:++revision};
  }});await controller.ready;
  const first=controller.toggle(),second=controller.toggle(),third=controller.toggle();
  controller.sync({language:'en',revision:100});await Promise.all([first,second,third]);
  assert.deepEqual(writes,['zh-CN','en','zh-CN']);assert.equal(saved,'zh-CN');assert.equal(language.language,'zh-CN');
  fail=true;await controller.choose('en');assert.equal(language.language,'en');assert.equal(controller.error,true);assert.equal(saved,'zh-CN');
  controller.sync({language:saved,revision});assert.equal(language.language,'en');assert.equal(controller.error,true);
  fail=false;await controller.choose('en');assert.equal(controller.error,false);assert.equal(saved,'en');
});
