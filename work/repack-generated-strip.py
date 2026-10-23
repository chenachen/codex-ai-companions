"""Place complete generated pose groups in padded slots, without drawing or resizing."""
import sys, json, os
from pathlib import Path
from PIL import Image
scripts = Path(os.environ.get('WORK_PETS_SCRIPTS', str(Path(os.environ.get('CODEX_HOME', str(Path.home()/'.codex')))/'plugins/cache/openai-curated-remote/work-pets/0.1.6/skills/create-pet/scripts')))
sys.path.insert(0, str(scripts))
from extract_strip_frames import remove_chroma_background, parse_hex_color, component_frame_groups, component_bounds, component_group_image
src, dst, count, key = sys.argv[1:]
source = remove_chroma_background(Image.open(src), parse_hex_color(key), 96.0)
groups = component_frame_groups(source, int(count))
if groups is None: raise SystemExit('Could not locate complete pose groups')
bounds = [component_bounds(g) for g in groups]
width = max(b[2]-b[0] for b in bounds) + 48
target = Image.new('RGBA', (width*int(count), source.height))
for i, (g, b) in enumerate(zip(groups, bounds)):
    crop = component_group_image(source, g, padding=0)
    target.alpha_composite(crop, (i*width+(width-crop.width)//2, b[1]))
target.save(dst)
print(json.dumps({'source':src, 'output':dst, 'bounds':bounds, 'size':target.size, 'operation':'translation-only complete pose grouping using bundled extraction'}))
