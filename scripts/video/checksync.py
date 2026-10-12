# -*- coding: utf-8 -*-
"""
核对成片的段界和画面是否对得上：timeline.json 里每一段的起点，附近（±tol 秒）应该有一次画面切换。
  PYTHONIOENCODING=utf-8 python3 scripts/video/checksync.py <片子目录> [--video final.mp4] [--offset 0] [--tol 0.6]
--offset：视频前面另接了封面时填封面秒数。打印每段的偏差，最后给最大偏差；偏差一路变大 = 拼接时间戳累积错位。
"""
import json, os, re, subprocess, sys

F = os.path.join(os.path.dirname(__file__), '..', '..', 'node_modules', 'ffmpeg-static', 'ffmpeg')
a = sys.argv[1:]
opt = lambda k, d: a[a.index(k) + 1] if k in a else d
D = a[0]; VIDEO = os.path.join(D, opt('--video', 'cut.mp4')); OFF = float(opt('--offset', '0')); TOL = float(opt('--tol', '0.6'))
tl = json.load(open(os.path.join(D, 'timeline.json'), encoding='utf-8'))
r = subprocess.run([F, '-i', VIDEO, '-vf', "scale=320:-1,select='gt(scene,0.3)',showinfo", '-f', 'null', '-'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
sc = [float(x) for x in re.findall(r'pts_time:([\d.]+)', r.stderr)]
worst = 0.0; bad = []
for x in tl[1:]:
    t = x['start'] + OFF
    near = min(sc, key=lambda s: abs(s - t)) if sc else None
    d = near - t if near is not None else 99
    worst = max(worst, abs(d))
    flag = '' if abs(d) <= TOL else '  ← 对不上'
    print(f"{x['clip']:18s} 段起 {t:7.1f}  最近切换 {near if near is not None else '-':>7}  偏 {d:+.2f}{flag}")
    if abs(d) > TOL: bad.append(x['clip'])
print(f"最大偏差 {worst:.2f}s · 对不上的段：{' '.join(bad) if bad else '无'}")
