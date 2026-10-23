const fs=require('node:fs');const path=require('node:path');const CodexClient=require('./appserver-client.cjs');
const home=process.env.CODEX_HOME||path.join(require('node:os').homedir(),'.codex'),hookFile=path.join(home,'hooks.json');
const app=path.resolve('outputs/desktop-pet');const hook=path.join(app,'hook.cjs');
const config=path.join(home,'config.toml');const backup=path.resolve('work/config-before-desktop-pet.toml');
const events=['UserPromptSubmit','PreToolUse','PostToolUse','PermissionRequest','Stop','Interrupt','SessionEnd'];
async function main(){
 fs.mkdirSync(home,{recursive:true});
 if(fs.existsSync(config)&&!fs.existsSync(backup))fs.copyFileSync(config,backup);
 let doc=fs.existsSync(hookFile)?JSON.parse(fs.readFileSync(hookFile,'utf8')):{description:'Local AI girl desktop pet lifecycle metadata bridge',hooks:{}};
 if(fs.existsSync(hookFile)&&!fs.existsSync('work/hooks-before-desktop-pet.json'))fs.copyFileSync(hookFile,'work/hooks-before-desktop-pet.json');
 doc.hooks ||= {};
 // Use forward slashes inside quoted Windows command paths, preserving every unrelated hook.
 const nodeCommand=/\s/.test(process.execPath)?'node':process.execPath.replaceAll('\\','/');
 const command=nodeCommand+' "'+hook.replaceAll('\\','/')+'"';
 for(const event of events){
   const groups=doc.hooks[event] ||= [];
   for(const g of groups)g.hooks=(g.hooks||[]).filter(h=>!String(h.command||'').replaceAll('\\','/').includes(hook.replaceAll('\\','/')));
   doc.hooks[event]=groups.filter(g=>g.hooks.length);
   const handler={type:'command',command,timeout:2};if(['PreToolUse','PostToolUse'].includes(event))handler.async=true;
   const g={hooks:[handler]};if(['PreToolUse','PostToolUse','PermissionRequest'].includes(event))g.matcher='*';doc.hooks[event].push(g);
 }
 fs.writeFileSync(hookFile,JSON.stringify(doc,null,2)+'\n');
 const c=new CodexClient();try{
  await c.init();const before=await c.request('hooks/list',{cwds:[process.cwd()]});const own=before.data.flatMap(x=>x.hooks).filter(h=>h.sourcePath.toLowerCase()===hookFile.toLowerCase()&&h.command===command);
  if(own.length!==events.length)throw new Error('Expected 7 exact hook definitions; got '+own.length);
  if(before.data.some(x=>x.errors.length))throw new Error(JSON.stringify(before.data.map(x=>x.errors)));
  // User explicitly requested installation and configuration of these reviewed local handlers.
  // Trust only Codex's hashes for our exact seven definitions, retaining all other trust settings.
  for(const h of own){await c.request('config/value/write',{keyPath:'hooks.state.'+JSON.stringify(h.key)+'.trusted_hash',value:h.currentHash,mergeStrategy:'replace'});}
  const after=await c.request('hooks/list',{cwds:[process.cwd()]});const installed=after.data.flatMap(x=>x.hooks).filter(h=>h.command===command);
  fs.writeFileSync(path.join(app,'hook-installation.json'),JSON.stringify({hookFile,installedAt:new Date().toISOString(),hooks:installed},null,2));
  if(installed.some(h=>h.trustStatus!=='trusted'||!h.enabled))throw new Error('Hook readback is not trusted and enabled');
  console.log(JSON.stringify({hookFile,installed:installed.map(h=>({event:h.eventName,enabled:h.enabled,trust:h.trustStatus})),errors:after.data.flatMap(x=>x.errors)},null,2));
 }finally{c.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
