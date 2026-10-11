"""
3D beta：Brush 导出的 3D 高斯 .ply → 网页渲染库最稳的 .splat 格式（每个高斯 32 字节：位置 3f、尺度 3f、颜色 RGBA 4u8、旋转 4u8）。
按「尺度体积 × 不透明度」从大到小排，网页先画大的。只留颜色的基础项（不带随视角变化的 SH），文件小一个量级。
  .venv/bin/python scripts/beta3d/ply2splat.py <in.ply> <out.splat> [--min-alpha 0.02]
"""
import argparse, numpy as np

ap = argparse.ArgumentParser(); ap.add_argument('ply'); ap.add_argument('out'); ap.add_argument('--min-alpha', type=float, default=0.02)
a = ap.parse_args()
with open(a.ply, 'rb') as f:
    props, n = [], 0
    while True:
        l = f.readline().decode().strip()
        if l.startswith('element vertex'): n = int(l.split()[-1])
        if l.startswith('property'): props.append(l.split()[-1])
        if l == 'end_header': break
    d = np.frombuffer(f.read(n * 4 * len(props)), dtype='<f4').reshape(n, len(props))
P = {k: d[:, i] for i, k in enumerate(props)}

xyz = np.stack([P['x'], P['y'], P['z']], 1).astype('<f4')
scale = np.exp(np.stack([P['scale_0'], P['scale_1'], P['scale_2']], 1)).astype('<f4')
alpha = 1 / (1 + np.exp(-P['opacity']))
SH0 = 0.28209479177387814
rgb = np.clip((0.5 + SH0 * np.stack([P['f_dc_0'], P['f_dc_1'], P['f_dc_2']], 1)) * 255, 0, 255)
q = np.stack([P['rot_0'], P['rot_1'], P['rot_2'], P['rot_3']], 1)
q = q / np.linalg.norm(q, axis=1, keepdims=True)
keep = alpha >= a.min_alpha
order = np.argsort(-(scale.prod(1) * alpha)[keep])
idx = np.nonzero(keep)[0][order]

buf = np.zeros(len(idx), dtype=[('p', '<f4', 3), ('s', '<f4', 3), ('c', 'u1', 4), ('r', 'u1', 4)])
buf['p'] = xyz[idx]; buf['s'] = scale[idx]
buf['c'] = np.concatenate([rgb[idx], (alpha[idx] * 255)[:, None]], 1).astype('u1')
buf['r'] = np.clip(q[idx] * 128 + 128, 0, 255).astype('u1')
buf.tofile(a.out)
print(f'{n} → {len(idx)} 个高斯（去掉近乎透明的 {n - len(idx)} 个），{buf.nbytes / 1e6:.1f} MB')
