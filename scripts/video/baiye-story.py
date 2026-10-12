"""
百业长片（2026-10-12）：「在 AI 不断迭代的时代，平方智能始终的核心价值」——原理动图（card）与百业产品真实画面（clip / full）一页接一页。
页面：public/video/baiye-story.html（只用来出片，不是对外页面）；旁白：baiye-story.narration.json；画面怎么切：baiye-story.clips.json。

  node scripts/video/tts.mjs scripts/video/baiye-story.narration.json <配音目录>
  PYTHONIOENCODING=utf-8 python3 scripts/video/baiye-story.py <工作目录> <配音目录> [成片路径] [--only id,id] [--skip-render]

每页时长 = 旁白 + 留白；每页旁白从该页开头 0.6 s 起念。改了旁白重出那几段配音，再跑一遍本脚本即可。
"""
import json, io, os, sys, subprocess, re
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
F = os.path.join(ROOT, "node_modules", "ffmpeg-static", "ffmpeg")
HERE = os.path.join(ROOT, "scripts", "video")
args = [a for a in sys.argv[1:] if not a.startswith("--")]
W, TTS = args[0], args[1]
OUT = args[2] if len(args) > 2 else os.path.join(W, "baiye-story.mp4")
ONLY = None
for i, a in enumerate(sys.argv):
    if a == "--only": ONLY = set(sys.argv[i + 1].split(","))
SKIP = "--skip-render" in sys.argv
FPS = 25
os.makedirs(W, exist_ok=True)

narr = json.load(io.open(os.path.join(HERE, "baiye-story.narration.json"), encoding="utf-8"))
clips = json.load(io.open(os.path.join(HERE, "baiye-story.clips.json"), encoding="utf-8"))
dur = {d["id"]: d["dur"] for d in json.load(io.open(os.path.join(TTS, "durations.json"), encoding="utf-8"))}
PAD = {"intro": 2.4, "end": 3.0}
LEAD = {"intro": 1.2}
D = {n["id"]: round(dur[n["id"]] + LEAD.get(n["id"], 0.6) + PAD.get(n["id"], 0.9), 2) for n in narr}

# 1. 时长 / 画面字幕 → 页面
story = {"scenes": {k: {"dur": v, "cuts": [c[2] for c in clips["clips"].get(k, [])]} for k, v in D.items()}}
sd = os.path.join(ROOT, "public", "video", "baiye-story"); os.makedirs(sd, exist_ok=True)
io.open(os.path.join(sd, "story.js"), "w", encoding="utf-8").write("window.STORY = " + json.dumps(story, ensure_ascii=False) + ";\n")

# 2. 渲染
if not SKIP:
    subprocess.run(["node", os.path.join(HERE, "baiye-story-render.mjs"), W, str(FPS)] + ([",".join(ONLY)] if ONLY else []), cwd=ROOT, check=True)
scenes = json.load(io.open(os.path.join(W, "scenes.json"), encoding="utf-8"))
ids = [n["id"] for n in narr]
assert [s["id"] for s in scenes] == ids, ("页面场景和旁白对不上", [s["id"] for s in scenes], ids)

# 画框圆角遮罩
mask = os.path.join(W, "mask.png")
if not os.path.exists(mask):
    R = 22
    e = (f"if(lt(X,{R})*lt(Y,{R}),if(lte(hypot({R}-X,{R}-Y),{R}),255,0),"
         f"if(gt(X,W-{R})*lt(Y,{R}),if(lte(hypot(X-(W-{R}),{R}-Y),{R}),255,0),"
         f"if(lt(X,{R})*gt(Y,H-{R}),if(lte(hypot({R}-X,Y-(H-{R})),{R}),255,0),"
         f"if(gt(X,W-{R})*gt(Y,H-{R}),if(lte(hypot(X-(W-{R}),Y-(H-{R})),{R}),255,0),255))))")
    subprocess.run([F, "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=black:s=1600x775", "-vf", f"format=gray,geq=lum='{e}'", "-frames:v", "1", mask], check=True)

