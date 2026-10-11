# -*- coding: utf-8 -*-
"""
录制时某一步抓帧卡住（比如 { local } 的 reload 让 captureScreenshot 超时 3 秒），之后所有标记都比画面晚了固定几秒，
每段开头就会带着上一页的尾巴。不用重录：把某个标记之后的 vt 整体前移，再按需改几个标记的 vt。
  PYTHONIOENCODING=utf-8 python3 scripts/video/fixmarks.py <录制目录> <从哪个标记起（含）> <前移秒数> [标记=vt ...]
原件存成 marks-before-fix.json。查偏移量：ffmpeg 场景切换（select='gt(scene,0.35)',showinfo）和 marks 的 vt 比一下。
"""
import json, os, shutil, sys

D, start, delta, *sets = sys.argv[1:]
delta = float(delta)
p = os.path.join(D, 'marks.json')
keep = os.path.join(D, 'marks-before-fix.json')
if not os.path.exists(keep): shutil.copy(p, keep)
m = json.load(open(keep, encoding='utf-8'))
on = False
for x in m['marks']:
    if x['note'] == start: on = True
    if on: x['vt'] = round(x['vt'] - delta, 3)
for s in sets:
    k, v = s.split('=')
    for x in m['marks']:
        if x['note'] == k: x['vt'] = float(v)
json.dump(m, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print(' '.join(f"{x['note']}@{x['vt']:.1f}" for x in m['marks']))
