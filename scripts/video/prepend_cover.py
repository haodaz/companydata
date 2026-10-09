# -*- coding: utf-8 -*-
"""
给成片前面接一张封面（默认 2.5 秒，最后 0.4 秒淡出），字幕整体往后挪同样的时间。
几条片子开头画面一样（都从百业列表开始）时，靠封面区分是哪一版。
  python3 scripts/video/prepend_cover.py <成片.mp4> <封面.png> <字幕.srt> <输出.mp4> [秒数]
输出旁边写同名 .srt。封面用 1920×1080 的 png（HTML 截图即可）。
"""
import os, re, subprocess, sys

F = os.path.join(os.path.dirname(__file__), "..", "..", "node_modules", "ffmpeg-static", "ffmpeg")
src, cover, srt, out = sys.argv[1:5]
SEC = float(sys.argv[5]) if len(sys.argv) > 5 else 2.5

fc = (f"[0:v]scale=1920:1080,fps=30,format=yuv420p,fade=t=out:st={SEC - 0.4}:d=0.4[c];"
      f"[1:v]fps=30,format=yuv420p,setsar=1[v];"
      f"[c][2:a][v][1:a]concat=n=2:v=1:a=1[vo][ao]")
subprocess.run([F, "-loglevel", "error", "-y",
                "-loop", "1", "-t", str(SEC), "-i", cover,
                "-i", src,
                "-f", "lavfi", "-t", str(SEC), "-i", "anullsrc=r=48000:cl=mono",
                "-filter_complex", fc, "-map", "[vo]", "-map", "[ao]",
                "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out], check=True)


def shift(m):
    h, mi, s, ms = map(int, m.groups())
    t = ((h * 60 + mi) * 60 + s) * 1000 + ms + int(SEC * 1000)
    return "%02d:%02d:%02d,%03d" % (t // 3600000, t // 60000 % 60, t // 1000 % 60, t % 1000)


text = open(srt, encoding="utf-8").read()
open(os.path.splitext(out)[0] + ".srt", "w", encoding="utf-8").write(re.sub(r"(\d+):(\d+):(\d+),(\d+)", shift, text))
print("→", out)
