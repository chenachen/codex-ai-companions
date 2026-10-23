"""Fit existing extracted pixels to one body scale, retaining the generated jump lift."""
import json
import statistics
import sys
from pathlib import Path
from PIL import Image

run = Path(sys.argv[1])
frames = run / 'frames'
def box(path):
    with Image.open(path) as im:
        return im.getchannel('A').point(lambda a: 255 if a > 16 else 0).getbbox()
idle = [box(p) for p in sorted((frames/'idle').glob('*.png'))]
jump = [box(p) for p in sorted((frames/'jumping').glob('*.png'))]
idle_height = statistics.median(b[3]-b[1] for b in idle)
ground_height = statistics.mean([jump[0][3]-jump[0][1], jump[-1][3]-jump[-1][1]])
factor = min(1.0, ground_height/idle_height)
baseline = round(statistics.median(b[3] for b in idle))
report = {'idleHeightBefore':idle_height,'jumpStandingHeight':ground_height,'uniformNonJumpScale':factor,'baseline':baseline,'frames':[]}
for state in sorted(frames.iterdir()):
    if not state.is_dir() or state.name == 'jumping':
        continue
    for file in sorted(state.glob('*.png')):
        with Image.open(file) as source:
            source = source.convert('RGBA')
            fitted = source.resize((round(source.width*factor),round(source.height*factor)),Image.Resampling.LANCZOS)
        canvas = Image.new('RGBA',(192,208))
        canvas.alpha_composite(fitted,((192-fitted.width)//2,baseline-round(baseline*factor)))
        canvas.save(file)
        report['frames'].append(str(file))
(run/'qa/shared-scale-registration.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps({'uniformNonJumpScale':factor,'baseline':baseline,'jumpPixelsPreserved':True}))
