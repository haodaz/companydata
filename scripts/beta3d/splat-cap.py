"""
3D beta：给已经训练好的 .splat 去拉丝——把每个高斯的长轴截到「中轴（或短轴）的 K 倍」且不超过 M（2026-10-21 手套箱间总结）。
重建出来高斯普遍很细长（长宽比中位数几十）时，大的针状高斯会在初始机位前面拉出满屏亮线；截短后物件轮廓清楚很多，代价是空隙处露出底色。
  .venv/bin/python scripts/beta3d/splat-cap.py <in.splat> <out.splat> [--k 2] [--max 0.9]
手套箱间试过：k=3 max=1.5 明显改善；k=2 max=0.9 最清楚（采用）；k=2.5 max=1.2 介于两者之间。直接删掉针状高斯（不截短）反而更糊。
"""
import argparse, numpy as np
ap = argparse.ArgumentParser(); ap.add_argument('inp'); ap.add_argument('out'); ap.add_argument('--k', type=float, default=2); ap.add_argument('--max', type=float, default=0.9)
a = ap.parse_args()
d = np.fromfile(a.inp, dtype=[('p', '<f4', 3), ('s', '<f4', 3), ('c', 'u1', 4), ('r', 'u1', 4)])
srt = np.sort(d['s'], 1)
cap = np.minimum(np.maximum(srt[:, 1] * a.k, srt[:, 0] * a.k), a.max)
before = np.median(srt[:, 2] / np.maximum(srt[:, 0], 1e-6))
d['s'] = np.minimum(d['s'], cap[:, None])
d.tofile(a.out)
srt2 = np.sort(d['s'], 1)
print(f'{len(d)} 个高斯，长宽比中位数 {before:.0f} → {np.median(srt2[:, 2] / np.maximum(srt2[:, 0], 1e-6)):.0f}')
