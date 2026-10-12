"""
真实 360° 素材（GoPro Max / Insta360 导出的等距柱状 2:1 视频）→ 一组普通透视画面，喂给 sfm.py --images 估机位。
  .venv/bin/python scripts/beta3d/equirect.py <全景视频.mp4> <输出目录> [--every 15] [--yaws 8] [--pitches 0] [--fov 90] [--size 1024]
每隔 every 帧取一帧，每帧朝 yaws 个水平方向各「拍」一张 fov 度的方图（ffmpeg v360，一遍解码、split 成多路）。
所有画面同一台 PINHOLE 相机（焦距 = size/2 / tan(fov/2)），参数写进 <输出目录>/camera.json，sfm.py 用 --camera-params 固定住。
文件名 f<帧>_p<俯仰>_y<朝向>.jpg：按名字排序是「先帧后方向」，顺序匹配的 overlap 要盖住两三帧（sfm.py --overlap yaws×3）。
脚下（拿相机的人、自拍杆）：不渲染往下看的方向——俯仰 < -20° 直接拒绝；fov 90 + 俯仰 0 只看到水平线下 45°。
"""
import argparse, json, math, os, re, shutil, subprocess, sys, time

ap = argparse.ArgumentParser()
ap.add_argument('video'); ap.add_argument('out')
ap.add_argument('--every', type=int, default=15, help='每几帧取一帧（30fps 素材 15 = 每秒 2 帧）')
ap.add_argument('--yaws', type=int, default=8, help='每帧水平拍几个方向（均分 360°）')
ap.add_argument('--pitches', default='0', help='俯仰角列表，逗号隔开，如 0,30（往上看一圈）；不许低于 -20')
ap.add_argument('--fov', type=float, default=90, help='每张透视图的视场角（度，方图）')
ap.add_argument('--size', type=int, default=1024, help='每张透视图边长（像素）')
ap.add_argument('--yaw0', type=float, default=0, help='第一个方向相对画面正中的偏角')
ap.add_argument('--ffmpeg', default=os.path.join(os.path.dirname(__file__), '..', '..', 'node_modules', 'ffmpeg-static', 'ffmpeg'))
a = ap.parse_args()

pitches = [float(p) for p in a.pitches.split(',') if p.strip()]
if any(p < -20 for p in pitches): sys.exit('俯仰低于 -20° 会拍到脚下的人和自拍杆，不渲染')
views = [(p, a.yaw0 + 360 * k / a.yaws) for p in pitches for k in range(a.yaws)]
img = os.path.join(a.out, 'images'); tmp = os.path.join(a.out, '_raw')
shutil.rmtree(a.out, ignore_errors=True); os.makedirs(img); os.makedirs(tmp)

# 一遍解码：先抽帧，再 split 成每个方向一路，各自 v360 成透视图
t0 = time.time()
yawn = lambda y: ((y + 180) % 360) - 180   # v360 的 yaw 取 -180…180
chains = [f"[s{i}]v360=input=e:output=flat:yaw={yawn(y):.3f}:pitch={p:.3f}:h_fov={a.fov}:v_fov={a.fov}:w={a.size}:h={a.size}:interp=cubic[o{i}]" for i, (p, y) in enumerate(views)]
fc = f"[0:v]select='not(mod(n\\,{a.every}))',split={len(views)}" + ''.join(f'[s{i}]' for i in range(len(views))) + ';' + ';'.join(chains)
cmd = [a.ffmpeg, '-loglevel', 'error', '-i', a.video, '-filter_complex', fc]
for i in range(len(views)): cmd += ['-map', f'[o{i}]', '-fps_mode', 'vfr', '-q:v', '2', os.path.join(tmp, f'v{i}_%04d.jpg')]
subprocess.run(cmd, check=True)

# 改名成「先帧后方向」，放进 images/
n = 0
for f in os.listdir(tmp):
    m = re.match(r'v(\d+)_(\d+)\.jpg$', f)
    if not m: continue
    p, y = views[int(m[1])]
    shutil.move(os.path.join(tmp, f), os.path.join(img, f'f{int(m[2]):04d}_p{int(round(p)) + 90:03d}_y{int(round(y)) % 360:03d}.jpg')); n += 1
shutil.rmtree(tmp)
frames = n // len(views)
focal = a.size / 2 / math.tan(math.radians(a.fov) / 2)
cam = {'model': 'PINHOLE', 'params': [round(focal, 3), round(focal, 3), a.size / 2, a.size / 2], 'size': a.size, 'fov': a.fov,
       'views': len(views), 'frames': frames, 'images': n, 'every': a.every, 'pitches': pitches, 'yaws': a.yaws, 'seconds': round(time.time() - t0)}
json.dump(cam, open(os.path.join(a.out, 'camera.json'), 'w'))
print(json.dumps(cam, ensure_ascii=False), flush=True)
