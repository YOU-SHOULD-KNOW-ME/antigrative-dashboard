import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFile, writeFile, mkdir, stat, rename, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { installedAgentExecutable, platformPaths } from '../../compat/platform.mjs';

export async function loadSidecarSdk() {
  try { return await import('sidecar_sdk'); }
  catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    // Windows builds can supply the SDK through NODE_PATH while the ESM
    // resolver is absent. CommonJS resolution honors that path; import the
    // resolved file as ESM without changing any application files.
    try {
      const file = createRequire(import.meta.url).resolve('sidecar_sdk');
      return import(pathToFileURL(file).href);
    } catch (resolveError) {
      if (resolveError.code !== 'MODULE_NOT_FOUND') throw resolveError;
      return loadBundledSdk();
    }
  }
}

const POLICY='sdk-loopback-v2';
const hash=value=>createHash('sha256').update(value).digest('hex');
const sdkLoads=new Map();

// A small lexical reader for the installed SDK's binding expression. This is
// not a general JavaScript security sandbox: executable resources must still
// originate from the installed host. Comments/string decoys do not count as
// network bindings; unfamiliar expressions are rejected for explicit review.
function sdkTokens(source){
  const tokens=[];let i=0;
  while(i<source.length){
    const c=source[i];
    if(/\s/.test(c)){i++;continue;}
    if(source.startsWith('//',i)){const end=source.indexOf('\n',i+2);i=end<0?source.length:end+1;continue;}
    if(source.startsWith('/*',i)){const end=source.indexOf('*/',i+2);if(end<0)throw Error('SDK 资源校验失败');i=end+2;continue;}
    if(c==='"'||c==="'"||c==='`'){
      const quote=c;let text='',escaped=false,closed=false;i++;
      while(i<source.length){const ch=source[i++];if(ch===quote){closed=true;break;}if(ch==='\\'){escaped=true;if(i>=source.length)break;text+=ch+source[i++];}else text+=ch;}
      if(!closed)throw Error('SDK 资源校验失败');tokens.push({kind:quote==='`'?'template':'string',text,escaped});continue;
    }
    const word=source.slice(i).match(/^[A-Za-z_$][\w$]*/);
    if(word){tokens.push({kind:'word',text:word[0]});i+=word[0].length;continue;}
    tokens.push({kind:'punct',text:c});i++;
  }
  return tokens;
}

export function validateSdkResources(sdk,preload){
  if(typeof sdk!=='string'||typeof preload!=='string'||!preload.includes('window.sidecar ='))throw Error('SDK 资源校验失败');
  const tokens=sdkTokens(sdk),text=i=>tokens[i]?.text;
  for(const name of ['Response','SidecarApp'])if(!tokens.some((t,i)=>t.kind==='word'&&t.text==='export'&&text(i+1)==='class'&&text(i+2)===name))throw Error('SDK 资源校验失败');
  const bindings=[];
  for(let i=0;i<tokens.length;i++){
    if(tokens[i].kind!=='word'||text(i)!=='listen'||text(i-1)!=='.'||text(i+1)!=='(')continue;
    const args=[];let current=[],depth=0,end=false;
    for(let j=i+2;j<tokens.length;j++){
      const t=tokens[j];
      if(t.kind==='punct'&&t.text===')'&&depth===0){args.push(current);end=true;break;}
      if(t.kind==='punct'&&t.text===','&&depth===0){args.push(current);current=[];continue;}
      if(t.kind==='punct'&&'([{'.includes(t.text))depth++;
      if(t.kind==='punct'&&')]}'.includes(t.text))depth--;
      if(depth<0)throw Error('SDK 资源校验失败');current.push(t);
    }
    if(!end||args.length<2||args[1].length!==1)throw Error('SDK 本地监听地址无法确认');
    const host=args[1][0];
    if(host.kind==='string'&&!host.escaped&&host.text==='127.0.0.1'){bindings.push('literal');continue;}
    if(host.kind!=='word')throw Error('SDK 本地监听地址无法确认');
    const declarations=[];
    for(let k=0;k<tokens.length;k++)if(text(k+1)===host.text&&['const','let','var'].includes(text(k)))declarations.push(k);
    const k=declarations[0],literal=tokens[k+3];
    // Accept one immutable constant, not a mutable alias or an expression.
    if(declarations.length!==1||text(k)!=='const'||text(k+2)!=='='||literal?.kind!=='string'||literal.escaped||literal.text!=='127.0.0.1'||text(k+4)!==';')throw Error('SDK 本地监听地址无法确认');
    if(tokens.some((t,j)=>t.kind==='word'&&t.text===host.text&&j!==k+1&&(text(j+1)==='='||text(j+1)==='+'&&text(j+2)==='+'||text(j+1)==='-'&&text(j+2)==='-')))throw Error('SDK 本地监听地址无法确认');
    bindings.push('constant');
  }
  if(bindings.length!==1)throw Error('SDK 本地监听地址无法确认');
  return {loopback:true,binding:bindings[0]};
}

