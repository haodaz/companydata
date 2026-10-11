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

## 还没做 / 想法

- 每一步对准场景里不同位置（器械台、无影灯下）：现在只是按步骤序号横移。
- 镜面物体（咖啡机不锈钢）重建会糊；人物（NPC 立绘）还是平面图贴在 3D 前面。
- 下一项：操作过程中手部识别、拿道具的精度（用户 2026-10-11 交代）。
