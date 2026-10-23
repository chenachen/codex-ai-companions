const path=require('node:path');const {spawnSync}=require('node:child_process');
const framework='C:/Windows/Microsoft.NET/Framework64/v4.0.30319';
const refs=['WPF/PresentationCore.dll','WPF/PresentationFramework.dll','WPF/WindowsBase.dll','System.Xaml.dll','System.Web.Extensions.dll'].map(p=>'/reference:'+framework+'/'+p);
const r=spawnSync(framework+'/csc.exe',['/nologo','/target:exe','/main:CaptionDeckCheck','/out:'+path.resolve('work/CaptionDeckCheck.exe'),...refs,path.resolve('work/CaptionDeckCheck.cs'),path.resolve('outputs/desktop-pet/DesktopPet.cs')],{encoding:'utf8',windowsHide:true});
if(r.status)throw new Error(r.stdout+r.stderr);
const test=spawnSync(path.resolve('work/CaptionDeckCheck.exe'),[path.resolve('work/pet-data.json')],{encoding:'utf8',windowsHide:true});
console.log(test.stdout+test.stderr);if(test.status)process.exit(test.status);
