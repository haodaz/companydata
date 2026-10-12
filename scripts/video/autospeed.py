# -*- coding: utf-8 -*-
"""
按旁白长度自动算每段的倍速（不用手填 speed.json）：
  PYTHONIOENCODING=utf-8 python3 scripts/video/autospeed.py <录制目录> <旁白.json> <配音目录> <输出 speed.json> [--pad 0.6] [--min-bench 20] [--max-bench 26]
每段的目标时长 = 这段所有旁白之和 + pad；操作段（*_bench）至少 min-bench、至多 max-bench 秒；没旁白的段保持原速。
然后照常：build.py <目录> <speed.json>。
"""
import json, sys, os

args = sys.argv[1:]
opt = lambda k, d: float(args[args.index(k) + 1]) if k in args else d
PAD, MINB, MAXB = opt('--pad', 0.6), opt('--min-bench', 20), opt('--max-bench', 26)
pos = [a for i, a in enumerate(args) if not a.startswith('--') and not (i and args[i - 1].startswith('--'))]
D, NARR, TTS, OUT = pos[:4]
marks = json.load(open(os.path.join(D, 'marks.json'), encoding='utf-8'))['marks']
dur = {x['id']: x['dur'] for x in json.load(open(os.path.join(TTS, 'durations.json'), encoding='utf-8'))}
narr = json.load(open(NARR, encoding='utf-8'))
by_clip = {}
for n in narr: by_clip[n['clip']] = by_clip.get(n['clip'], 0) + dur.get(n['id'], 0)

speed = {}
for i, m in enumerate(marks):
    name = m['note']; src = (marks[i + 1]['vt'] if i + 1 < len(marks) else m['vt']) - m['vt']
    if src <= 0.2 or name not in by_clip: continue
    target = by_clip[name] + PAD
    if name.endswith('_bench'): target = max(MINB, min(MAXB, target))
    speed[name] = round(max(0.3, min(20, src / target)), 3)
json.dump(speed, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for k, v in speed.items(): print(f'{k:18s} ×{v:<6} 源 {(next(mm for mm in marks if mm["note"] == k)["vt"]):.0f}s → 目标 {by_clip[k] + PAD:.1f}s')
