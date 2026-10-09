// A newer host sidecar supersedes old instances without killing arbitrary PIDs.
import {readFile} from 'node:fs/promises';
import {mkdirSync,readFileSync,writeFileSync,renameSync,unlinkSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
const alive=pid=>{if(!Number.isSafeInteger(pid)||pid<1)return false;try{process.kill(pid,0);return true;}catch(error){return error.code==='EPERM';}};
const valid=record=>record&&Number.isSafeInteger(record.pid)&&record.pid>0&&Number.isFinite(record.startedAt)&&typeof record.token==='string';
const newer=(a,b)=>a.startedAt>b.startedAt||a.startedAt===b.startedAt&&a.token>b.token;

export class SidecarOwner {
  constructor(data,{pid=process.pid,startedAt=Math.floor(Date.now()-process.uptime()*1000),token=randomUUID(),interval=2000,isAlive=alive}={}) {
    this.file=join(data,'active-sidecar.json');this.data=data;this.pid=pid;this.startedAt=startedAt;this.token=token;this.interval=interval;this.running=false;
    this.isAlive=isAlive;
  }
  async read(){return JSON.parse(await readFile(this.file,'utf8'));}
  async isOwner(){
    if(!this.running)return false;
    try{const owner=await this.read();return owner.pid===this.pid&&owner.token===this.token;}catch{return false;}
  }
  async claim(){
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
      renameSync(temporary,this.file);
    }finally{
      try{unlinkSync(temporary);}catch(error){if(error.code!=='ENOENT')throw error;}
      try{if(JSON.parse(readFileSync(lock,'utf8')).token===this.token)unlinkSync(lock);}catch(error){if(error.code!=='ENOENT')throw error;}
    }
    this.running=true;return this.isOwner();
  }
  watch(onLost){
    let checking=false;
    this.timer=setInterval(async()=>{
      if(checking||!this.running)return;checking=true;
      try{if(!await this.isOwner()){this.stop();await onLost();}}finally{checking=false;}
    },this.interval);this.timer.unref?.();
  }
  stop(){this.running=false;clearInterval(this.timer);}
  // Retain the small ownership marker. Deleting after a check could erase a
  // newer claim racing with shutdown; a fresh instance replaces it atomically.
}
