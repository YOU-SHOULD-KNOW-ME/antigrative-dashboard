// A newer host sidecar supersedes old instances without killing arbitrary PIDs.
import {readFile} from 'node:fs/promises';
import {mkdirSync,readFileSync,writeFileSync,renameSync,unlinkSync,statSync,watch as watchDirectory} from 'node:fs';
import {join,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
const alive=pid=>{if(!Number.isSafeInteger(pid)||pid<1)return false;try{process.kill(pid,0);return true;}catch(error){return error.code==='EPERM';}};
const valid=record=>record&&Number.isSafeInteger(record.pid)&&record.pid>0&&Number.isFinite(record.startedAt)&&typeof record.token==='string';
const newer=(a,b)=>a.startedAt>b.startedAt||a.startedAt===b.startedAt&&a.token>b.token;

export class SidecarOwner {
  constructor(data,{pid=process.pid,startedAt=Math.floor(Date.now()-process.uptime()*1000),token=randomUUID(),interval=2000,isAlive=alive}={}) {
    this.file=join(data,'active-sidecar.json');this.data=data;this.pid=pid;this.startedAt=startedAt;this.token=token;this.interval=interval;this.running=false;this.owned=false;this.generation=0;
    this.isAlive=isAlive;
  }
  async read(){return JSON.parse(await readFile(this.file,'utf8'));}
  // Collection/pagination guards are synchronous and run once per projection.
  // They must never create a Promise or read settings/ownership files.
  owns(){return this.running===true&&this.owned===true;}
  invalidate(){this.generation++;this.owned=false;this.checking=null;}
  async isOwner(){
    if(!this.running)return false;
    if(this.checking)return this.checking;
    const generation=this.generation;
    const checking=(async()=>{
      let owned=false;
      try{const owner=await this.read();owned=Boolean(valid(owner)&&owner.pid===this.pid&&owner.token===this.token);}catch{}
      if(!this.running||generation!==this.generation)return false;
      this.owned=owned;return owned;
    })();
    this.checking=checking;
    try{return await checking;}finally{if(this.checking===checking)this.checking=null;}
  }
  async claim(){
    this.stop();
    mkdirSync(this.data,{recursive:true});
    const lock=this.file+'.lock',deadline=Date.now()+5000;
    for(;;){
      try{writeFileSync(lock,JSON.stringify({pid:process.pid,token:this.token}),{flag:'wx',mode:0o600});break;}
      catch(error){
        if(error.code!=='EEXIST')throw error;
        // Recover a lock abandoned by a crashed process. A just-created partial
        // lock is allowed time to finish; a live process is never evicted.
        try{
          let record;try{record=JSON.parse(readFileSync(lock,'utf8'));}catch{}
          if(record?.pid?!alive(record.pid):Date.now()-statSync(lock).mtimeMs>10000){unlinkSync(lock);continue;}
        }catch(error){if(error.code==='ENOENT')continue;throw error;}
        if(Date.now()>deadline)throw new Error('Sidecar ownership claim timed out');
        await new Promise(resolve=>setTimeout(resolve,20));
      }
    }
    const temporary=this.file+'.'+this.token+'.tmp';
    try {
      const record={pid:this.pid,startedAt:this.startedAt,token:this.token};
      try{
        const prior=JSON.parse(readFileSync(this.file,'utf8'));
        // Serialize claims so concurrent SDK startups always select the newest.
        if(valid(prior)&&newer(prior,record)&&this.isAlive(prior.pid))return false;
      }catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}
      writeFileSync(temporary,JSON.stringify(record)+'\n',{flag:'wx',mode:0o600});
      // Windows may briefly deny replacement while another owner verifies the
      // marker. Keep atomic replacement and release the event loop before retry.
      const replaceDeadline=Date.now()+1000;
      for(;;){
        try{renameSync(temporary,this.file);break;}
        catch(error){
          if(!['EPERM','EACCES','EBUSY'].includes(error.code)||Date.now()>=replaceDeadline)throw error;
          await new Promise(resolve=>setTimeout(resolve,20));
        }
      }
    }finally{
      try{unlinkSync(temporary);}catch(error){if(error.code!=='ENOENT')throw error;}
      try{if(JSON.parse(readFileSync(lock,'utf8')).token===this.token)unlinkSync(lock);}catch(error){if(error.code!=='ENOENT')throw error;}
    }
    this.running=true;return this.isOwner();
  }
  watch(onLost){
    clearInterval(this.timer);this.watcher?.close();
    const watching=Symbol('ownership watcher');this.watching=watching;let checking=false;
    const check=async()=>{
      if(checking||!this.running||this.watching!==watching)return;checking=true;
      try{
        while(this.running&&this.watching===watching){
          const generation=this.generation,owned=await this.isOwner();
          if(!this.running||this.watching!==watching)return;
          // A marker event can invalidate a read while it is in flight. That
          // result is uncertain; verify the latest generation before shutdown.
          if(generation!==this.generation)continue;
          if(!owned){this.stop();await onLost();}return;
        }
      }finally{checking=false;}
    };
    const run=()=>void check().catch(()=>this.stop());
    const changed=()=>{if(this.watching!==watching)return;this.invalidate();run();};
    // Marker replacement invalidates hot-path guards before slow shutdown.
    // A periodic verification remains the fallback on unsupported file systems.
    try{
      this.watcher=watchDirectory(this.data,(event,file)=>{if(file===null||String(file)===basename(this.file))changed();});
      this.watcher.unref?.();this.watcher.on('error',()=>{if(this.watching!==watching)return;this.watcher?.close();this.watcher=null;changed();});
    }catch{}
    this.timer=setInterval(run,this.interval);this.timer.unref?.();run();
  }
  stop(){this.running=false;this.watching=null;this.invalidate();clearInterval(this.timer);this.watcher?.close();this.watcher=null;}
  // Retain the small ownership marker. Deleting after a check could erase a
  // newer claim racing with shutdown; a fresh instance replaces it atomically.
}
