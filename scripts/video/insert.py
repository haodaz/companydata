# -*- coding: utf-8 -*-
"""
把另一条录像里的一段插进成片的某段之后（不换、是加）：
  PYTHONIOENCODING=utf-8 python3 scripts/video/insert.py <片子目录> <来源目录> <段名> --after <已有段名>
两边都要先过 build.py。改写 cut.mp4 / timeline.json（原件存成 cut-before-insert.mp4 / timeline-before-insert.json）。
"""
import json, os, shutil, subprocess, sys

def _clean(f):
    """concat 拼出来的文件时间戳有缝，-ss 会越往后越偏：先重编成等帧率干净流再抽段"""
    c = f[:-4] + '.clean.mp4'
    if not os.path.exists(c) or os.path.getmtime(c) < os.path.getmtime(f):
        subprocess.run([F, '-loglevel', 'error', '-y', '-i', f, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30', '-fps_mode', 'cfr', '-an', c], check=True)
    return c

F = os.path.join(os.path.dirname(__file__), '..', '..', 'node_modules', 'ffmpeg-static', 'ffmpeg')
a = sys.argv[1:]; after = a[a.index('--after') + 1]; a = [x for i, x in enumerate(a) if x != '--after' and a[i - 1] != '--after']
D, SRC, name = a
tl = json.load(open(os.path.join(D, 'timeline.json'), encoding='utf-8'))
stl = {x['clip']: x for x in json.load(open(os.path.join(SRC, 'timeline.json'), encoding='utf-8'))}
if name not in stl: raise SystemExit('来源里没有 ' + name)
if name in {x['clip'] for x in tl}: raise SystemExit('片子里已经有 ' + name)
src = os.path.join(D, 'cut.mp4'); keep = os.path.join(D, 'cut-before-insert.mp4')
shutil.copy(src, keep); shutil.copy(os.path.join(D, 'timeline.json'), os.path.join(D, 'timeline-before-insert.json'))
seq = []
for x in tl:
    seq.append((x, keep))
    if x['clip'] == after: seq.append((stl[name], os.path.join(SRC, 'cut.mp4')))
parts, out, t = [], [], 0.0
for i, (x, f) in enumerate(seq):
    p = os.path.join(D, f'seg_{i:02d}.mp4')
    nf = max(1, round((x['end'] - x['start']) * 30))
    subprocess.run([F, '-loglevel', 'error', '-y', '-ss', f"{x['start']:.3f}", '-i', f, '-frames:v', str(nf), '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-an', p], check=True)
    parts.append(p); d = nf / 30; out.append({**x, 'start': round(t, 2), 'end': round(t + d, 2)}); t += d
lst = os.path.join(D, 'concat.txt'); open(lst, 'w', encoding='utf-8').write(''.join(f"file '{p}'\n" for p in parts))
subprocess.run([F, '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', '30', '-fps_mode', 'cfr', '-an', src], check=True)
json.dump(out, open(os.path.join(D, 'timeline.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
if not os.environ.get('KEEP_PARTS'):
    for p in parts: os.remove(p)
    os.remove(lst)
print(f'已把 {name} 插在 {after} 之后 · 成片 {t:.1f}s')
