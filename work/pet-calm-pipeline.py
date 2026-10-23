"""Replace generated idle/work rows only; preserve approved native v2 pixels and evidence."""
from __future__ import annotations
import argparse, hashlib, json, os, shutil, statistics, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageSequence

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = Path(os.environ.get('WORK_PETS_SCRIPTS', str(Path(os.environ.get('CODEX_HOME', str(Path.home()/'.codex')))/'plugins/cache/openai-curated-remote/work-pets/0.1.6/skills/create-pet/scripts')))
sys.path.insert(0, str(SCRIPTS))
sys.path.insert(0, str(ROOT/'work/preview-deps'))
from render_animation_previews import ROW_DURATIONS, save_preview
STATES = list(ROW_DURATIONS)
REPLACED = {'idle': 0, 'running': 7}
IDLE_MS = [1680, 660, 660, 840, 840, 1920]
WORK_MS = ROW_DURATIONS['running']
SIZE = (1536, 2288)

def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))

def write(path, value):
    path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')

def call(script, args, log):
    script = Path(script) if str(script).endswith('.py') else SCRIPTS/(script+'.py')
    result = subprocess.run([sys.executable, str(script), *map(str, args)], capture_output=True, text=True)
    log = Path(log); log.parent.mkdir(parents=True, exist_ok=True)
    log.write_text(result.stdout+result.stderr, encoding='utf-8')
    if result.returncode:
        raise RuntimeError(f'{script.name} failed ({result.returncode}); see {log}\n{result.stdout[-2500:]}\n{result.stderr[-1000:]}')

def rgba(path):
    with Image.open(path) as image:
        return image.convert('RGBA')

def cell(image, row, col):
    return image.crop((col*192, row*208, (col+1)*192, (row+1)*208))

def box(image):
    return image.getchannel('A').point(lambda a: 255 if a>16 else 0).getbbox()

def paths(pet, regression=False):
    if pet not in {f'{who}-{kind}' for who in ['gpt','claude','gemini','deepseek','grok'] for kind in ['normal','chibi']}:
        raise ValueError('Unknown pet id')
    original = ROOT/'work/native-pets'/pet
    run = ROOT/('work/pet-motion-v3-tool-regression' if regression else 'work/pet-motion-v3')/pet
    out = ROOT/('outputs/pet-motion-v3-tool-regression' if regression else 'outputs/pet-motion-v3')/pet
    run.mkdir(parents=True, exist_ok=True)
    return original, run, out

def key_for(original):
    return read(original/'pet_request.json')['chroma_key']['hex']

def baseline_for(original,run,regression=False):
    if regression:return original/'final/spritesheet-extended.png'
    candidates=[run/'baseline/spritesheet-current.png',run/'references/current-spritesheet.png']
    found=next((p for p in candidates if p.is_file()),None)
    if found is None:raise ValueError('Download current pet bytes to baseline/spritesheet-current.png before processing')
    proof_unchanged(rgba(original/'final/spritesheet-extended.png'),rgba(found))
    return found

def proof_unchanged(before, after):
    if before.size != SIZE or after.size != SIZE:
        raise ValueError('Both atlases must be native v2 size')
    records=[]
    for row in range(11):
        a=before.crop((0,row*208,1536,(row+1)*208)).tobytes()
        b=after.crop((0,row*208,1536,(row+1)*208)).tobytes()
        equal=a==b
        records.append({'row':row,'preserved_required':row not in (0,7),'rgba_equal':equal,
                        'before_sha256':hashlib.sha256(a).hexdigest(),'after_sha256':hashlib.sha256(b).hexdigest()})
        if row not in (0,7) and not equal:
            raise ValueError(f'Protected row {row} changed')
    return records

