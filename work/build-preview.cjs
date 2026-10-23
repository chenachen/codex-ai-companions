const fs=require('fs');
const path=require('path');
const sharp=require('sharp');
const root=path.resolve(__dirname,'..');
const out=path.join(root,'outputs');
const data=JSON.parse(fs.readFileSync(path.join(__dirname,'pet-data.json'),'utf8'));
const dest=path.join(out,'preview','ai-pet-room.html');
const stateIds=data.states.map(x=>x.id);
function runs(values,threshold=2,join=8){
  const found=[];let start=-1;
  for(let i=0;i<=values.length;i++){if(i<values.length&&values[i]>threshold){if(start<0)start=i;}else if(start>=0){found.push([start,i]);start=-1;}}
  const merged=[];for(const r of found){const last=merged.at(-1);if(last&&r[0]-last[1]<=join)last[1]=r[1];else merged.push(r);}
  return merged;
}
async function extract(name){
 const original=path.join(out,'assets',name+'-states.png');
 const {data:raw,info}=await sharp(original).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const W=info.width,H=info.height,C=info.channels;
 // Keep generated pixels. Remove only detached alpha specks, then detect actual transparent gutters.
 const seen=new Uint8Array(W*H),labels=new Uint16Array(W*H),queue=new Int32Array(W*H);let removed=0,componentId=0;const components=[];
 for(let p=0;p<W*H;p++){
  if(seen[p]||raw[p*C+3]<16)continue;
  let begin=0,end=1,x0=W,x1=0,y0=H,y1=0;queue[0]=p;seen[p]=1;componentId++;
  while(begin<end){const cur=queue[begin++],x=cur%W,y=Math.floor(cur/W);labels[cur]=componentId;x0=Math.min(x0,x);x1=Math.max(x1,x+1);y0=Math.min(y0,y);y1=Math.max(y1,y+1);for(let yy=Math.max(0,y-1);yy<=Math.min(H-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(W-1,x+1);xx++){const n=yy*W+xx;if(!seen[n]&&raw[n*C+3]>=16){seen[n]=1;queue[end++]=n;}}}
  if(end>=120)components.push({id:componentId,area:end,left:x0,top:y0,width:x1-x0,height:y1-y0});
  if(end<120){removed+=end;for(let j=0;j<end;j++){const i=queue[j]*C;raw[i]=raw[i+1]=raw[i+2]=raw[i+3]=0;}}
 }
 for(let p=0;p<W*H;p++)if(raw[p*C+3]<16){raw[p*C]=raw[p*C+1]=raw[p*C+2]=raw[p*C+3]=0;}
 const file=path.join(__dirname,name+'-extraction-source.png');await sharp(raw,{raw:{width:W,height:H,channels:C}}).png().toFile(file);
 if(components.length!==8)throw Error(name+': expected 8 connected complete poses, got '+JSON.stringify(components));
 components.sort((a,b)=>a.top-b.top);
 const report={original,file,width:W,height:H,rows:[],removedSpeckPixels:removed,largeComponents:components};
 const assets={};
 for(let row=0;row<2;row++){
  const boxes=components.slice(row*4,row*4+4).sort((a,b)=>a.left-b.left);
  const maxW=Math.max(...boxes.map(b=>b.width)),maxH=Math.max(...boxes.map(b=>b.height));
  const scale=Math.min(280/maxH,280/maxW);
  const cellW=Math.ceil(maxW*scale)+20,cellH=Math.ceil(maxH*scale)+20;
  const form=row===0?'normal':'chibi';
  for(let col=0;col<4;col++){
   const b=boxes[col],w=Math.round(b.width*scale),h=Math.round(b.height*scale);
   const isolated=Buffer.alloc(b.width*b.height*C);
   for(let y=0;y<b.height;y++)for(let x=0;x<b.width;x++){const source=(b.top+y)*W+b.left+x;if(labels[source]===b.id){raw.copy(isolated,(y*b.width+x)*C,source*C,source*C+C);}}
   const pose=await sharp(isolated,{raw:{width:b.width,height:b.height,channels:C}}).resize(w,h).png().toBuffer();
   const png=await sharp({create:{width:cellW,height:cellH,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:pose,left:Math.round((cellW-w)/2),top:cellH-h-10}]).png().toBuffer();
   const key=name+'-'+form+'-'+stateIds[col];
   const full=await sharp(isolated,{raw:{width:b.width,height:b.height,channels:C}}).extend({top:maxH-b.height+10,bottom:10,left:Math.floor((maxW-b.width)/2)+10,right:Math.ceil((maxW-b.width)/2)+10,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
   fs.writeFileSync(path.join(out,'assets',key+'.png'),full);
   const webp=await sharp(png).webp({quality:58,alphaQuality:85,effort:6}).toBuffer();
   assets[key]='data:image/webp;base64,'+webp.toString('base64');
  }
  report.rows.push({form,boxes,scale,canvas:[cellW,cellH]});
 }
 return {assets,report};
}
async function main(){
 const all={},reports=[];
 for(const c of data.characters){const r=await extract(c.id);Object.assign(all,r.assets);reports.push(r.report);}
 let html=fs.readFileSync(path.join(__dirname,'preview-fragment.html'),'utf8').replace('__PET_DATA__',JSON.stringify(data)).replace('__PET_ASSETS__',JSON.stringify(all));
 if(Buffer.byteLength(html)>1000000)throw Error('Inline visualization exceeds 1 MB: '+Buffer.byteLength(html));
 fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,html);
 fs.writeFileSync(path.join(__dirname,'extraction-review.json'),JSON.stringify(reports,null,2));
 fs.copyFileSync(path.join(__dirname,'pet-data.json'),path.join(out,'角色与状态文案.json'));
 console.log(JSON.stringify({fragment:dest,bytes:Buffer.byteLength(html),images:Object.keys(all).length,report:'work/extraction-review.json'},null,2));
}
main().catch(e=>{console.error(e);process.exit(1)});
