"""Apply one measured row-wide source scale before the shared final registration."""
import sys,json,hashlib,os
from pathlib import Path
from PIL import Image
sys.path.insert(0,os.environ.get('WORK_PETS_SCRIPTS',str(Path(os.environ.get('CODEX_HOME',str(Path.home()/'.codex')))/'plugins/cache/openai-curated-remote/work-pets/0.1.6/skills/create-pet/scripts')))
from extract_strip_frames import remove_chroma_background,parse_hex_color
run=Path(sys.argv[1]); factor=float(sys.argv[2])
request=json.loads((run/'pet_request.json').read_text(encoding='utf8'))
source=run/'decoded/look-row-10.png'
im=remove_chroma_background(Image.open(source),parse_hex_color(request['chroma_key']['hex']),96.0)
scaled=im.resize((round(im.width*factor),round(im.height*factor)),Image.Resampling.LANCZOS)
dest=run/'decoded/look-row-10-scale-matched.png';scaled.save(dest)
(run/'qa/look-row-10-source-scale.json').write_text(json.dumps({'source':str(source),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'factor':factor,'input_size':im.size,'output_size':scaled.size,'output':str(dest),'reason':'Parent observed uniform source-scale mismatch across two coherent rows; apply one uniform transform to entire row, preserving relative pose geometry. Final registration still uses the row 9 shared scale.'},indent=2),encoding='utf8')
print(dest)