def row_command(args):
    original,run,_=paths(args.pet)
    state=args.state; row=REPLACED[state]; qa=run/'qa/rows'/state
    source=run/'decoded'/f'{state}.png'
    key=key_for(original)
    call('extract_strip_frames',['--decoded-dir',run/'decoded','--output-dir',qa/'extracted','--states',state,'--method','components','--chroma-key',key],qa/'extraction.log')
    call('inspect_frames',['--frames-root',qa/'extracted','--states',state,'--require-components','--json-out',qa/'extraction-review.json'],qa/'extraction-inspection.log')
    baseline=baseline_for(original,run)
    old=rgba(baseline)
    old_boxes=[box(cell(old,0,c)) for c in range(6)]
    frames=[rgba(qa/'extracted'/state/f'{c:02d}.png') for c in range(6)]
    bounds=[box(im) for im in frames]
    if any(b is None for b in old_boxes+bounds): raise ValueError('Blank registration input')
    target_height=statistics.median(b[3]-b[1] for b in old_boxes)
    source_height=statistics.median(b[3]-b[1] for b in bounds)
    factor=args.scale if args.scale is not None else target_height/source_height
    source_bottom=statistics.median(b[3] for b in bounds)
    target_bottom=statistics.median(b[3] for b in old_boxes)
    source_center=statistics.median((b[0]+b[2])/2 for b in bounds)
    target_center=statistics.median((b[0]+b[2])/2 for b in old_boxes)
    width,height=round(192*factor),round(208*factor)
    sx,sy=width/192,height/208
    dx=round(target_center-source_center*sx)+args.dx
    dy=round(target_bottom-source_bottom*sy)+args.dy
    packed=Image.new('RGBA',(1536,208))
    registered=[]
    for col,im in enumerate(frames):
        scaled=im.resize((width,height),Image.Resampling.LANCZOS)
        sb=box(scaled)
        if sb and (sb[0]+dx<2 or sb[1]+dy<2 or sb[2]+dx>190 or sb[3]+dy>206):
            raise ValueError(f'{state} frame {col}: shared transform clips safe cell bounds; adjust --scale/--dx/--dy after visual inspection')
        target=Image.new('RGBA',(192,208)); target.paste(scaled,(dx,dy))
        packed.paste(target,(col*192,0)); registered.append(box(target))
    raw=qa/'registered-raw.png'; clean=qa/'registered.png'; packed.save(raw)
    call('despill_chroma_edges',[raw,'--output',clean,'--json-out',qa/'chroma.json','--chroma-key',key],qa/'despill.log')
    cleaned=rgba(clean); frame_root=qa/'frames'; folder=frame_root/state;folder.mkdir(parents=True,exist_ok=True)
    for c in range(6): cell(cleaned,0,c).save(folder/f'{c:02d}.png')
    manifest=read(qa/'extracted/frames-manifest.json')
    manifest['rows'][0]['frames']=[str(folder/f'{c:02d}.png') for c in range(6)]
    manifest['registration']={'uniform_scale':factor,'dx':dx,'dy':dy,'source':str(source)}
    write(frame_root/'frames-manifest.json',manifest)
    call('inspect_frames',['--frames-root',frame_root,'--states',state,'--require-components','--json-out',qa/'review.json'],qa/'inspection.log')
    report={'source':str(source),'source_sha256':digest(source),'baseline_atlas':str(baseline),'original_atlas_sha256':digest(baseline),
            'registered_sha256':digest(clean),'uniform_scale':factor,'raster_scale_xy':[sx,sy],'translation':[dx,dy],
            'target_idle_height':target_height,'source_median_height':source_height,'target_baseline':target_bottom,
            'baseline_after':[b[3] for b in registered],'boxes_after':registered,'same_transform_all_frames':True,'visual_approval_required':True}
    write(qa/'registration.json',report)
    save_preview([matte(cell(cleaned,0,c)) for c in range(6)],IDLE_MS if state=='idle' else WORK_MS,qa/'native-row.gif')
    sheet=Image.new('RGB',(7*192,240),(247,247,251)); sheet.paste(matte(cell(old,row,0),'Original'),(0,0))
    for c in range(6):sheet.paste(matte(cell(cleaned,0,c),f'New {state} {c+1}'),((c+1)*192,0))
    sheet.save(qa/'row-contact.png')
    print(json.dumps({'pet':args.pet,'state':state,'ok':True,'row_contact':str(qa/'row-contact.png'),'preview':str(qa/'native-row.gif'),'registration':report},ensure_ascii=False))

def approve_command(args):
    original,run,_=paths(args.pet);qa=run/'qa/rows'/args.state
    if not read(qa/'review.json')['ok']:raise ValueError('Row inspection failed')
    registration=read(qa/'registration.json')
    if digest(run/'decoded'/f'{args.state}.png')!=registration['source_sha256'] or digest(qa/'registered.png')!=registration['registered_sha256']:
        raise ValueError('Row changed after inspection')
    write(qa/'visual-approval.json',{'reviewer':args.reviewer,'evidence':args.note,'verdict':'pass','at':datetime.now(timezone.utc).isoformat(),
          'registered_sha256':registration['registered_sha256'],'source_sha256':registration['source_sha256']})
    print(json.dumps({'pet':args.pet,'state':args.state,'approved':True}))

