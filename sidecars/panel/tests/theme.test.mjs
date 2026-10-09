import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readHostTheme} from '../../../compat/host-theme.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const theme=createRequire(import.meta.url)('../../../compat/theme.cjs')();

test('host theme seeds are normalized and only safe theme colors cross the bridge',()=>{
  assert.deepEqual(theme.normalizeHostTheme({mode:'dark',dark:{primary:'#DA7756',background:'#262624',foregroundOverride:'#CCC',secret:'excluded'},light:{primary:'#07c'},token:'excluded'}),
    {mode:'dark',dark:{primary:'#da7756',background:'#262624',foregroundOverride:'#cccccc'},light:{primary:'#0077cc'}});
  for(const primary of ['var(--secret)','url(https://example.com)', '#ffffff00', '#abc;--bad:red',42,null,'']){
    assert.deepEqual(theme.normalizeHostTheme({mode:'unexpected',dark:{primary},light:{primary}}),{});
    assert.deepEqual(theme.normalizeHostTheme({dark:{background:primary,foregroundOverride:primary}}),{});
  }
  for(const value of [null,undefined,[],false,'bad'])assert.deepEqual(theme.normalizeHostTheme(value),{});
});

test('configuration reader returns only theme settings, reacts to file changes and never writes user config',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'ag-theme-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const file=join(dir,'config.json');
  const values={userSettings:{themeMode:'THEME_MODE_DARK',customThemeSeedsDark:{primary:'#DA7756',background:'#262624'},customThemeSeedsLight:{primary:'#007acc'},apiKey:'must-not-leak'},plugins:{other:'keep'}};
  let writes=0;
  const save=async value=>{writes++;await writeFile(file,JSON.stringify(value));};
  await save(values);
  assert.deepEqual(await readHostTheme({file}),{mode:'dark',dark:{primary:'#da7756',background:'#262624'},light:{primary:'#007acc'}});
  values.userSettings.themeMode='THEME_MODE_LIGHT';values.userSettings.customThemeSeedsLight.primary='#7b3fe4';await save(values);
  assert.deepEqual(await readHostTheme({file}),{mode:'light',dark:{primary:'#da7756',background:'#262624'},light:{primary:'#7b3fe4'}});
  const {readFile}=await import('node:fs/promises');
  assert.deepEqual(JSON.parse(await readFile(file,'utf8')),values);assert.equal(writes,2);
  await writeFile(file,'{partial');assert.deepEqual(await readHostTheme({file}),{});
  await writeFile(file,JSON.stringify({userSettings:{themeMode:'THEME_MODE_SYSTEM'}}));
  assert.deepEqual(await readHostTheme({file}),{mode:'system'});
});

test('missing, oversized and unreadable host config safely use the default palette',async()=>{
  assert.deepEqual(await readHostTheme({read:async()=>{throw Object.assign(new Error('missing'),{code:'ENOENT'});}}),{});
  assert.deepEqual(await readHostTheme({read:async()=>{throw Object.assign(new Error('denied'),{code:'EACCES'});}}),{});
  assert.deepEqual(await readHostTheme({read:async()=> ' '.repeat(1048577)}),{});
  assert.deepEqual(await readHostTheme({read:async()=> '\uFEFF'+JSON.stringify({userSettings:{customThemeSeedsDark:{primary:'#da7756'}}})}),{dark:{primary:'#da7756'}});
});
