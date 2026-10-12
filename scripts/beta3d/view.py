"""
3D beta：从 COLMAP 重建里算查看器的初始视角——挑一帧机位当「窗户」的位置，看向场景中心。
  .venv/bin/python scripts/beta3d/view.py <sfm 目录> [--frame 中间|序号]
输出 JSON：position / lookAt / up（世界坐标，和 Brush 导出的 ply 一致），以及机位沿视频轨迹的左右范围（头部追踪的摆动幅度参考）。

挑哪一帧（2026-10-12，沥青摊铺的教训）：以前固定用视频中间那帧，沥青那条视频中段贴着路面拍，
初始视角一打开就是满屏近处的糊高斯。现在按「近处点占比」给每帧打分（离镜头不到中位深度 25% 的点算近处），
近处点最少的帧里取离中间最近的那帧；--frame 可以手动指定。
"""
import argparse, json
import numpy as np
import pycolmap

ap = argparse.ArgumentParser(); ap.add_argument('sfm'); ap.add_argument('--frame', default='auto')
a = ap.parse_args()
rec = pycolmap.Reconstruction(f'{a.sfm}/sparse/0')
imgs = sorted(rec.images.values(), key=lambda im: im.name)
pts = np.array([p.xyz for p in rec.points3D.values()])
cams = []
for im in imgs:
    w2c = im.cam_from_world() if callable(im.cam_from_world) else im.cam_from_world
    R = np.array(w2c.rotation.matrix()); t = np.array(w2c.translation)
    c = -R.T @ t; fwd = R[2]; up = -R[1]          # COLMAP 相机 y 朝下，世界里的「上」是 -y 轴；z 朝前
    d = (pts - c) @ fwd; vis = d > 0
    med = float(np.median(d[vis])) if vis.any() else 1.0
    near = float(((d > 0) & (d < med * 0.25)).sum() / max(1, vis.sum()))
    cams.append({'c': c, 'fwd': fwd, 'up': up, 'depth': med, 'near': near})
n = len(cams); mid = n // 2
if a.frame == 'auto':
    best = min(c['near'] for c in cams)
    ok = [i for i, c in enumerate(cams) if c['near'] <= best + 0.01]
    i = min(ok, key=lambda k: abs(k - mid))
elif a.frame == 'mid':
    i = mid
else:
    i = int(a.frame)
c = cams[i]
look = c['c'] + c['fwd'] * max(c['depth'], 0.5)
span = float(np.linalg.norm(cams[-1]['c'] - cams[0]['c']))
r = lambda v: [round(float(x), 4) for x in v]
print(json.dumps({
  'position': r(c['c']), 'lookAt': r(look), 'up': r(c['up']),
  'frame': i, 'frameName': imgs[i].name, 'nearRatio': round(c['near'], 4), 'midNearRatio': round(cams[mid]['near'], 4),
  'depth': round(c['depth'], 3), 'pathSpan': round(span, 3), 'frames': n, 'points': len(pts),
}, ensure_ascii=False))
