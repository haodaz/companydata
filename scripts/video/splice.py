# -*- coding: utf-8 -*-
"""
用补录的段替换成片里的同名段（不用整条重录）：
  PYTHONIOENCODING=utf-8 python3 scripts/video/splice.py <片子目录> <补录目录> <段名1> <段名2> ...
两个目录都要先过 build.py（有 cut.mp4 + timeline.json）。改写片子目录的 cut.mp4 和 timeline.json（原件存成 cut-before-splice.mp4 / timeline-before-splice.json）。
"""
import json, os, shutil, subprocess, sys

F = os.path.join(os.path.dirname(__file__), '..', '..', 'node_modules', 'ffmpeg-static', 'ffmpeg')
D, FIX, *names = sys.argv[1:]
tl = json.load(open(os.path.join(D, 'timeline.json'), encoding='utf-8'))
ftl = {x['clip']: x for x in json.load(open(os.path.join(FIX, 'timeline.json'), encoding='utf-8'))}
missing = [n for n in names if n not in ftl or n not in {x['clip'] for x in tl}]
if missing: raise SystemExit('两边都得有这些段：' + ' '.join(missing))

src = os.path.join(D, 'cut.mp4'); keep = os.path.join(D, 'cut-before-splice.mp4')
if not os.path.exists(keep): shutil.copy(src, keep)
shutil.copy(os.path.join(D, 'timeline.json'), os.path.join(D, 'timeline-before-splice.json'))
fix_src = os.path.join(FIX, 'cut.mp4')

parts, out, t = [], [], 0.0
for i, x in enumerate(tl):
    seg, f = (ftl[x['clip']], fix_src) if x['clip'] in names else (x, keep)
    p = os.path.join(D, f'seg_{i:02d}.mp4')
    subprocess.run([F, '-loglevel', 'error', '-y', '-ss', f"{seg['start']:.3f}", '-to', f"{seg['end']:.3f}", '-i', f, '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-an', p], check=True)
    parts.append(p)
    d = seg['end'] - seg['start']
    out.append({**seg, 'start': round(t, 2), 'end': round(t + d, 2)}); t += d
lst = os.path.join(D, 'concat.txt')
open(lst, 'w', encoding='utf-8').write(''.join(f"file '{p}'\n" for p in parts))
subprocess.run([F, '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', src], check=True)
json.dump(out, open(os.path.join(D, 'timeline.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for p in parts: os.remove(p)
os.remove(lst)
print('已替换：', ' '.join(names), f'· 成片 {t:.1f}s')