def preserve_evidence(original,run):
    dest=run/'qa/preserved-direction-evidence';dest.mkdir(parents=True,exist_ok=True)
    records=[]
    for pattern in ['direction-semantics.json','blind-*.json','directions.png','look-continuity*.json','pet-quality.json','chroma-despill-extended.json']:
        for src in (original/'qa').glob(pattern):
            shutil.copy2(src,dest/src.name); records.append({'source':str(src),'copy':str(dest/src.name),'sha256':digest(src)})
    if not (dest/'direction-semantics.json').exists():raise ValueError('Missing approved direction semantics')
    write(dest/'provenance.json',{'reason':'Rows 9 and 10 are exactly preserved; prior approved semantic and blind evidence retained unchanged','files':records})

def encoded_frames(atlas,run,key):
    folder=run/'qa/encoded-frames'; manifest={'ok':True,'chroma_key':{'hex':key,'rgb':[int(key[i:i+2],16) for i in (1,3,5)]},'rows':[]}
    for row,state in enumerate(STATES):
        dest=folder/state;dest.mkdir(parents=True,exist_ok=True);files=[]
        for c in range(len(ROW_DURATIONS[state])):
            path=dest/f'{c:02d}.png';cell(atlas,row,c).save(path);files.append(str(path))
        manifest['rows'].append({'state':state,'frames':files,'pixel_source':'exact-final-encoded-atlas','row':row})
    write(folder/'frames-manifest.json',manifest)
    return folder

def gates(original,run,regression=False):
    atlas_path=run/'final/spritesheet-extended.png';key=key_for(original)
    baseline=baseline_for(original,run,regression)
    atlas=rgba(atlas_path); before=rgba(baseline)
    preserved=proof_unchanged(before,atlas)
    evidence_rows=proof_unchanged(rgba(original/'final/spritesheet-extended.png'),before)
    write(run/'qa/row-preservation.json',{'ok':True,'baseline_regression_only':regression,'baseline_atlas':str(baseline),'original_sha256':digest(baseline),'final_sha256':digest(atlas_path),'rows':preserved,
        'approved_evidence_atlas':str(original/'final/spritesheet-extended.png'),'approved_evidence_to_current_baseline':evidence_rows})
    call('validate_atlas',[atlas_path,'--require-v2','--chroma-key',key,'--json-out',run/'final/validation-extended.json'],run/'qa/validation.log')
    frame_root=encoded_frames(atlas,run,key)
    call('inspect_frames',['--frames-root',frame_root,'--json-out',run/'qa/review.json'],run/'qa/inspection.log')
    continuity=ROOT/'work/qa-detector-fix/measure_direction_continuity.py'
    call(continuity,[atlas_path,'--json-out',run/'qa/look-continuity.json'],run/'qa/continuity.log')
    write(run/'qa/continuity-tool.json',{'script':str(continuity),'sha256':digest(continuity),'provenance':str(ROOT/'work/qa-detector-fix/provenance.json')})
    call('validate_pet_quality',[atlas_path,'--atlas-validation',run/'final/validation-extended.json','--chroma-report',run/'qa/chroma-report.json',
        '--frame-review',run/'qa/review.json','--direction-semantics',run/'qa/preserved-direction-evidence/direction-semantics.json',
        '--continuity',run/'qa/look-continuity.json','--json-out',run/'qa/pet-quality.json'],run/'qa/quality.log')
    call('make_contact_sheet',[atlas_path,'--output',run/'qa/contact-sheet-final.png'],run/'qa/contact.log')
    call('make_direction_qa_sheet',[atlas_path,'--output',run/'qa/directions.png'],run/'qa/directions.log')