export function extractBundledSdk(binary){
  if(!Buffer.isBuffer(binary))throw Error('此版本的 Sidecar SDK 格式不兼容；请更新 SDK 适配器');
  const marker=binary.indexOf('export class SidecarApp');
  const start=binary.lastIndexOf("import { execFileSync } from 'node:child_process';",marker);
  const tail="return provided === this.#token;\n  }\n}\n";
  const tailIndex=binary.indexOf(tail,marker);
  const preloadMarker=binary.indexOf('window.sidecar =');
  const preloadStart=binary.lastIndexOf('(function() {',preloadMarker);
  const preloadTail='\n})();';const preloadEnd=binary.indexOf(preloadTail,preloadMarker);
  if(marker<0||start<0||marker-start>12000||tailIndex<marker||tailIndex-marker>24000||preloadStart<0||preloadEnd<preloadMarker||preloadEnd-preloadStart>24000)throw Error('此版本的 Sidecar SDK 格式不兼容；请更新 SDK 适配器');
  const sdk=binary.subarray(start,tailIndex+Buffer.byteLength(tail)).toString('utf8');
  const preload=binary.subarray(preloadStart,preloadEnd+Buffer.byteLength(preloadTail)).toString('utf8');
  validateSdkResources(sdk,preload);return {sdk,preload};
}

async function atomicWrite(file,data){
  const temporary=file+'.'+process.pid+'.'+randomUUID()+'.tmp';
  try{await writeFile(temporary,data,{flag:'wx',mode:0o600});await rename(temporary,file);}finally{await rm(temporary,{force:true});}
}

export function loadBundledSdk({executable=installedAgentExecutable(),directory=join(platformPaths().data,'sdk')}={}){
  const key=JSON.stringify([executable,directory]);
  if(sdkLoads.has(key))return sdkLoads.get(key);
  const pending=loadBundledNow(executable,directory).finally(()=>{if(sdkLoads.get(key)===pending)sdkLoads.delete(key);});sdkLoads.set(key,pending);return pending;
}

async function loadBundledNow(exe,directory) {
  // 2.19.1 contains the official SDK resources in language_server.exe, but some
  // Windows installations omit its ESM resolver. Recover those same installed
  // resources into private runtime storage. No SDK is downloaded or redistributed.
  const info = await stat(exe);
  const stamp=`${POLICY}:${exe}:${info.size}:${info.mtimeMs}`,root=join(directory,hash(stamp));
  let resources=null;
  try{
    const [sdk,preload,manifest]=await Promise.all([readFile(join(root,'index.mjs'),'utf8'),readFile(join(root,'preload.js'),'utf8'),readFile(join(root,'manifest.json'),'utf8')]);
    const saved=JSON.parse(manifest);
    if(saved.stamp===stamp&&saved.sdk===hash(sdk)&&saved.preload===hash(preload)){validateSdkResources(sdk,preload);resources={sdk,preload};}
  }catch{}
  if(!resources){
    resources=extractBundledSdk(await readFile(exe));
    await mkdir(root,{recursive:true});
    await atomicWrite(join(root,'index.mjs'),resources.sdk);await atomicWrite(join(root,'preload.js'),resources.preload);
    await atomicWrite(join(root,'manifest.json'),JSON.stringify({stamp,sdk:hash(resources.sdk),preload:hash(resources.preload)})+'\n');
  }
  const result=await import(pathToFileURL(join(root,'index.mjs')).href+'?v='+hash(resources.sdk+resources.preload));
  if(typeof result.SidecarApp!=='function'||typeof result.Response!=='function'||['api','page','run'].some(name=>typeof result.SidecarApp.prototype[name]!=='function'))throw Error('SDK 导出接口不兼容');
  return result;
}
