"""
3D beta 探索：视频 → 抽帧 → COLMAP（pycolmap）估每帧相机位置 → Brush 能直接训练的目录（images/ + sparse/0）。
  .venv/bin/python scripts/beta3d/sfm.py <视频.mp4> <输出目录> [--every 2] [--width 1280]
视频是 Veo 生成的「绕场一圈」：相邻帧重叠大，用顺序匹配（sequential）就够，比全量匹配快很多。
真实 360° 素材：先用 equirect.py 切成透视图，再
  sfm.py - <输出目录> --images <equirect 输出>/images --model PINHOLE --camera-params fx,fy,cx,cy --overlap 24
（--images 跳过抽帧、直接拷图；给了 --camera-params 就固定内参不优化；--overlap 顺序匹配往后配几张，默认 10 不变）
"""
import argparse, json, os, shutil, subprocess, sys, time
import pycolmap

ap = argparse.ArgumentParser()
ap.add_argument('video'); ap.add_argument('out')
ap.add_argument('--every', type=int, default=2, help='每几帧取一帧')
ap.add_argument('--width', type=int, default=1280)
ap.add_argument('--model', default='SIMPLE_RADIAL', help='相机模型；鱼眼画面用 OPENCV_FISHEYE')
ap.add_argument('--images', help='已有的图片目录（equirect.py 的输出），不再从视频抽帧；video 填 - 即可')
ap.add_argument('--camera-params', default='', help='已知内参（如 PINHOLE 的 fx,fy,cx,cy），给了就固定不优化')
ap.add_argument('--overlap', type=int, default=10, help='顺序匹配往后配几张')
ap.add_argument('--ffmpeg', default=os.path.join(os.path.dirname(__file__), '..', '..', 'node_modules', 'ffmpeg-static', 'ffmpeg'))
a = ap.parse_args()

if a.images and os.path.abspath(a.images).startswith(os.path.abspath(a.out) + os.sep): sys.exit('--images 不能放在输出目录里（输出目录会先清空）')
img = os.path.join(a.out, 'images'); sparse = os.path.join(a.out, 'sparse'); db = os.path.join(a.out, 'database.db')
shutil.rmtree(a.out, ignore_errors=True); os.makedirs(img); os.makedirs(sparse)

t0 = time.time()
if a.images:
    for f in sorted(os.listdir(a.images)):
        if f.lower().endswith(('.jpg', '.jpeg', '.png')): shutil.copy(os.path.join(a.images, f), img)
else:
    subprocess.run([a.ffmpeg, '-loglevel', 'error', '-i', a.video, '-vf', f"select='not(mod(n\\,{a.every}))',scale={a.width}:-2", '-vsync', 'vfr', '-q:v', '2', os.path.join(img, 'f%04d.jpg')], check=True)
n = len(os.listdir(img))
print(f'抽帧 {n} 张', flush=True)

ro = pycolmap.ImageReaderOptions(); ro.camera_model = a.model
if a.camera_params: ro.camera_params = a.camera_params
pycolmap.extract_features(db, img, camera_mode=pycolmap.CameraMode.SINGLE, reader_options=ro)
print(f'特征点提取完 {time.time() - t0:.0f}s', flush=True)
pycolmap.match_sequential(db, pairing_options=pycolmap.SequentialPairingOptions(overlap=a.overlap))
print(f'顺序匹配完 {time.time() - t0:.0f}s', flush=True)
def mapper_opts():
    o = pycolmap.IncrementalPipelineOptions()
    if a.camera_params: o.ba_refine_focal_length = False; o.ba_refine_principal_point = False; o.ba_refine_extra_params = False
    return o
maps = pycolmap.incremental_mapping(db, img, sparse, options=mapper_opts())
reg = max((r.num_reg_images() for r in maps.values()), default=0)
if reg < n * 0.6:
    # 大面积纯色（白火箭、玻璃顶）、成排重复（温室）时顺序匹配不够：换全量匹配、放宽初始化再试一次
    # （以前只在一个模型都没建起来时才重试；温室那种「建起来了但只对上十几帧」的也要重试）
    print(f'顺序匹配只对上 {reg}/{n} 帧，换全量匹配重试…', flush=True)
    for k in list(maps.keys()): shutil.rmtree(os.path.join(sparse, str(k)), ignore_errors=True)
    pycolmap.match_exhaustive(db)
    opt = mapper_opts()
    opt.min_num_matches = 10; opt.mapper.init_min_num_inliers = 50; opt.mapper.abs_pose_min_num_inliers = 15
    first = maps
    maps = pycolmap.incremental_mapping(db, img, sparse, options=opt)
    if max((r.num_reg_images() for r in maps.values()), default=0) < reg: maps = first   # 全量匹配反而更差就用回顺序匹配的
result = lambda **kw: json.dump({'frames': n, 'every': a.every, 'width': a.width, 'seconds': round(time.time() - t0), **kw}, open(os.path.join(a.out, 'result.json'), 'w'))
if not maps:
    result(registered=0, points=0, models=0)
    print('❌ 重建失败：没有一个模型', flush=True); sys.exit(1)
best = max(maps.values(), key=lambda r: r.num_reg_images())
print(f'模型 {len(maps)} 个，最大的注册了 {best.num_reg_images()}/{n} 帧，3D 点 {best.num_points3D()} 个，{time.time() - t0:.0f}s', flush=True)
# Brush 读 sparse/0：把最大的那个模型放到 0
dst = os.path.join(sparse, '0')
for k in list(maps.keys()):
    p = os.path.join(sparse, str(k))
    if maps[k] is best and p != dst and os.path.exists(p):
        shutil.rmtree(dst, ignore_errors=True); shutil.move(p, dst)
os.makedirs(dst, exist_ok=True)   # 全量匹配更差、用回顺序匹配的结果时，它的目录已经删了
best.write(dst)
result(registered=best.num_reg_images(), points=best.num_points3D(), models=len(maps))
print('✅', a.out, flush=True)