def assemble_command(args,regression=False):
    original,run,out=paths(args.pet,regression);src=baseline_for(original,run,regression);atlas=rgba(src)
    original_hash=digest(src); preserve_evidence(original,run)
    reports=[]
    for state,row in REPLACED.items():
        qa=run/'qa/rows'/state
        if regression:
            replacement=atlas.crop((0,row*208,1536,(row+1)*208))
        else:
            approval=read(qa/'visual-approval.json');registration=read(qa/'registration.json')
            if approval['verdict']!='pass' or approval['registered_sha256']!=digest(qa/'registered.png'):
                raise ValueError(f'{state} needs current visual approval')
            if registration['source_sha256']!=digest(run/'decoded'/f'{state}.png'):
                raise ValueError(f'{state} source changed after registration')
            current_row=atlas.crop((0,row*208,1536,(row+1)*208))
            replacement=rgba(qa/'registered.png')
            inherited_idle=state=='idle' and replacement.tobytes()==current_row.tobytes()
            if registration['original_atlas_sha256']!=original_hash:
                previous_final=ROOT/'outputs/pet-motion-v2'/args.pet/'spritesheet.png'
                if not inherited_idle or not previous_final.is_file() or rgba(previous_final).crop((0,0,1536,208)).tobytes()!=replacement.tobytes():
                    raise ValueError(f'{state} registration baseline changed without identical approved idle provenance')
                write(qa/'current-baseline-preservation.json',{'reason':'Current native Pet already contains the approved v2 idle. Preserve its exact RGBA pixels while replacing only work.','current_baseline_sha256':original_hash,'prior_registration_baseline_sha256':registration['original_atlas_sha256'],'approved_previous_final_sha256':digest(previous_final),'registered_idle_equals_current_and_previous':True,'idle_rgba_sha256':hashlib.sha256(replacement.tobytes()).hexdigest()})
            if not read(qa/'review.json')['ok'] or not read(qa/'chroma.json')['ok']:raise ValueError(f'{state} row gate failed')
            replacement=rgba(qa/'registered.png');reports.append({'state':state,'report':str(qa/'chroma.json'),'sha256':digest(qa/'chroma.json')})
            if replacement.tobytes()==current_row.tobytes() and not inherited_idle:raise ValueError(f'{state} is identical to original; cannot mark as optimized')
        atlas.paste(replacement,(0,row*208))
    (run/'final').mkdir(parents=True,exist_ok=True);final=run/'final/spritesheet-extended.png';atlas.save(final)
    original_chroma=original/'qa/chroma-despill-extended.json'
    if not read(original_chroma)['ok']:raise ValueError('Original chroma evidence failed')
    write(run/'qa/chroma-report.json',{'ok':True,'scope':'composition of already cleaned protected rows and individually despilled replacement rows',
        'baseline_regression_only':regression,'original_report':str(original_chroma),'original_report_sha256':digest(original_chroma),
        'original_atlas_sha256':original_hash,'new_row_reports':reports,'final_sha256':digest(final),'no_second_cleanup_on_protected_rows':True})
    gates(original,run,regression)
    if digest(src)!=original_hash:raise ValueError('Original atlas changed during operation')
    write(run/'qa/motion-v2-status.json',{'baseline_regression_only':regression,'optimized_candidate':not regression,'visual_final_review_required':True,
        'final_sha256':digest(final),'quality_gate_ok':read(run/'qa/pet-quality.json')['ok']})
    preview_command(args,regression)
    print(json.dumps({'pet':args.pet,'ok':True,'baseline_regression_only':regression,'output':str(out),'sha256':digest(final)}))

def matte(im,label=None):
    canvas=Image.new('RGB',(192,240 if label else 208),(247,247,251));canvas.paste(im,(0,0),im)
    if label:ImageDraw.Draw(canvas).text((6,216),label,fill=(45,45,65))
    return canvas

def paired(old,new,label):
    canvas=Image.new('RGB',(384,264),(247,247,251));canvas.paste(matte(old,'Before'),(0,0));canvas.paste(matte(new,'Candidate'),(192,0))
    ImageDraw.Draw(canvas).text((6,246),label,fill=(45,45,65));return canvas

