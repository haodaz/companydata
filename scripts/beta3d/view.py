"""
3D beta：从 COLMAP 重建里算查看器的初始视角——用视频中间那一帧的机位当「窗户」的位置，看向场景中心。
  .venv/bin/python scripts/beta3d/view.py <sfm 目录>
输出 JSON：position / lookAt / up（世界坐标，和 Brush 导出的 ply 一致），以及机位沿视频轨迹的左右范围（头部追踪的摆动幅度参考）。
"""
import json, sys
import numpy as np
import pycolmap

rec = pycolmap.Reconstruction(f'{sys.argv[1]}/sparse/0')
imgs = sorted(rec.images.values(), key=lambda im: im.name)
centers, ups, fwds = [], [], []
for im in imgs:
    w2c = im.cam_from_world() if callable(im.cam_from_world) else im.cam_from_world
    R = np.array(w2c.rotation.matrix()); t = np.array(w2c.translation)
    centers.append(-R.T @ t)
    ups.append(-R[1])            # COLMAP 相机 y 朝下，世界里的「上」是 -y 轴
    fwds.append(R[2])            # 相机 z 朝前
centers = np.array(centers)
pts = np.array([p.xyz for p in rec.points3D.values()])
mid = centers[len(centers) // 2]
up = np.mean(ups, axis=0); up /= np.linalg.norm(up)
fwd = fwds[len(fwds) // 2]
# 看向：沿中间那一帧的视线，取离相机最近的点云中位深度
d = np.median((pts - mid) @ fwd)
look = mid + fwd * max(d, 0.5)
span = float(np.linalg.norm(centers[-1] - centers[0]))
print(json.dumps({
  'position': [round(float(v), 4) for v in mid],
  'lookAt': [round(float(v), 4) for v in look],
  'up': [round(float(v), 4) for v in up],
  'depth': round(float(d), 3), 'pathSpan': round(span, 3), 'frames': len(imgs), 'points': len(pts),
}, ensure_ascii=False))
