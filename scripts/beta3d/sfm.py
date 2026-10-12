"""
3D beta 探索：视频 → 抽帧 → COLMAP（pycolmap）估每帧相机位置 → Brush 能直接训练的目录（images/ + sparse/0）。
  .venv/bin/python scripts/beta3d/sfm.py <视频.mp4> <输出目录> [--every 2] [--width 1280]
视频是 Veo 生成的「绕场一圈」：相邻帧重叠大，用顺序匹配（sequential）就够，比全量匹配快很多。
"""
import argparse, os, shutil, subprocess, sys, time
import pycolmap

ap = argparse.ArgumentParser()
ap.add_argument('video'); ap.add_argument('out')
ap.add_argument('--every', type=int, default=2, help='每几帧取一帧')
ap.add_argument('--width', type=int, default=1280)
ap.add_argument('--model', default='SIMPLE_RADIAL', help='相机模型；鱼眼画面用 OPENCV_FISHEYE')
ap.add_argument('--ffmpeg', default=os.path.join(os.path.dirname(__file__), '..', '..', 'node_modules', 'ffmpeg-static', 'ffmpeg'))
a = ap.parse_args()

img = os.path.join(a.out, 'images'); sparse = os.path.join(a.out, 'sparse'); db = os.path.join(a.out, 'database.db')
shutil.rmtree(a.out, ignore_errors=True); os.makedirs(img); os.makedirs(sparse)

t0 = time.time()
subprocess.run([a.ffmpeg, '-loglevel', 'error', '-i', a.video, '-vf', f"select='not(mod(n\\,{a.every}))',scale={a.width}:-2", '-vsync', 'vfr', '-q:v', '2', os.path.join(img, 'f%04d.jpg')], check=True)
n = len(os.listdir(img))
print(f'抽帧 {n} 张', flush=True)

ro = pycolmap.ImageReaderOptions(); ro.camera_model = a.model
pycolmap.extract_features(db, img, camera_mode=pycolmap.CameraMode.SINGLE, reader_options=ro)
print(f'特征点提取完 {time.time() - t0:.0f}s', flush=True)
pycolmap.match_sequential(db)
print(f'顺序匹配完 {time.time() - t0:.0f}s', flush=True)
maps = pycolmap.incremental_mapping(db, img, sparse)
if not maps:
    # 大面积纯色（白火箭、玻璃顶）时顺序匹配不够：换全量匹配、放宽初始化再试一次
    print('顺序匹配没建起来，换全量匹配重试…', flush=True)
    pycolmap.match_exhaustive(db)
    opt = pycolmap.IncrementalPipelineOptions()
    opt.min_num_matches = 10; opt.mapper.init_min_num_inliers = 50; opt.mapper.abs_pose_min_num_inliers = 15
    maps = pycolmap.incremental_mapping(db, img, sparse, options=opt)
if not maps:
    print('❌ 重建失败：没有一个模型', flush=True); sys.exit(1)
best = max(maps.values(), key=lambda r: r.num_reg_images())
print(f'模型 {len(maps)} 个，最大的注册了 {best.num_reg_images()}/{n} 帧，3D 点 {best.num_points3D()} 个，{time.time() - t0:.0f}s', flush=True)
# Brush 读 sparse/0：把最大的那个模型放到 0
dst = os.path.join(sparse, '0')
for k in list(maps.keys()):
    p = os.path.join(sparse, str(k))
    if maps[k] is best and p != dst:
        shutil.rmtree(dst, ignore_errors=True); shutil.move(p, dst)
best.write(dst)
print('✅', a.out, flush=True)
