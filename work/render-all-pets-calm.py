"""Render all ten current motion-v2 atlases at native size; never substitute old assets."""
from __future__ import annotations
import hashlib, json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageSequence

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT/'outputs/pet-motion-v3'
ROLES = [('gpt','GPT'),('claude','Claude'),('gemini','Gemini'),('deepseek','DeepSeek'),('grok','Grok')]
PETS = [(f'{role}-{kind}',label,kind) for kind in ('normal','chibi') for role,label in ROLES]
IDLE = [1680,660,660,840,840,1920]
WORK = [120,120,120,120,120,220]
CELL = (192,208)
MARGIN = 20
GAP = 16
TILE_W,TILE_H = 216,252
HEADER = 100
FOOTER = 42
WIDTH = MARGIN*2+TILE_W*5+GAP*4
HEIGHT = HEADER+TILE_H*2+GAP+FOOTER
BG = (243,244,247)
INK = (38,44,55)

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def font(size,bold=False):
    file=Path('C:/Windows/Fonts/msyhbd.ttc' if bold else 'C:/Windows/Fonts/msyh.ttc')
    if not file.is_file():raise FileNotFoundError('Chinese label font unavailable: '+str(file))
    return ImageFont.truetype(str(file),size)

def text_center(draw,text,x,y,width,chosen,fill=INK):
    box=draw.textbbox((0,0),text,font=chosen)
    draw.text((x+(width-(box[2]-box[0]))/2,y),text,font=chosen,fill=fill)

def load_sources():
    missing=[str(OUTPUT/pet/'spritesheet.png') for pet,_,_ in PETS if not (OUTPUT/pet/'spritesheet.png').is_file()]
    if missing:raise RuntimeError('All ten NEW motion-v2 sheets are required. Missing:\n'+'\n'.join(missing))
    loaded=[];records=[]
    for pet,label,kind in PETS:
        path=OUTPUT/pet/'spritesheet.png'
        with Image.open(path) as opened:atlas=opened.convert('RGBA')
        if atlas.size!=(1536,2288):raise ValueError(f'{pet}: expected native v2 dimensions')
        quality_path=OUTPUT/pet/'pet-quality.json'
        if not quality_path.is_file():raise FileNotFoundError(f'{pet}: quality report missing')
        quality=json.loads(quality_path.read_text(encoding='utf-8-sig'))
        digest=sha(path)
        if quality.get('ok') is not True or quality.get('sha256')!=digest:
            raise ValueError(f'{pet}: exact encoded sheet does not have a passing quality report')
        for row in (0,7):
            for col in range(6):
                if atlas.crop((col*192,row*208,(col+1)*192,(row+1)*208)).getchannel('A').getbbox() is None:
                    raise ValueError(f'{pet}: empty required motion frame r{row}c{col}')
        loaded.append((pet,label,kind,atlas))
        records.append({'pet':pet,'name':label,'form':'正常版' if kind=='normal' else 'Q版','file':str(path),'sha256':digest,'bytes':path.stat().st_size,'quality_report':str(quality_path)})
    return loaded,records