def src_crop(key):
    # 旧片子底部烧了字幕：裁掉下沿；实拍录屏（1920×1024）去掉上沿标题条
    return "crop=iw:ih*0.86:0:0" if key in ("Y", "S", "D3") else "crop=iw:ih*0.9:0:ih*0.05"

ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-r", str(FPS)]
seg_dir = os.path.join(W, "seg"); os.makedirs(seg_dir, exist_ok=True)
segs = []
for s in scenes:
    sid, kind, d = s["id"], s["kind"], D[s["id"]]
    out = os.path.join(seg_dir, f"{sid}.mp4"); segs.append(out)
    if ONLY and sid not in ONLY and os.path.exists(out): continue
    if kind == "card":
        subprocess.run([F, "-loglevel", "error", "-y", "-framerate", str(FPS), "-i", os.path.join(W, "frames", sid, "%05d.jpg"), *ENC, out], check=True)
    else:
        cuts = clips["clips"][sid]; L = d / len(cuts); parts = []
        for k, (key, st, cap) in enumerate(cuts):
            src = os.path.expanduser(clips["sources"][key]); chrome = os.path.join(W, "chrome", f"{sid}-{k}.png")
            po = os.path.join(seg_dir, f"{sid}-{k}.mp4"); parts.append(po)
            if kind == "full":
                fc = (f"[1:v]{src_crop(key)},scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps={FPS},tpad=stop_mode=clone:stop_duration=30[v];"
                      f"[v][0:v]overlay=0:0,format=yuv420p[o]")
                inp = ["-loop", "1", "-i", chrome, "-ss", str(st), "-i", src]
            else:
                fc = (f"[1:v]{src_crop(key)},scale=1600:775:force_original_aspect_ratio=increase,crop=1600:775,setsar=1,fps={FPS},tpad=stop_mode=clone:stop_duration=30,format=rgba[v];"
                      f"[2:v]format=gray,scale=1600:775,setsar=1[m];[v][m]alphamerge[vm];[0:v][vm]overlay=160:200,format=yuv420p[o]")
                inp = ["-loop", "1", "-i", chrome, "-ss", str(st), "-i", src, "-loop", "1", "-i", mask]
            subprocess.run([F, "-loglevel", "error", "-y", *inp, "-filter_complex", fc, "-map", "[o]", "-an", "-t", f"{L:.3f}", *ENC, po], check=True)
        lst = os.path.join(seg_dir, f"{sid}.txt")
        io.open(lst, "w", encoding="utf-8").write("".join(f"file '{p}'\n" for p in parts))
        subprocess.run([F, "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", out], check=True)
    print("段", sid, kind, f"{d:.1f}s")

# 3. 拼接
lst = os.path.join(W, "all.txt"); io.open(lst, "w", encoding="utf-8").write("".join(f"file '{p}'\n" for p in segs))
allv = os.path.join(W, "all.mp4")
subprocess.run([F, "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", allv], check=True)

# 4. 旁白 + 字幕（切字幕的规则同 assemble.py）
starts, t = [], 0.0
for n in narr:
    starts.append((n["id"], t + LEAD.get(n["id"], 0.6))); t += D[n["id"]]
total = t

def ts(x):
    h = int(x // 3600); m = int(x % 3600 // 60); s = x % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}".replace(".", ",")

def pieces(text, limit=30):
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
    ps = pieces(text_of[nid]); tot = sum(len(x) for x in ps); tt = s
    for x in ps:
        dd = dur[nid] * len(x) / tot
        cues.append(f"{k}\n{ts(tt)} --> {ts(tt + dd - 0.05)}\n{x.rstrip('，；：。')}\n"); k += 1; tt += dd
srt = os.path.join(W, "subs.srt"); io.open(srt, "w", encoding="utf-8").write("\n".join(cues))

inputs = ["-i", allv]; fl = []; mix = ""
for i, (nid, s) in enumerate(starts):
    inputs += ["-i", os.path.join(TTS, f"{nid}.wav")]
    fl.append(f"[{i+1}:a]aresample=48000,adelay={int(s*1000)}|{int(s*1000)}[a{i}]"); mix += f"[a{i}]"
style = "FontName=PingFang SC,FontSize=13,PrimaryColour=&H00FFFFFF,BackColour=&H66201A14,BorderStyle=3,Outline=6,Shadow=0,Alignment=2,MarginV=12,Spacing=0.6"
fc = ";".join(fl) + f";{mix}amix=inputs={len(starts)}:normalize=0,alimiter=limit=0.9[aout];[0:v]subtitles={srt}:force_style='{style}'[vout]"
subprocess.run([F, "-loglevel", "error", "-y", *inputs, "-filter_complex", fc, "-map", "[vout]", "-map", "[aout]",
                "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-t", f"{total:.2f}", OUT], check=True)
print(f"总长 {total:.1f}s → {OUT}")
