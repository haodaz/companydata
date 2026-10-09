"""
把旁白摆到时间轴上、按字数切中文字幕、混音、烧字幕。照 zhiji-yida/docs/video/assemble.py：
字体 PingFang SC、切行按字数；这里是整屏网页，字幕放画面下方居中，深色半透明底。

  PYTHONIOENCODING=utf-8 python3 scripts/video/assemble.py <录制目录> <旁白.json> <配音目录> [成片名]   # → <目录>/<成片名>.mp4、<成片名>.srt
  同一条画面可以配不同的旁白（产品视角 / 学生视角），只换旁白和配音目录、换个成片名就行，不用重录。
"""
import json, subprocess, re, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
F = os.path.join(ROOT, "node_modules", "ffmpeg-static", "ffmpeg")
D, NARR, TTS = sys.argv[1], sys.argv[2], sys.argv[3]
NAME = sys.argv[4] if len(sys.argv) > 4 else "final"
tl = json.load(open(os.path.join(D, "timeline.json"), encoding="utf-8"))
dur = {d["id"]: d["dur"] for d in json.load(open(os.path.join(TTS, "durations.json"), encoding="utf-8"))}
narr = json.load(open(NARR, encoding="utf-8"))

# 每段旁白从它对应 clip 第一次出现的时间点开始；同一 clip 的第二段接在第一段后面
first = {}
for seg in tl: first.setdefault(seg["clip"], seg["start"])
starts, prev_end, seen = [], 0.0, set()
for n in narr:
    if n["id"] not in dur or n["clip"] not in first: continue
    t = first[n["clip"]]
    if n["clip"] in seen: t = prev_end + 0.4
    # "at"：在这个画面里往后挪几秒再说（画面讲到那一步再开口，比如家属追问那一步）
    if "at" in n: t = max(t, first[n["clip"]] + n["at"])
    s = max(t + 0.3, prev_end + 0.3)
    starts.append((n["id"], s)); prev_end = s + dur[n["id"]]; seen.add(n["clip"])

def ts(x):
    h = int(x // 3600); m = int(x % 3600 // 60); s = x % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}".replace(".", ",")

def wrap(t, n=26):
    t = t.strip(); lines = []
    while len(t) > n and len(lines) < 1:
        cut = max([i + 1 for i, c in enumerate(t[:n]) if c in "，。；：、！？"] or [n])
        lines.append(t[:cut]); t = t[cut:]
    lines.append(t)
    return "\n".join(lines)

def pieces(text, limit=32):
    out = []
    for sent in [x for x in re.findall(r"[^。！？]+[^。！？]?", text) if x.strip()]:
        sent = sent.strip()
        if len(sent) <= limit: out.append(sent); continue
        buf = ""
        for part in re.findall(r"[^，；：]+[，；：]?", sent):
            if buf and len(buf) + len(part) > limit: out.append(buf); buf = part
            else: buf += part
        if buf: out.append(buf)
    merged = []
    for x in out:
        if merged and len(x) < 8 and len(merged[-1]) + len(x) <= limit: merged[-1] += x
        else: merged.append(x)
    return merged

cues, k = [], 1
text_of = {n["id"]: n["text"] for n in narr}
for nid, s in starts:
    merged = pieces(text_of[nid]); total = sum(len(x) for x in merged); t = s
    for x in merged:
        d = dur[nid] * len(x) / total
        cues.append(f"{k}\n{ts(t)} --> {ts(t + d - 0.05)}\n{wrap(x)}\n"); k += 1; t += d
srt = os.path.join(D, f"{NAME}.srt" if NAME != "final" else "subs.srt")
open(srt, "w", encoding="utf-8").write("\n".join(cues))

video_end = tl[-1]["end"]
inputs = ["-i", os.path.join(D, "cut.mp4")]; fl = []; mix = ""
for i, (nid, s) in enumerate(starts):
    inputs += ["-i", os.path.join(TTS, f"{nid}.wav")]
    fl.append(f"[{i+1}:a]aresample=48000,adelay={int(s*1000)}|{int(s*1000)},volume=1.0[a{i}]"); mix += f"[a{i}]"
# 左下角 Next.js 开发模式的「N」角标用 delogo 抹掉（本地录的才有）
# 画面下方居中，白字深色半透明底（BorderStyle=3 不透明框；BackColour 前两位是透明度）
style = "FontName=PingFang SC,FontSize=13,PrimaryColour=&H00FFFFFF,BackColour=&H66201A14,BorderStyle=3,Outline=6,Shadow=0,Alignment=2,MarginV=16,Spacing=0.6"
pad = max(0.0, prev_end + 1.0 - video_end)   # 旁白比画面长：最后一帧停住补齐
fc = ";".join(fl) + f";{mix}amix=inputs={len(starts)}:normalize=0,alimiter=limit=0.9[aout];[0:v]delogo=x=16:y=1008:w=60:h=60,tpad=stop_mode=clone:stop_duration={pad:.2f},subtitles={srt}:force_style='{style}'[vout]"
out = os.path.join(D, f"{NAME}.mp4")
subprocess.run([F, "-loglevel", "error", "-y", *inputs, "-filter_complex", fc, "-map", "[vout]", "-map", "[aout]",
                "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", out], check=True)
print("旁白起点:", [(n, round(s, 1)) for n, s in starts]); print("最后一句结束于", round(prev_end, 1), "s；画面", round(video_end, 1), "s"); print("→", out)
