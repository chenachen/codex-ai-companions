const path=require('node:path');const {spawn,spawnSync}=require('node:child_process');
const folder=path.resolve('outputs/desktop-pet'),exe=path.join(folder,'AI-Girl-Pet.exe');
const psQuote=x=>"'"+x.replaceAll("'","''")+"'";
const cmd="$p=[Environment]::GetFolderPath('Desktop'); $s=New-Object -ComObject WScript.Shell; $l=$s.CreateShortcut([IO.Path]::Combine($p,'AI 娘桌宠.lnk')); $l.TargetPath="+psQuote(exe)+"; $l.WorkingDirectory="+psQuote(folder)+"; $l.Description='AI companions with Codex Hooks'; $l.Save(); Write-Output ([IO.Path]::Combine($p,'AI 娘桌宠.lnk'))";
const shortcut=spawnSync('powershell.exe',['-NoProfile','-Command',cmd],{encoding:'utf8',windowsHide:true});if(shortcut.status!==0)throw new Error(shortcut.stderr);
const child=spawn(exe,[],{cwd:folder,detached:true,stdio:'ignore'});child.unref();console.log(JSON.stringify({pid:child.pid,shortcut:shortcut.stdout.trim(),exe}));
