# -*- coding: utf-8 -*-
"""
把 build.py 切好的 cut.mp4 按新的段顺序重排（不用重录）：
  PYTHONIOENCODING=utf-8 python3 scripts/video/reorder.py <片子目录> [--drop] <段名1> <段名2> ...
没列到的段按原顺序接在最后；--drop 则丢掉。改写 cut.mp4 和 timeline.json（原件存成 cut-before-reorder.mp4 / timeline-before-reorder.json）。
"""
import json, os, shutil, subprocess, sys

def _clean(f):
    """concat 拼出来的文件时间戳有缝，-ss 会越往后越偏：先重编成等帧率干净流再抽段"""
    c = f[:-4] + '.clean.mp4'
    if not os.path.exists(c) or os.path.getmtime(c) < os.path.getmtime(f):
        subprocess.run([F, '-loglevel', 'error', '-y', '-i', f, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30', '-fps_mode', 'cfr', '-an', c], check=True)
    return c

F = os.path.join(os.path.dirname(__file__), '..', '..', 'node_modules', 'ffmpeg-static', 'ffmpeg')
args = sys.argv[1:]
drop = '--drop' in args            # --drop：没列到的段直接丢掉（精简版用）
args = [a for a in args if a != '--drop']
D, *order = args
# 已经重排过一次的，从原件（cut-before-reorder + timeline-before-reorder）再排，不然上次 --drop 掉的段找不回来
_before = os.path.join(D, 'timeline-before-reorder.json')
tl = json.load(open(_before if os.path.exists(_before) and os.path.exists(os.path.join(D, 'cut-before-reorder.mp4')) else os.path.join(D, 'timeline.json'), encoding='utf-8'))
names = [x['clip'] for x in tl]
missing = [o for o in order if o not in names]
if missing: raise SystemExit('没有这些段：' + ' '.join(missing))
new = [next(x for x in tl if x['clip'] == o) for o in order] + ([] if drop else [x for x in tl if x['clip'] not in order])

src = os.path.join(D, 'cut.mp4'); keep = os.path.join(D, 'cut-before-reorder.mp4')
if not os.path.exists(keep): shutil.copy(src, keep)
if not os.path.exists(_before): shutil.copy(os.path.join(D, 'timeline.json'), _before)

parts = []
for i, x in enumerate(new):
    p = os.path.join(D, f'seg_{i:02d}.mp4')
    nf = max(1, round((x['end'] - x['start']) * 30))
    subprocess.run([F, '-loglevel', 'error', '-y', '-ss', f"{x['start']:.3f}", '-i', keep, '-frames:v', str(nf), '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-an', p], check=True)
    parts.append(p)
lst = os.path.join(D, 'concat.txt')
open(lst, 'w', encoding='utf-8').write(''.join(f"file '{p}'\n" for p in parts))
subprocess.run([F, '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', '30', '-fps_mode', 'cfr', '-an', src], check=True)

t = 0.0; out = []
for x in new:
    d = max(1, round((x['end'] - x['start']) * 30)) / 30
    out.append({**x, 'start': round(t, 2), 'end': round(t + d, 2)}); t += d
json.dump(out, open(os.path.join(D, 'timeline.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
if not os.environ.get('KEEP_PARTS'):
    for p in parts: os.remove(p)
    os.remove(lst)
print('新顺序：', ' → '.join(x['clip'] for x in out), f'· 成片 {t:.1f}s')
