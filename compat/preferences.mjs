// App-independent preferences: no renderer origin, account or conversation data.
import { readFile, mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { platformPaths } from './platform.mjs';

export function validateLanguage(value) {
  if (value!=='en'&&value!=='zh-CN') throw new Error('Invalid language preference');
  return value;
}

export class PreferencesStore {
  constructor({file=join(dirname(platformPaths().settings),'preferences.json')}={}) {
    this.file=file;this.queue=Promise.resolve();
  }
  async get() {
    await this.queue;
    try {
      const value=JSON.parse((await readFile(this.file,'utf8')).replace(/^\uFEFF/,''));
      if(value.schema!==1)throw new Error('Invalid preferences schema');
      return {language:value.language===null?null:validateLanguage(value.language),languageGuideDismissed:value.languageGuideDismissed===true,revision:Number.isSafeInteger(value.revision)&&value.revision>=0?value.revision:0};
    } catch(error) {
      if(error.code==='ENOENT')return {language:null,languageGuideDismissed:false,revision:0};
      throw new Error('Language preference could not be read');
    }
  }
  async set(input) {
    if(!input||typeof input!=='object'||Array.isArray(input)||!Object.keys(input).length||Object.keys(input).some(key=>!['language','languageGuideDismissed'].includes(key)))throw new Error('Invalid preferences request');
    if(Object.hasOwn(input,'language'))validateLanguage(input.language);
    if(Object.hasOwn(input,'languageGuideDismissed')&&input.languageGuideDismissed!==true)throw new Error('Invalid guide preference');
    const operation=this.queue.then(async()=>{
      await mkdir(dirname(this.file),{recursive:true});
      let prior=0,previous={language:null,languageGuideDismissed:false};
      try {const value=JSON.parse((await readFile(this.file,'utf8')).replace(/^\uFEFF/,''));if(Number.isSafeInteger(value.revision))prior=value.revision;previous={language:['en','zh-CN'].includes(value.language)?value.language:null,languageGuideDismissed:value.languageGuideDismissed===true};}catch{}
      const language=Object.hasOwn(input,'language')?input.language:previous.language;
      const languageGuideDismissed=previous.languageGuideDismissed||Object.hasOwn(input,'language')||input.languageGuideDismissed===true;
      const revision=Math.max(Date.now(),prior+1);
      const temporary=this.file+'.'+process.pid+'.'+randomUUID()+'.tmp';
      try {
        const handle=await open(temporary,'wx',0o600);
        try {await handle.writeFile(JSON.stringify({schema:1,language,languageGuideDismissed,revision})+'\n','utf8');await handle.sync();}
        finally {await handle.close();}
        await rename(temporary,this.file);
      } finally {await rm(temporary,{force:true});}
      return {language,languageGuideDismissed,revision};
    });
    this.queue=operation.catch(()=>{});
    return operation;
  }
  async snapshot() {
    try {return await this.get();}catch{return {error:'Language preference could not be read'};}
  }
}
