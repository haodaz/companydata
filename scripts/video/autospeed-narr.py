"""按旁白时长自动定每段速度：画面段长 = 旁白长 + 余量；旁白比画面长就放慢，短就加速（0.45–3 倍）。
  PYTHONIOENCODING=utf-8 python3 scripts/video/autospeed-narr.py <录制目录> <旁白.json> <配音目录> <输出 speed.json> [余量秒=0.8]
"""
import json, sys, os, subprocess, re
D, NARR, TTS, OUT = sys.argv[1:5]; PAD = float(sys.argv[5]) if len(sys.argv) > 5 else 0.8
F = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "node_modules", "ffmpeg-static", "ffmpeg")
marks = json.load(open(os.path.join(D, "marks.json"), encoding="utf-8"))["marks"]
r = subprocess.run([F, "-i", os.path.join(D, "clip.mp4")], stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", r.stderr); END = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
dur = {d["id"]: d["dur"] for d in json.load(open(os.path.join(TTS, "durations.json"), encoding="utf-8"))}
narr = {}
for n in json.load(open(NARR, encoding="utf-8")): narr[n["clip"]] = narr.get(n["clip"], 0) + dur.get(n["id"], 0) + 0.4
speed = {}
for i, mk in enumerate(marks):
    a = mk["vt"]; b = marks[i + 1]["vt"] if i + 1 < len(marks) else END; src = b - a
    want = narr.get(mk["note"], 0) + PAD
    sp = src / want if want > 0 else 1.0
    speed[mk["note"]] = round(max(0.25, min(3.0, sp)), 2)   # 静态页慢放到 0.25 也不难看，旁白必须说完
    print(f'{mk["note"]:14s} 画面 {src:5.1f}s  旁白 {narr.get(mk["note"], 0):5.1f}s  → ×{speed[mk["note"]]}')
json.dump(speed, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