def render_frame(loaded,row,column,time_ms,title,subtitle):
    canvas=Image.new('RGB',(WIDTH,HEIGHT),BG);draw=ImageDraw.Draw(canvas)
    text_center(draw,title,0,15,WIDTH,font(24,True))
    text_center(draw,subtitle,0,53,WIDTH,font(15),fill=(79,87,101))
    for index,(pet,label,kind,atlas) in enumerate(loaded):
        gridrow=index//5;gridcol=index%5
        x=MARGIN+gridcol*(TILE_W+GAP);y=HEADER+gridrow*(TILE_H+GAP)
        draw.rounded_rectangle((x,y,x+TILE_W-1,y+TILE_H-1),radius=8,fill=(252,252,253),outline=(218,222,229),width=1)
        text_center(draw,f'{label} · {"正常版" if kind=="normal" else "Q版"}',x,y+8,TILE_W,font(16,True))
        sprite=atlas.crop((column*192,row*208,(column+1)*192,(row+1)*208))
        canvas.paste(sprite,(x+(TILE_W-192)//2,y+36),sprite)
    draw.text((MARGIN,HEIGHT-30),f'原生单格 192×208 · 无缩放 · 当前帧 {column+1}/6 · t={time_ms/1000:.2f}s',font=font(14),fill=(79,87,101))
    return canvas

def save_gif(frames,durations,path,loop):
    options=dict(save_all=True,append_images=frames[1:],duration=durations,disposal=2,optimize=False)
    if loop is not None:options['loop']=loop
    frames[0].save(path,**options)
    with Image.open(path) as gif:
        actual=[frame.info.get('duration',0) for frame in ImageSequence.Iterator(gif)]
        observed_loop=gif.info.get('loop')
        decoded_frames=gif.n_frames
        size=gif.size
    if actual!=durations:raise ValueError(f'{path.name}: encoded GIF frame timings changed: {actual}')
    if observed_loop!=loop:raise ValueError(f'{path.name}: encoded GIF loop differs from requested loop')
    return {'file':str(path),'sha256':sha(path),'bytes':path.stat().st_size,'size':list(size),'frames':decoded_frames,'durations_ms':actual,'total_ms':sum(actual),'gif_loop':observed_loop}

def main():
    loaded,sources=load_sources()
    idle_frames=[];idle_timeline=[];elapsed=0
    for column,duration in enumerate(IDLE):
        idle_frames.append(render_frame(loaded,0,column,elapsed,'10 只宠物 · 原生待机','正常版在上，Q 版在下；6 帧共 6.60 秒，循环播放。'))
        idle_timeline.append({'state':'idle','frame':column,'time_ms':elapsed,'duration_ms':duration});elapsed+=duration
    idle_result=save_gif(idle_frames,IDLE,OUTPUT/'all-pets-idle.gif',0)
    sequence=[(7,c,d,cycle) for cycle in range(1,4) for c,d in enumerate(WORK)]+[(0,c,d,None)for c,d in enumerate(IDLE)]
    work_frames=[];work_timeline=[];elapsed=0
    for row,column,duration,cycle in sequence:
        subtitle=f'工作第 {cycle}/3 轮 · 3 轮共 2.46 秒，随后待机。有限播放，不自动重触发。' if cycle else '已进入待机 · 展示一个完整 6.60 秒周期，然后结束本次有限预览。'
        work_frames.append(render_frame(loaded,row,column,elapsed,'10 只宠物 · 工作 → 待机',subtitle))
        work_timeline.append({'state':'running' if row==7 else 'idle','cycle':cycle,'frame':column,'time_ms':elapsed,'duration_ms':duration});elapsed+=duration
    work_result=save_gif(work_frames,[entry[2]for entry in sequence],OUTPUT/'all-pets-working-then-idle.gif',None)
    idle_frames[0].save(OUTPUT/'all-pets-idle-still.png')
    work_frames[2].save(OUTPUT/'all-pets-working-still.png')
    # The last work pose and first idle pose at the same native size allow inspection of the transition.
    transition=Image.new('RGB',(WIDTH*2,HEIGHT),BG)
    transition.paste(work_frames[17],(0,0));transition.paste(work_frames[18],(WIDTH,0))
    transition.save(OUTPUT/'all-pets-transition-still.png')
    manifest={'source_policy':'Only outputs/pet-motion-v3/PET/spritesheet.png; no original fallback','native_cell_size':[192,208],
      'sprite_scale':1,'grid':{'columns':5,'rows':2,'upper':'normal','lower':'chibi','role_order':[x[1]for x in ROLES]},
      'sources':sources,'gifs':[idle_result,work_result],'idle_timeline':idle_timeline,'working_then_idle_timeline':work_timeline,
      'working_playback':'Finite: 3 work cycles (2460ms), one idle cycle (6600ms), total 9060ms. No loop extension is written.',
      'runtime_note':'The client continues idle indefinitely after the same work transition; this GIF is explicitly a finite capture.',
      'visual_review_required':True}
    (OUTPUT/'all-pets-motion-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'ok':True,'sources':len(sources),'idle_ms':idle_result['total_ms'],'work_then_idle_ms':work_result['total_ms'],'size':[WIDTH,HEIGHT],'output':str(OUTPUT)},ensure_ascii=False))

if __name__=='__main__':main()
