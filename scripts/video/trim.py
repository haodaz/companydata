# -*- coding: utf-8 -*-
"""
把成片里某一段只留开头几秒（砍掉段尾录进去的下一页），可选再拉长到目标秒数（旁白不够时慢放补齐）：
  PYTHONIOENCODING=utf-8 python3 scripts/video/trim.py <片子目录> <段名> <保留秒数> [目标秒数]
改写 cut.mp4 和 timeline.json（原件存成 cut-before-trim.mp4 / timeline-before-trim.json）。
"""
import json, os, re, shutil, subprocess, sys

F = os.path.join(os.path.dirname(__file__), '..', '..', 'node_modules', 'ffmpeg-static', 'ffmpeg')
D, name, keep = sys.argv[1], sys.argv[2], float(sys.argv[3])
target = float(sys.argv[4]) if len(sys.argv) > 4 else keep
tl = json.load(open(os.path.join(D, 'timeline.json'), encoding='utf-8'))
if name not in {x['clip'] for x in tl}: raise SystemExit('没有这段：' + name)

src = os.path.join(D, 'cut.mp4'); keep_f = os.path.join(D, 'cut-before-trim.mp4')
shutil.copy(src, keep_f)
shutil.copy(os.path.join(D, 'timeline.json'), os.path.join(D, 'timeline-before-trim.json'))
r = subprocess.run([F, '-i', keep_f], stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
fps = re.search(r'([\d.]+) fps', r.stderr).group(1)

parts, out, t = [], [], 0.0
for i, x in enumerate(tl):
    p = os.path.join(D, f'seg_{i:02d}.mp4')
    if x['clip'] == name:
        d = min(keep, x['end'] - x['start'])
        subprocess.run([F, '-loglevel', 'error', '-y', '-ss', f"{x['start']:.3f}", '-t', f'{d:.3f}', '-i', keep_f, '-vf', f'setpts={target / d:.5f}*PTS,fps={fps}', '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-an', p], check=True)
        d = target
    else:
        subprocess.run([F, '-loglevel', 'error', '-y', '-ss', f"{x['start']:.3f}", '-to', f"{x['end']:.3f}", '-i', keep_f, '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-an', p], check=True)
        d = x['end'] - x['start']
    parts.append(p)
    out.append({**x, 'start': round(t, 2), 'end': round(t + d, 2)}); t += d
lst = os.path.join(D, 'concat.txt')
open(lst, 'w', encoding='utf-8').write(''.join(f"file '{p}'\n" for p in parts))
subprocess.run([F, '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', src], check=True)
json.dump(out, open(os.path.join(D, 'timeline.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for p in parts: os.remove(p)
os.remove(lst)
print(f'{name}：留 {keep}s → {target}s · 成片 {t:.1f}s')
