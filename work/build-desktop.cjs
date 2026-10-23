const fs=require('node:fs');const path=require('node:path');const {spawnSync}=require('node:child_process');
const dir=path.resolve('outputs/desktop-pet');const assets=path.join(dir,'assets');fs.mkdirSync(assets,{recursive:true});
for(const file of fs.readdirSync('outputs/assets'))if(/^(deepseek|gpt|claude|grok|gemini)-(normal|chibi)-(idle|working|complete|failed)\.png$/.test(file))fs.copyFileSync(path.join('outputs/assets',file),path.join(assets,file));
fs.copyFileSync('work/pet-data.json',path.join(dir,'characters.json'));
fs.writeFileSync(path.join(dir,'installation.json'),JSON.stringify({node:process.execPath,version:'1.1.0'},null,2));
const framework='C:/Windows/Microsoft.NET/Framework64/v4.0.30319';
const args=['/nologo','/target:winexe','/optimize+','/out:'+path.join(dir,'AI-Girl-Pet.exe'),'/reference:'+framework+'/WPF/PresentationCore.dll','/reference:'+framework+'/WPF/PresentationFramework.dll','/reference:'+framework+'/WPF/WindowsBase.dll','/reference:'+framework+'/System.Xaml.dll','/reference:'+framework+'/System.Web.Extensions.dll',path.join(dir,'DesktopPet.cs')];
const r=spawnSync(framework+'/csc.exe',args,{encoding:'utf8',windowsHide:true});console.log(r.stdout||r.stderr);if(r.status)process.exit(r.status);console.log(JSON.stringify({exe:path.join(dir,'AI-Girl-Pet.exe'),assets:fs.readdirSync(assets).length,node:process.execPath}));
