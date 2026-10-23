const {spawn}=require('node:child_process');
const readline=require('node:readline');
const fs=require('node:fs');
const path=require('node:path');
function resolveCodex(){
  if(process.env.CODEX_CLI_PATH)return process.env.CODEX_CLI_PATH;
  const base=path.join(process.env.LOCALAPPDATA||path.join(require('node:os').homedir(),'AppData','Local'),'OpenAI','Codex','bin');
  if(fs.existsSync(base)){
    const choices=fs.readdirSync(base).map(x=>path.join(base,x,'codex.exe')).filter(x=>fs.existsSync(x)).sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs);
    if(choices.length)return choices[0];
  }
  return 'codex';
}
class CodexClient {
  constructor(cwd=process.cwd()) {
    this.proc=spawn(resolveCodex(),['app-server','--listen','stdio://'],{cwd,windowsHide:true,stdio:['pipe','pipe','pipe']});
    this.seq=0;this.pending=new Map();this.stderr='';
    this.proc.stderr.on('data',d=>{this.stderr+=d.toString()});
    readline.createInterface({input:this.proc.stdout}).on('line',l=>{try{const m=JSON.parse(l);if(m.id!=null&&this.pending.has(m.id)){const p=this.pending.get(m.id);this.pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}else if(this.onNotification)this.onNotification(m);}catch{}});
  }
  request(method,params={}){return new Promise((resolve,reject)=>{const id=++this.seq;const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Timeout: '+method));},20000);this.pending.set(id,{resolve,reject,timer});this.proc.stdin.write(JSON.stringify({id,method,params})+'\n');});}
  async init(){const result=await this.request('initialize',{clientInfo:{name:'ai_pet_setup',title:'AI Pet Setup',version:'1.0.0'},capabilities:{experimentalApi:true}});this.proc.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n');return result;}
  close(){this.proc.stdin.end();this.proc.kill();}
}
module.exports=CodexClient;
if(require.main===module)(async()=>{const c=new CodexClient();try{await c.init();const x=await c.request('hooks/list',{cwds:[process.cwd()]});require('node:fs').writeFileSync('work/hooks-inventory.json',JSON.stringify(x,null,2));console.log(JSON.stringify(x));}finally{c.close();}})().catch(e=>{console.error(e.message);process.exitCode=1});
