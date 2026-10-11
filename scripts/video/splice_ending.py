# -*- coding: utf-8 -*-
"""
演示片收尾：把剪好的 cut.mp4 里「cert」那段换成几张证书淡入淡出（最后可以接一小段成绩页的动态），
「end」那段换成一张封面静帧（几秒就够），同时改写 timeline.json，让 assemble.py 的旁白对得上新时长。
  python3 scripts/video/splice_ending.py <片子目录> <封面.png> <每张证书停几秒> <结尾秒数> <证书1.png> <证书2.png> ... [--tail 成绩页.mp4]
"""
import json, os, subprocess, sys

F = os.path.join(os.path.dirname(__file__), '..', '..', 'node_modules', 'ffmpeg-static', 'ffmpeg')
args = sys.argv[1:]
tail = None
if '--tail' in args:
    i = args.index('--tail'); tail = args[i + 1]; args = args[:i] + args[i + 2:]
D, cover, per, end_len, *stills = args
per, end_len, X = float(per), float(end_len), 0.6

tl = json.load(open(os.path.join(D, 'timeline.json'), encoding='utf-8'))
cert = next(x for x in tl if x['clip'] == 'cert')
src = os.path.join(D, 'cut.mp4'); work = os.path.join(D, 'cut-before-ending.mp4')
if not os.path.exists(work): os.replace(src, work)

# 证书段：几张静帧淡入淡出，最后（可选）接成绩页那一小段动态
inputs, chains = [], []
for i, p in enumerate(stills):
    inputs += ['-loop', '1', '-t', f'{per:.3f}', '-i', p]
    chains.append(f'[{i}]scale=1920:1080,fps=30,format=yuv420p,setsar=1[s{i}]')
n = len(stills)
if tail:
    inputs += ['-i', tail]; chains.append(f'[{n}]scale=1920:1080,fps=30,format=yuv420p,setsar=1,setpts=PTS-STARTPTS[s{n}]')
parts = n + (1 if tail else 0)
cur, length = 's0', per
for i in range(1, parts):
    nxt_len = per if i < n else float(subprocess.run([F, '-i', tail], stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True).stderr.split('Duration: ')[1].split(',')[0].split(':')[-1])
    chains.append(f'[{cur}][s{i}]xfade=transition=fade:duration={X}:offset={length - X:.3f}[x{i}]')
    cur, length = f'x{i}', length - X + nxt_len
cert_mp4 = os.path.join(D, 'ending-certs.mp4')
subprocess.run([F, '-loglevel', 'error', '-y', *inputs, '-filter_complex', ';'.join(chains), '-map', f'[{cur}]', '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', cert_mp4], check=True)

end_mp4 = os.path.join(D, 'ending-cover.mp4')
subprocess.run([F, '-loglevel', 'error', '-y', '-loop', '1', '-t', f'{end_len:.3f}', '-i', cover, '-vf', 'scale=1920:1080,fps=30,format=yuv420p,setsar=1,fade=t=in:st=0:d=0.6',
                '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', end_mp4], check=True)

S = cert['start']
subprocess.run([F, '-loglevel', 'error', '-y', '-i', work, '-i', cert_mp4, '-i', end_mp4, '-filter_complex',
                f'[0:v]trim=0:{S},setpts=PTS-STARTPTS,fps=30,format=yuv420p,setsar=1[a];[1:v]fps=30,format=yuv420p,setsar=1[b];[2:v]fps=30,format=yuv420p,setsar=1[c];[a][b][c]concat=n=3:v=1:a=0[v]',
                '-map', '[v]', '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', src], check=True)

# 改写时间线：cert / end 两段换成新长度
new = [x for x in tl if x['clip'] not in ('cert', 'end')]
new.append({'clip': 'cert', 'start': round(S, 2), 'end': round(S + length, 2), 'src': [0, 0], 'speed': 1})
new.append({'clip': 'end', 'start': round(S + length, 2), 'end': round(S + length + end_len, 2), 'src': [0, 0], 'speed': 1})
json.dump(new, open(os.path.join(D, 'timeline.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'证书段 {length:.1f}s · 结尾 {end_len:.1f}s · 成片 {S + length + end_len:.1f}s → {src}')
