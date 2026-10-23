const fs=require('node:fs'); const path=require('node:path');
const {fresh,apply,snapshot,ACTIVE}=require('./state-core.cjs');
const root=process.env.AI_PET_RUNTIME||path.join(__dirname,'runtime');
const parent=Number(process.argv[2]||0);fs.mkdirSync(path.join(root,'queue'),{recursive:true});
let model=fresh();try{const saved=JSON.parse(fs.readFileSync(path.join(root,'sessions.json'),'utf8'));if(saved.sessions)model=saved;}catch{}
const tails=new Map();const sessionHome=path.join(process.env.CODEX_HOME||path.join(require('node:os').homedir(),'.codex'),'sessions');
let tick=0, lastSerialized='';
function atomic(name,obj){const p=path.join(root,name), tmp=p+'.tmp';fs.writeFileSync(tmp,JSON.stringify(obj));try{fs.renameSync(tmp,p);}catch{try{fs.unlinkSync(tmp)}catch{}}}
function lifecycle(x, file){
  if(x.type!=='event_msg'||!['task_started','task_complete','turn_aborted','task_failed'].includes(x.payload?.type))return;
  const p=x.payload;const info=tails.get(file);if(!info?.sessionId||info.subagent)return;
  apply(model,{source:'transcript',at:Date.parse(x.timestamp),event:p.type,sessionId:info.sessionId,turnId:p.turn_id||'',transcript:file,reason:p.reason||null,cwd:info.cwd});
}
function line(l,file){try{const x=JSON.parse(l); if(x.type==='session_meta'){const v=tails.get(file);v.sessionId=x.payload.id;v.cwd=x.payload.cwd;v.subagent=!!x.payload.source?.subagent||x.payload.source==='subagent';}else lifecycle(x,file);}catch{}}
function readTail(file){
  try{const info=tails.get(file);const size=fs.statSync(file).size;if(size<info.offset){info.offset=0;info.rest=Buffer.alloc(0);}if(size===info.offset)return;
    const fd=fs.openSync(file,'r');try{while(info.offset<size){const length=Math.min(512*1024,size-info.offset);const b=Buffer.alloc(length);const n=fs.readSync(fd,b,0,length,info.offset);if(!n)break;info.offset+=n;const content=Buffer.concat([info.rest,b.subarray(0,n)]);const end=content.lastIndexOf(10);if(end<0){info.rest=content;continue;}info.rest=content.subarray(end+1);for(const l of content.subarray(0,end).toString('utf8').split('\n'))line(l,file);}}finally{fs.closeSync(fd)}
  }catch{}
}
function discover(){
  // Only local recent sessions, never read prompt/tool contents into output state.
  for(let n=0;n<3;n++){
    const d=new Date(Date.now()-n*86400000);const dir=path.join(sessionHome,String(d.getFullYear()),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0'));
    if(!fs.existsSync(dir))continue;
    for(const f of fs.readdirSync(dir)){if(!f.endsWith('.jsonl'))continue;const file=path.join(dir,f);if(!tails.has(file)){tails.set(file,{offset:0,rest:Buffer.alloc(0)});readTail(file);}}
  }
}
discover();
function run(){
  try{
    if(parent){try{process.kill(parent,0)}catch{process.exit(0)}}
    if(tick++%10===0)discover();
    for(const file of tails.keys()) readTail(file);
    const q=path.join(root,'queue');const events=[];
    for(const f of fs.readdirSync(q)){if(!f.endsWith('.json'))continue;const file=path.join(q,f);try{events.push({file,e:JSON.parse(fs.readFileSync(file,'utf8'))})}catch{}}
    events.sort((a,b)=>a.e.at-b.e.at);
    for(const {file,e} of events){apply(model,e);if(e.transcript&&!tails.has(e.transcript)&&fs.existsSync(e.transcript))tails.set(e.transcript,{offset:fs.statSync(e.transcript).size,rest:Buffer.alloc(0),sessionId:e.sessionId,cwd:e.cwd,subagent:false});fs.unlinkSync(file);}
    const value=snapshot(model);const stable=JSON.stringify({...value,updatedAt:0});
    if(stable!==lastSerialized){atomic('state.json',value);atomic('sessions.json',model);lastSerialized=stable;}
    if(tick%10===0)atomic('bridge-health.json',{pid:process.pid,parent,at:Date.now(),trackedSessions:Object.keys(model.sessions).length,hookEvents:model.hookEvents});
  }catch(e){try{fs.appendFileSync(path.join(root,'bridge-errors.log'),new Date().toISOString()+' '+e.message+'\n')}catch{}}
}
run();setInterval(run,500);
