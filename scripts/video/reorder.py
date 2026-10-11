# -*- coding: utf-8 -*-
"""
把 build.py 切好的 cut.mp4 按新的段顺序重排（不用重录）：
  PYTHONIOENCODING=utf-8 python3 scripts/video/reorder.py <片子目录> [--drop] <段名1> <段名2> ...
没列到的段按原顺序接在最后；--drop 则丢掉。改写 cut.mp4 和 timeline.json（原件存成 cut-before-reorder.mp4 / timeline-before-reorder.json）。
"""
import json, os, shutil, subprocess, sys

F = os.path.join(os.path.dirname(__file__), '..', '..', 'node_modules', 'ffmpeg-static', 'ffmpeg')
args = sys.argv[1:]
drop = '--drop' in args            # --drop：没列到的段直接丢掉（精简版用）
args = [a for a in args if a != '--drop']
D, *order = args
tl = json.load(open(os.path.join(D, 'timeline.json'), encoding='utf-8'))
names = [x['clip'] for x in tl]
missing = [o for o in order if o not in names]
if missing: raise SystemExit('没有这些段：' + ' '.join(missing))
new = [next(x for x in tl if x['clip'] == o) for o in order] + ([] if drop else [x for x in tl if x['clip'] not in order])

src = os.path.join(D, 'cut.mp4'); keep = os.path.join(D, 'cut-before-reorder.mp4')
if not os.path.exists(keep): shutil.copy(src, keep)
shutil.copy(os.path.join(D, 'timeline.json'), os.path.join(D, 'timeline-before-reorder.json'))

parts = []
for i, x in enumerate(new):
    p = os.path.join(D, f'seg_{i:02d}.mp4')
    subprocess.run([F, '-loglevel', 'error', '-y', '-ss', f"{x['start']:.3f}", '-to', f"{x['end']:.3f}", '-i', keep, '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-an', p], check=True)
    parts.append(p)
lst = os.path.join(D, 'concat.txt')
open(lst, 'w', encoding='utf-8').write(''.join(f"file '{p}'\n" for p in parts))
subprocess.run([F, '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', src], check=True)

t = 0.0; out = []
for x in new:
    d = x['end'] - x['start']
    out.append({**x, 'start': round(t, 2), 'end': round(t + d, 2)}); t += d
json.dump(out, open(os.path.join(D, 'timeline.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for p in parts: os.remove(p)
os.remove(lst)
print('新顺序：', ' → '.join(x['clip'] for x in out), f'· 成片 {t:.1f}s')
