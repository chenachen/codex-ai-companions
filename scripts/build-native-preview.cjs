#!/usr/bin/env node
'use strict';
// Review exact native atlases. No interpolation, body transforms or separate blink clock.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'pets');
const SLUGS = ['gpt-normal','gpt-chibi','claude-normal','claude-chibi','gemini-normal','gemini-chibi','deepseek-normal','deepseek-chibi','grok-normal','grok-chibi'];
const STATES = [
  {key:'idle', label:'活跃待机', row:0, ms:[1680,660,660,840,840,1920]},
  {key:'right', label:'向右移动', row:1, ms:[120,120,120,120,120,120,120,220]},
  {key:'left', label:'向左移动', row:2, ms:[120,120,120,120,120,120,120,220]},
  {key:'wave', label:'打招呼', row:3, ms:[140,140,140,280]},
  {key:'jump', label:'跳跃', row:4, ms:[140,140,140,140,280]},
  {key:'failed', label:'出错', row:5, ms:[140,140,140,140,140,140,140,240]},
  {key:'waiting', label:'等待', row:6, ms:[150,150,150,150,150,260]},
  {key:'working', label:'工作', row:7, ms:[120,120,120,120,120,220]},
  {key:'review', label:'检查', row:8, ms:[150,150,150,150,150,280]}
];
const ACTIONS = {
 'gpt-normal':['展翼招手','羽毛笔写卷轴'], 'gpt-chibi':['抱星招手','小锤修星'],
 'claude-normal':['抱书招手','持书批注'], 'claude-chibi':['举章招呼','认真盖章'],
 'gemini-normal':['猫爪招手','拨动星盘'], 'gemini-chibi':['掌间传星','揉合双星'],
 'deepseek-normal':['举杯招呼','搅拌饮料'], 'deepseek-chibi':['摸尾巴招手','尾巴按回车'],
 'grok-normal':['扳手招呼','调校火箭'], 'grok-chibi':['抱盒招手','拧发条拍盒']
};
function frameAt(state, time) {
 const total=state.ms.reduce((a,b)=>a+b,0); let t=((time%total)+total)%total;
 for(let col=0;col<state.ms.length;col++){if(t<state.ms[col])return {row:state.row,col,state:state.key,label:state.label,total};t-=state.ms[col];}
 throw new Error('Invalid state timeline');
}
function sample(mode, time, states) {
 const get=key=>states.find(s=>s.key===key);
 if(mode==='sequence')return time<2460?frameAt(get('working'),time):frameAt(get('idle'),time-2460);
 if(mode==='transition'){
  let t=time%14040;
  return t<6600?frameAt(get('idle'),t):t<7440?frameAt(get('jump'),t-6600):frameAt(get('idle'),t-7440);
 }
 if(mode==='look'){const col=Math.floor(time/200)%16;return {row:9+Math.floor(col/8),col:col%8,state:'look',label:'注视 '+(col*22.5)+'°',total:3200};}
 if(mode==='all'){
  let t=time%states.reduce((sum,s)=>sum+s.ms.reduce((a,b)=>a+b,0),0);
  for(const s of states){const duration=s.ms.reduce((a,b)=>a+b,0);if(t<duration)return frameAt(s,t);t-=duration;}
 }
 return frameAt(get(mode),time);
}
function collection() {
 return SLUGS.map(slug=>{
  const folder=path.join(DIR,slug), file=path.join(folder,'spritesheet.png');
  const bytes=fs.readFileSync(file), sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)!==1536||bytes.readUInt32BE(20)!==2288)throw new Error('Wrong native PNG: '+slug);
  if(bytes.length>20*1024*1024)throw new Error('Oversized native PNG: '+slug);
  const identity=JSON.parse(fs.readFileSync(path.join(folder,'pet.json'),'utf8'));
  return {slug,label:identity.displayName,form:slug.endsWith('chibi')?'chibi':'normal',file:slug+'/spritesheet.png',sha256,bytes:bytes.length,actions:ACTIONS[slug]};
 });
}
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function page(pets,prefix) {
 return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>十只 Pet · 原生动作</title><style>
 :root{color-scheme:light;--bg:#f3f4ef;--ink:#25372e;--line:#d9e1d6;--muted:#697b6e;--stage:#f8f9f4}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif}main{max-width:1320px;margin:auto;padding:32px 24px}h1{font-size:34px;letter-spacing:-.04em;margin:10px 0}header p,.note{font-size:13px;color:var(--muted);line-height:1.8}.eyebrow{font-size:11px;letter-spacing:.13em;color:#476b55}.toolbar{display:flex;gap:9px;flex-wrap:wrap;align-items:center;margin:24px 0 12px}button,select{font:inherit;font-size:12px;background:#fff;border:1px solid var(--line);border-radius:8px;padding:10px;color:var(--ink);cursor:pointer}button[aria-pressed=true]{background:#315940;color:#fff}button:focus-visible,select:focus-visible{outline:3px solid #94b9a0;outline-offset:2px}.filter{margin-left:auto;display:flex;gap:5px}.grid{display:grid;grid-template-columns:repeat(5,minmax(210px,1fr));gap:14px}.pet{background:#fffefb;border:1px solid var(--line);border-radius:13px;overflow:hidden}.pet[hidden]{display:none}.head{padding:16px 14px 0;display:flex;justify-content:space-between;gap:5px;align-items:center}.head h2{font-size:14px;margin:0}.tag{font-size:10px;color:var(--muted)}.stage{width:192px;height:208px;margin:14px auto 0;background:var(--stage);position:relative;border-radius:8px}.stage canvas{display:block;width:192px;height:208px}.loading{position:absolute;inset:0;display:grid;place-items:center;font-size:12px;color:var(--muted)}.loading[hidden]{display:none}.copy{padding:12px 16px 16px;font-size:12px;line-height:1.8}.action{font-weight:600}.frame{font-size:10px;color:var(--muted)}a{color:#3d6a4c}.links{font-size:10px;margin-top:6px}.dark{--stage:#202724}.zoom .stage{width:384px;height:416px}.zoom canvas{width:384px;height:416px;image-rendering:pixelated}.zoom .grid{grid-template-columns:repeat(auto-fit,minmax(410px,1fr))}.status{font-size:12px;color:var(--muted);min-height:28px}footer{margin-top:25px;font-size:11px;line-height:1.8;color:var(--muted)}@media(max-width:1160px){.grid{grid-template-columns:repeat(4,minmax(210px,1fr))}}@media(max-width:940px){.grid{grid-template-columns:repeat(3,minmax(210px,1fr))}}@media(max-width:710px){.grid{grid-template-columns:repeat(2,minmax(200px,1fr))}.filter{margin-left:0}}@media(max-width:460px){main{padding:24px 12px}.grid{grid-template-columns:1fr}.pet{max-width:310px;width:100%;justify-self:center}.zoom .grid{grid-template-columns:1fr}.zoom .pet{max-width:410px;overflow:auto}}
 </style></head><body><main><header><div class="eyebrow">AI COMPANIONS · NATIVE MOTION</div><h1>十只 Pet，各有拿手好戏。</h1><p>统一站姿尺度，保留各自头身比例。这里直接播放最终 PNG 中的动作格。</p></header>
 <div class="toolbar"><select id="mode" aria-label="动作状态"><option value="sequence">工作三轮 → 待机</option><option value="idle">活跃待机</option><option value="working">工作循环</option><option value="transition">待机 → 跳跃 → 待机</option><option value="all">九种状态依次展示</option><option value="look">16 个注视方向</option>${STATES.filter(s=>!['idle','working'].includes(s.key)).map(s=>'<option value="'+s.key+'">'+s.label+'</option>').join('')}</select><button id="play">暂停</button><button id="restart">重播</button><button id="background" aria-pressed="false">深色背景</button><button id="zoom" aria-pressed="false">2× 像素细节</button><div class="filter">${[['all','全部'],['normal','正常版'],['chibi','Q版']].map(([key,label])=>'<button data-form="'+key+'" aria-pressed="'+(key==='all')+'">'+label+'</button>').join('')}</div></div><div class="status" id="status" role="status"></div>
 <div class="grid">${pets.map(p=>`<article class="pet" id="card-${p.slug}"><div class="head"><h2>${esc(p.label)}</h2><span class="tag">${p.form==='normal'?'正常版':'Q版'}</span></div><div class="stage"><canvas id="canvas-${p.slug}" width="192" height="208" aria-label="${esc(p.label)}原生动作"></canvas><span class="loading" id="load-${p.slug}">加载画面…</span></div><div class="copy"><div class="action" id="action-${p.slug}"></div><div class="frame" id="frame-${p.slug}"></div><div class="links"><a href="${prefix+p.file}">完整 PNG 图集</a></div></div></article>`).join('')}</div>
 <footer>每格 192×208 · 每只完整 73 格 · 工作 0.82 秒一轮，三轮后回待机；待机 6.6 秒一轮。<br>预览按已核对的原生时序切格；注视方向按顺序展示，实际由客户端交互控制。2× 模式只放大像素以检查边缘。</footer></main><script>
 'use strict';
 const PETS=${JSON.stringify(pets).replace(/</g,'\\u003c')},STATES=${JSON.stringify(STATES)},PREFIX=${JSON.stringify(prefix)};
 ${frameAt.toString()}
 ${sample.toString()}
 const byId=id=>document.getElementById(id);
 let mode='sequence',playing=!matchMedia('(prefers-reduced-motion: reduce)').matches,elapsed=0,last=null,raf=null,form='all';
 const views=PETS.map(p=>{const image=new Image(),v={p,image,ready:false,key:null,visible:true,card:byId('card-'+p.slug),ctx:byId('canvas-'+p.slug).getContext('2d')};image.onload=()=>{v.ready=image.naturalWidth===1536&&image.naturalHeight===2288;byId('load-'+p.slug).hidden=v.ready;if(!v.ready)byId('load-'+p.slug).textContent='图集规格不符';render();};image.onerror=()=>byId('load-'+p.slug).textContent='画面加载失败';image.src=PREFIX+p.file+'?v='+p.sha256.slice(0,12);return v;});
 function render(){const f=sample(mode,elapsed,STATES);for(const v of views){if(!v.ready||v.card.hidden||!v.visible)continue;const key=f.row+':'+f.col;if(key!==v.key){v.ctx.clearRect(0,0,192,208);v.ctx.drawImage(v.image,f.col*192,f.row*208,192,208,0,0,192,208);v.key=key;}byId('action-'+v.p.slug).textContent=f.state==='idle'?v.p.actions[0]:f.state==='working'?v.p.actions[1]:f.label;byId('frame-'+v.p.slug).textContent=f.label+' · 第 '+(f.state==='look'?(f.row-9)*8+f.col+1:f.col+1)+' 格';}}
 function stop(){if(raf!==null)cancelAnimationFrame(raf);raf=null;last=null;}
 function schedule(){if(playing&&!document.hidden&&raf===null)raf=requestAnimationFrame(tick);}
 function tick(now){raf=null;if(!playing||document.hidden){last=null;return;}if(last!==null)elapsed+=now-last;last=now;render();schedule();}
 function controls(){byId('play').textContent=playing?'暂停':'播放';byId('status').textContent=(playing?'':'已暂停 · ')+views.filter(v=>!v.card.hidden).length+' 个形象 · '+byId('mode').selectedOptions[0].textContent;}
 byId('mode').addEventListener('change',()=>{mode=byId('mode').value;elapsed=0;stop();render();controls();schedule();});
 byId('play').addEventListener('click',()=>{playing=!playing;stop();controls();schedule();});
 byId('restart').addEventListener('click',()=>{elapsed=0;playing=true;stop();render();controls();schedule();});
 byId('background').addEventListener('click',()=>{const on=document.body.classList.toggle('dark');byId('background').setAttribute('aria-pressed',String(on));});
 byId('zoom').addEventListener('click',()=>{const on=document.body.classList.toggle('zoom');byId('zoom').setAttribute('aria-pressed',String(on));});
 document.querySelectorAll('[data-form]').forEach(b=>b.addEventListener('click',()=>{form=b.dataset.form;views.forEach(v=>v.card.hidden=form!=='all'&&v.p.form!==form);document.querySelectorAll('[data-form]').forEach(a=>a.setAttribute('aria-pressed',String(a===b)));render();controls();}));
 document.addEventListener('visibilitychange',()=>{stop();if(!document.hidden){render();schedule();}});
 if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{for(const e of entries)views.find(v=>v.card===e.target).visible=e.isIntersecting;render();},{rootMargin:'150px'});views.forEach(v=>observer.observe(v.card));}
 controls();render();schedule();
 </script></body></html>`;
}
function build(){
 const pets=collection();
 const destination=path.join(ROOT,'outputs/preview/native-pets.html');
 fs.mkdirSync(path.dirname(destination),{recursive:true});
 fs.writeFileSync(destination,page(pets,'../../pets/'));
 console.log('Built native preview for '+pets.length+' pets: '+destination);
}
module.exports={STATES,SLUGS,frameAt,sample,page,collection,build};
if(require.main===module)build();
