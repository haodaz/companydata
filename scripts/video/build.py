"""
按录制时打的时间点（marks.json 里的 vt = 成片时间）切段、按段加速，拼成 cut.mp4 + timeline.json。
照 zhiji-yida/docs/video/build.py。漫长的操作（打字、工位自己走）加速，讲解的地方正常速度。

  PYTHONIOENCODING=utf-8 python3 scripts/video/build.py <录制目录>    # 读 <目录>/clip.mp4 + marks.json → <目录>/cut.mp4、timeline.json
"""
import json, subprocess, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
F = os.path.join(ROOT, "node_modules", "ffmpeg-static", "ffmpeg")
D = sys.argv[1]
marks = json.load(open(os.path.join(D, "marks.json"), encoding="utf-8"))["marks"]
t = {m["note"]: m["vt"] for m in marks}

def dur(f):
    r = subprocess.run([F, "-i", f], stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
    import re
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", r.stderr)
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
END = dur(os.path.join(D, "clip.mp4"))

# (clip 名, 起, 止, 倍速)：clip 名就是旁白挂的场景
# 讲解多的地方放慢（一天页旁白 17 秒），漫长的操作加速（工位自己走 100 秒压到 17 秒）
SPEED = {"gallery": 1.2, "hub": 1.0, "day": 0.75, "ch1_intro": 1.0, "ch1_steps": 1.25, "ch1_text": 1.4, "ch1_report": 1.0,
         "ch2_intro": 1.0, "bench": 6.0, "bench_done": 1.6, "day_tour": 1.0, "me": 1.0, "cover": 1.0,
         "cert": 1.0, "scores": 1.0, "dayscore": 1.0, "end": 1.0}
# 第二个参数：这条片子自己的分段速度（json），盖在默认表上
if len(sys.argv) > 2: SPEED.update(json.load(open(sys.argv[2], encoding="utf-8")))
order = [m["note"] for m in marks]
SEG = []
for i, n in enumerate(order):
    a = t[n]; b = t[order[i + 1]] if i + 1 < len(order) else END
    if b - a > 0.2: SEG.append((n, a, b, SPEED.get(n, 1.0)))

parts, concat, tl, cur = [], "", [], 0.0
for i, (n, a, b, sp) in enumerate(SEG):
    parts.append(f"[0:v]trim=start={a}:end={b},setpts=(PTS-STARTPTS)/{sp}[v{i}]"); concat += f"[v{i}]"
    d = (b - a) / sp; tl.append({"clip": n, "start": round(cur, 2), "end": round(cur + d, 2), "src": [round(a, 2), round(b, 2)], "speed": sp}); cur += d
fc = ";".join(parts) + f";{concat}concat=n={len(SEG)}:v=1:a=0[cat];[cat]fps=30[out]"
json.dump(tl, open(os.path.join(D, "timeline.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
for x in tl: print(f'{x["clip"]:12s} {x["start"]:6.1f} → {x["end"]:6.1f}  (源 {x["src"][0]:.1f}–{x["src"][1]:.1f} ×{x["speed"]})')
print("成片", round(cur, 1), "s")
subprocess.run([F, "-loglevel", "error", "-y", "-i", os.path.join(D, "clip.mp4"), "-filter_complex", fc, "-map", "[out]",
                "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", os.path.join(D, "cut.mp4")], check=True)
print("→", os.path.join(D, "cut.mp4"))
