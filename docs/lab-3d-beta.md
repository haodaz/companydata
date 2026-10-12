# AI 百业 · 3D beta（2026-10-11 探索）

灵感：@_fojcik 的「网站看起来太真了」——Gaussian Splatting + MediaPipe + three.js，摄像头追踪头部，屏幕像一扇窗。

## 现在有什么

- 两个示例场景：**手术室**（开腹医师 09:10 阑尾切除、14:00 急诊探查）、**咖啡吧台**（拉花师傅 除 15:30 外各章）。
- 独立查看器 `/lab/beta/3d/or`、`/lab/beta/3d/cafe`；两个职业主页右上角「走进 xx · 3D BETA」。
- 操作台：这几章的背景从平面图换成 3D 场景（`SimRunner` 的 `backdrop`），每往下一步镜头在房间里横移一点；左下角「3D BETA · 📷 用头看」。工位那一步照旧用工位画面。
- 头部追踪：`src/components/lab/HeadCam.tsx`（MediaPipe Face Landmarker，浏览器本地推理，不录不传）。3D 渲染：`src/components/lab/Splat3D.tsx`（`@mkkellogg/gaussian-splats-3d`）。场景配置：`src/lib/lab-3d-beta.ts`。

## 怎么做一个新场景（scripts/beta3d/）

1. **生成视频**：`node scripts/beta3d/veo.mjs out.mp4 "<提示词>"`（Veo 3.1 fast，8 秒）。
   提示词要点：场景完全静止、没人；**标准 35mm 镜头、不要鱼眼**；镜头做 40° 左右的横向弧线移动，不要转整圈；前景别放小而复杂的东西（器械盘会在帧间变形）。
   第一版手术室用了「360° 环绕」，出来是鱼眼 + 器械盘变形，重建失败；改成上面的写法一次成功。
2. **估机位**：`.venv/bin/python scripts/beta3d/sfm.py out.mp4 out-sfm`（pycolmap，抽 96 帧、顺序匹配，约 1.5 分钟）。
   这台机器的 Homebrew 属于另一个账号，装不了 colmap，用 `uv venv -p 3.12` + `pip install pycolmap opencv-python-headless`。
3. **训练**：`brush_app out-sfm --total-steps 15000 --export-every 15000 --export-path out-splat --max-resolution 1280`（Brush v0.3.0，M4 Pro 约 8 分钟）。7000 步明显偏糊。
4. **转格式**：`.venv/bin/python scripts/beta3d/ply2splat.py export.ply out.splat`（Brush 的 .ply 属性顺序渲染库读不对，转成 .splat 才对；5 万个高斯 ≈ 1.6 MB）。
5. **初始视角**：`.venv/bin/python scripts/beta3d/view.py out-sfm` → position / lookAt / up 填进 `lab-3d-beta.ts`。
6. 上传到 Storage（lab-art 桶，文件名 `beta3d-*.splat`），url 填进配置。

## 真实 360° 素材（可选）

和 Veo 并存，不替代：GoPro Max / Insta360 导出的**等距柱状 2:1** 图片或视频（双鱼眼原片 .360 / .insv 先在相机 App 里导出成全景 mp4 / jpg；H.265 浏览器不一定放得了，导 H.264）。两种用法：

| | 只当全景看（pano） | 重建成 3D（--equirect） |
|---|---|---|
| 要多久 | 传完立刻能看 | 本机 15–30 分钟（估机位 + Brush） |
| 能干什么 | 转头看、拉近；**没有视差**，头部追踪只转方向 | 和 Veo 场景一样能挪、能点物件 |
| 素材要求 | 一张图或一段原地拍的视频就行 | 视频、拿着相机**慢走**（每秒半步）、稳（自拍杆竖直别晃）、画面里少动的东西 |
| 适合 | 海面、水下、人多的现场、天空——会动的都只能这样 | 静的室内、设备间、车间 |

- 海面 / 水下（第一批试的素材）：波纹、反光、漂浮物、鱼群帧帧不一样，COLMAP 对不上，重建大概率过不了质量门——**先当全景看**。水下要重建，只能拍礁石这类静物、贴近慢游。
- 脚下（拿相机的人、自拍杆）：重建切透视图时不渲染往下看的方向（俯仰 < -20° 直接拒绝；fov 90 只看到水平线下 45°）；全景查看器里低头能看到，选 yaw 时朝前。
- 拍摄：相机举过头顶或用长自拍杆，镜头正对前进方向；曝光锁定；一段 20–60 秒够了；别转身原地转圈（纯旋转没有视差，重建不出来）。

**上传 / 只当全景看**：`/lab/studio/pano`（要登录，LAB_PUBLIC 下也拦）。选文件 → 粗查 2:1 → 签名地址直传 lab-art 桶 `pano/` 目录（带进度；桶单文件上限不够时接口会自动抬到 2 GB，项目级全局上限要在 Supabase 控制台看）→ 立刻预览、拖滑块定初始朝向 → 复制 `pano: { url, kind, yaw }` 贴进 `src/lib/lab-3d-beta.ts`。
- 已有 3D 场景加 pano：查看器上方多一个「3D 场景 / 360° 实拍」切换。
- 只有 pano 的新场景：`url: ''`（position 等随便填，页面给了整段模板），`/lab/beta/3d/<key>` 直接打开全景；操作台背景（`beta3dForChapter`）只认 3D，不会用它。
- 查看器：`src/components/lab/Pano360.tsx`（three.js 球内贴图，视频静音循环 playsInline）。

**重建**（视频，本机）：
```
node scripts/beta3d/make-scene.mjs <key> --equirect 全景.mp4 [--every 15] [--yaws 8] [--pitches 0] [--no-upload]
```
`equirect.py` 每 every 帧取一帧、每帧朝 yaws 个水平方向用 ffmpeg `v360` 各切一张 90° 方图（同一台 PINHOLE 相机，内参固定）→ `sfm.py --images … --camera-params … --overlap yaws×3` → 同一个质量门 → Brush → 挑机位 → 上传。不过门自动把抽帧加密一倍再试，还不行退出码 2（就只当全景看）。`--pitches 0,30` 多切一圈往上看的（天花板、高处设备）。单独切图：`.venv/bin/python scripts/beta3d/equirect.py 全景.mp4 out-frames`。

## 还没做 / 想法

- 每一步对准场景里不同位置（器械台、无影灯下）：现在只是按步骤序号横移。
- 镜面物体（咖啡机不锈钢）重建会糊；人物（NPC 立绘）还是平面图贴在 3D 前面。
- 下一项：操作过程中手部识别、拿道具的精度（用户 2026-10-11 交代）。