def preview_command(args,regression=False):
    original,run,out=paths(args.pet,regression);out.mkdir(parents=True,exist_ok=True)
    final=run/'final/spritesheet-extended.png';baseline=baseline_for(original,run,regression);atlas=rgba(final);before=rgba(baseline)
    quality=read(run/'qa/pet-quality.json')
    if quality['ok'] is not True or quality['sha256']!=digest(final):raise ValueError('Preview requires quality pass for these exact encoded bytes')
    frames_root=encoded_frames(atlas,run,key_for(original))
    call('render_animation_previews',['--frames-root',frames_root,'--output-dir',out/'states'],run/'qa/previews.log')
    rows={state:[cell(atlas,row,c) for c in range(len(ROW_DURATIONS[state]))] for row,state in enumerate(STATES)}
    look=[cell(atlas,9+i//8,i%8) for i in range(16)]
    ims=[];durations=[];timeline=[];elapsed=0
    for state,frames in list(rows.items())+[('look',look)]:
        for c,(im,d) in enumerate(zip(frames,ROW_DURATIONS[state] if state!='look' else [160]*16)):
            ims.append(matte(im,f'{state} {c+1}'));durations.append(d);timeline.append({'state':state,'frame':c,'time_ms':elapsed,'duration_ms':d});elapsed+=d
    save_preview(ims,durations,out/'all-states.gif')
    save_preview([matte(im) for im in rows['idle']+rows['jumping']+rows['idle']],IDLE_MS+ROW_DURATIONS['jumping']+IDLE_MS,out/'idle-jump-idle.gif')
    save_preview([matte(im) for im in look],[160]*16,out/'look-loop.gif')
    save_preview([matte(im) for im in rows['idle']],IDLE_MS,out/'native-idle.gif')
    work_seq=[(7,c,d) for _ in range(3) for c,d in enumerate(WORK_MS)]+[(0,c,d) for c,d in enumerate(IDLE_MS)]
    native=[matte(cell(atlas,r,c),f'{"work" if r==7 else "idle"} {c+1}') for r,c,d in work_seq]
    native[0].save(out/'native-working-then-idle.gif',save_all=True,append_images=native[1:],duration=[d for r,c,d in work_seq],disposal=2,optimize=False)
    save_preview([paired(cell(before,0,c),cell(atlas,0,c),f'idle: frame {c+1}, {d}ms') for c,d in enumerate(IDLE_MS)],IDLE_MS,out/'comparison-idle.gif')
    comparison=[paired(cell(before,r,c),cell(atlas,r,c),f'{"work" if r==7 else "idle"} {c+1}; replay = new trigger') for r,c,d in work_seq]
    save_preview(comparison,[d for r,c,d in work_seq],out/'comparison-running.gif')
    stills=Image.new('RGB',(4*384,288),(247,247,251))
    for i,(row,col,time) in enumerate([(0,0,0),(0,2,2340),(7,2,240),(7,5,600)]):
        stills.paste(paired(cell(before,row,col),cell(atlas,row,col),f'{STATES[row]} frame {col+1}; t={time}ms'),(i*384,0))
    ImageDraw.Draw(stills).text((8,272),'Final encoded atlas pixels; native timing snapshots',fill=(45,45,65));stills.save(out/'timestamped-stills.png')
    import imageio_ffmpeg
    process=subprocess.Popen([imageio_ffmpeg.get_ffmpeg_exe(),'-y','-f','rawvideo','-vcodec','rawvideo','-s','192x240','-pix_fmt','rgb24','-r','100','-i','-','-an','-vcodec','libx264','-pix_fmt','yuv420p','-r','25','-movflags','+faststart',str(out/'all-states.mp4')],stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    for im,d in zip(ims,durations):
        for _ in range(round(d/10)):process.stdin.write(im.tobytes())
    process.stdin.close();err=process.stderr.read();process.wait()
    if process.returncode:raise RuntimeError(err.decode(errors='replace'))
    for source,name in [(final,'spritesheet.png'),(baseline,'original-spritesheet.png'),(run/'qa/contact-sheet-final.png','contact-sheet-final.png'),(run/'qa/directions.png','directions.png'),(run/'qa/pet-quality.json','pet-quality.json')]:shutil.copy2(source,out/name)
    html='''<!doctype html><meta charset="utf-8"><title>Native pet rhythm comparison</title><style>body{font:16px system-ui;background:#f7f7fb;color:#29293b}canvas{border:1px solid #ccc}button{padding:8px;margin:8px}</style><h1>Native timing: before / candidate</h1><p>Idle 6.6 seconds. Work triggers exactly 3 cycles (2.46 seconds), then idle loops. Buttons retrigger; no automatic retrigger.</p><button id="idle">Idle</button><button id="work">Trigger work</button><p id="status"></p><canvas width="384" height="240"></canvas><script>
const idle=[1680,660,660,840,840,1920],work=[120,120,120,120,120,220];let mode='idle',i=0,timer;const a=new Image,b=new Image,c=document.querySelector('canvas'),ctx=c.getContext('2d');a.src='original-spritesheet.png';b.src='spritesheet.png';
function draw(){let working=mode==='work'&&i<18,row=working?7:0,frame=working?i%6:(mode==='work'?i-18:i)%6,d=working?work[frame]:idle[frame];ctx.fillStyle='#f7f7fb';ctx.fillRect(0,0,384,240);ctx.drawImage(a,frame*192,row*208,192,208,0,0,192,208);ctx.drawImage(b,frame*192,row*208,192,208,192,0,192,208);ctx.fillStyle='#29293b';ctx.fillText('Before',8,227);ctx.fillText('Candidate',200,227);document.querySelector('#status').textContent=(working?'Work '+(1+Math.floor(i/6))+'/3':'Idle loop')+' frame '+(frame+1)+' / '+d+'ms';timer=setTimeout(()=>{i++;if(mode==='idle'&&i===6)i=0;if(mode==='work'&&i===24)i=18;draw()},d)}
function start(m){clearTimeout(timer);mode=m;i=0;draw()}document.querySelector('#idle').onclick=()=>start('idle');document.querySelector('#work').onclick=()=>start('work');Promise.all([a.decode(),b.decode()]).then(()=>start('idle'));</script>'''
    (out/'native-rhythm.html').write_text(html,encoding='utf-8')
    decoded=[]
    expected={'native-idle.gif':6600,'native-working-then-idle.gif':9060,'comparison-idle.gif':6600,'comparison-running.gif':9060,'all-states.gif':elapsed}
    for name,total in expected.items():
        with Image.open(out/name) as gif:
            actual=[f.info.get('duration',0) for f in ImageSequence.Iterator(gif)]
            if sum(actual)!=total:raise ValueError(f'GIF timing mismatch: {name}')
            decoded.append({'file':name,'decoded_frames':len(actual),'decoded_durations_ms':actual,'total_ms':sum(actual),'gif_loop':gif.info.get('loop'),'sha256':digest(out/name)})
    with Image.open(out/'native-working-then-idle.gif') as gif:
        decoded_frames=[f.convert('RGB').copy() for f in ImageSequence.Iterator(gif)]
    if len(decoded_frames)!=len(work_seq):raise ValueError('Native work transition frame order was not preserved')
    strip=Image.new('RGB',(192*6,264*4),(247,247,251));time_ms=0;gif_order=[]
    for index,(decoded_im,intended,entry) in enumerate(zip(decoded_frames,native,work_seq)):
        histogram=ImageChops.difference(decoded_im,intended).histogram()
        mean_error=sum((i%256)*count for i,count in enumerate(histogram))/(decoded_im.width*decoded_im.height*3)
        if mean_error>5:raise ValueError(f'GIF encoded frame {index} differs materially from atlas-rendered frame ({mean_error})')
        x=(index%6)*192;y=(index//6)*264;strip.paste(decoded_im,(x,y))
        ImageDraw.Draw(strip).text((x+6,y+244),f'{index:02d} t={time_ms}ms',fill=(45,45,65))
        gif_order.append({'index':index,'state':STATES[entry[0]],'frame':entry[1],'time_ms':time_ms,'duration_ms':entry[2],'decoded_rgb_mean_error':mean_error})
        time_ms+=entry[2]
    strip.save(out/'decoded-native-timeline.png')
    write(out/'preview-manifest.json',{'source':str(final),'sha256':digest(final),'baseline_regression_only':regression,'native_idle_ms':IDLE_MS,'native_work_ms':WORK_MS,'native_work_cycles':3,'native_loop_start_index':18,
        'native_work_gif':'One 9060ms captured transition; no GIF repetition. HTML continues idle indefinitely.',
        'comparison_work_gif':'Replays one work trigger plus one idle cycle; replay is a new demonstration trigger, not client auto-retrigger.',
        'runtime_evidence':'work/pet-runtime/app-initial-2b6b8063022d.js: onc/nnc=6, inc=rnc*nnc, Ztc default repeats non-idle 3x then idle loopStartIndex',
        'all_states_timeline':timeline,'decoded_gifs':decoded,'decoded_native_frame_order':gif_order})

def main():
    parser=argparse.ArgumentParser(description=__doc__);sub=parser.add_subparsers(dest='command',required=True)
    row=sub.add_parser('row');row.add_argument('pet');row.add_argument('state',choices=list(REPLACED));row.add_argument('--scale',type=float);row.add_argument('--dx',type=int,default=0);row.add_argument('--dy',type=int,default=0)
    approve=sub.add_parser('approve');approve.add_argument('pet');approve.add_argument('state',choices=list(REPLACED));approve.add_argument('--reviewer',required=True);approve.add_argument('--note',required=True)
    for command in ['assemble','preview','regression']:
        sub.add_parser(command).add_argument('pet')
    args=parser.parse_args()
    if args.command=='row':row_command(args)
    elif args.command=='approve':approve_command(args)
    elif args.command=='preview':preview_command(args)
    else:assemble_command(args,args.command=='regression')

if __name__=='__main__':main()
