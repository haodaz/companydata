# 给公司 simulator 的同步包（2026-10-12）

海外这套（companydata）10-12 在 /lab 上做的东西，公司 `eng/simulator` 怎么复用。
上次同步到 companydata `8782827`（simulator 的 `aa837e4`），这次的补丁都以 `8782827` 为底，覆盖 `8782827..2fa252e` 之后的 /lab 改动。
**演示专用的不带**（见文末）。按约定这边不直接改 simulator，只出补丁和说明。

演练结果：把 simulator `main`（`aa837e4`）复制一份，按下面顺序打完补丁、做完两处手工合并之后，`npx tsc --noEmit` 零报错。

---

## 一、这次带过去什么（产品层面）

| 能力 | 用户 / 运营看到的 | 入口 |
|---|---|---|
| **成本归属** | 每一笔 AI 花费记到空间 / 章节 / 任务 / 作答人 / 环节（创造 · 使用 · 学习 · 评审 · 美术与 3D）；出图按张、视频按秒、全景识别都记账 | 记账自动带上 |
| **百业后台** | 百业自己的后台（和数据工厂的后台分开）：成本按环节、按空间、按功能 \| 环节、按模型；价目表可改（含按件单价）；明细 | `/lab/admin` |
| **台面母版** | 6 个母版（桌面 / 现场 / 分屏 / 调度 / 双手 / 对话），新职业的台面只填 JSON（`BenchSpec.surfaceConfig`）；代码版台面留作保底 | `/lab/beta/bench/<key>` 试玩对照 |
| **第二批交互故事台面** | 火箭试车台、芯片验证桌面、应急沙盘、河堤一线、变电站、转炉、沥青分屏、温室、CAD（代码版；母版化的那几个配置也在） | 空间里的操作台 |
| **质量体系** | 工作室校验带编号规则（[D3] 一天至少一章实操、[D5] 角色编号、[B1] 按真实步长干跑、[B2] 工具对行业）；生成工位时自检；AI 评审；人工修改留痕 | 工作室、脚本 |
| **设计文档** | 百业总纲：从 JD 解析规划到母版、3D、质量、留痕、AI 自生成、真实素材加工 | `/lab/logic`（要登录） |
| **真实 360° 素材（可选）** | 上传全景图 / 视频即看；要素识别（仪表、阀门、珊瑚…打标签写介绍）；查看器支持可点标记、前倾推近、街景箭头行走 | `/lab/studio/pano`、`/lab/beta/3d/<key>` |

## 二、迁移

| 迁移 | 内容 | 备注 |
|---|---|---|
| `020_lab_edits.sql` | 人工修改留痕表 `lab_edits` | simulator 还没有 020，原号可用；可重复执行 |
| `021_cost_attribution.sql` | `token_usage_logs` 加 space_id / chapter_id / job_id / actor / stage / units / unit；`model_pricing` 加 unit_price / unit，预置通义万相每张、Veo 每秒参考价 | simulator 的 018 已建 `model_pricing`，列兼容；可重复执行 |

simulator 没有 companydata 的 014（`search_calls` / `search_cost_usd` 两列）：新的 `token-logger` 写入时缺哪列就去掉哪列重写，不丢记录，不用补 014。
**不要带** companydata 的 018（`018_feedback_1010`，数据工厂的）。

## 三、打补丁的顺序

在 simulator 根目录：

```bash
P=<companydata>/docs/simulator-sync/2026-10-12
git apply $P/01a-cost.patch              # 成本归属：cost/ 报表与口径、建空间 / 生一天 / 评分 / 访谈等入口的 withCost、百业后台 /lab/admin、迁移 021、lab-log-cost 脚本
git apply $P/01b-cost-NEWFILES.patch     # simulator 没有的两个文件：价目表卡片 PricingCard、价目表接口 /api/admin/model-pricing
#   ↳ 然后做「四、手工合并」的 1、2（token-logger、lab-art）
git apply $P/02-masters-quality.patch    # 台面引擎（playDt、surfaceConfig）+ 母版 + 第二批台面 + 校验器 / 评审 / 留痕 + 脚本 + 样板库文档
git apply $P/03-lab-logic.patch          # 设计文档页
#   ↳ 做「四、手工合并」的 3（proxy / LabShell）
git apply $P/04-pano360.patch            # 全景查看器、上传页 / 接口、识别 / 重建脚本
#   ↳ 做「四、手工合并」的 4（lab-3d-beta 类型、3D 页）
npx tsc --noEmit
```

依赖关系：02 里的 `skill-lab-build.ts` 用到 `withCost`，所以 01 要先打、`token-logger.ts` 要先换好。

## 四、手工合并（4 处）

1. **`src/lib/token-logger.ts`：整份换成 `files/token-logger.ts`。** 它是 simulator 现版本的超集：出图按张（改用通用的 `units` + 价目表 `unit_price`，`IMAGE_PRICE_CNY` 的价格已并进默认价）、按件计价、归属上下文 `withCost`、缺列自动降级。simulator 里唯一传 `images:` 的调用在 `lab-art.ts`，见下一条。
2. **`src/lib/lab-art.ts`：只改一行，保留 simulator 的 `labArtPublicUrl` / `labArtFileName`。** 把出图记账那行的 `images: 1` 改成 `units: 1, stage: 'media'`：
   ```ts
   import('@/lib/token-logger').then(m => m.logTokenUsage({ tool_name: 'lab-art', task_name: purpose, model_id: model, units: 1, stage: 'media' })).catch(() => {});
   ```
   参考 `01c-cost-MANUAL.patch` 里 companydata 的写法。
3. **`src/proxy.ts`、`src/app/lab/LabShell.tsx`**（参考 `03b-proxy-labshell-MANUAL.patch`，`proxy.ts` 能直接打、`LabShell.tsx` 要手合）：
   - `/lab/logic`、`/lab/admin` 在 LAB_PUBLIC 下也要登录（和 `/lab/studio` 一样）；
   - 导航「百业工厂」高亮包含 `/lab/logic`、`/lab/admin`，「体验百业」的排除正则加 `logic|beta|admin`；
   - 页头右侧的后台按钮指向 `/lab/admin`（simulator 第 251 行现在指向 token-usage，改成百业后台）。
4. **`src/lib/lab-3d-beta.ts`、`src/app/lab/beta/3d/[scene]/page.tsx`**（参考 `04b-3d-beta-MANUAL.patch`）：
   - 把 `files/lab-3d-beta-pano-types.ts` 里的 `PanoSpot` / `PanoNode` / `Beta3DPano` 加进 `lab-3d-beta.ts`，`Beta3DScene` 加 `pano?: Beta3DPano`；**保住 simulator 的 `beta3dEnabled` 开关**；
   - **场景数据不要带**（火箭 / 指挥大厅 / 摊铺现场 / 锅炉房 / 珊瑚礁等，写死了海外 Storage 地址和演示空间编号）；
   - 3D 页按 companydata 的版本加：只有全景就用 `Pano360`；3D 和全景都有时顶部切换（`pano.first` 为真默认先看实拍）；把 `spots / nodes / walk / showAll(?all=1)` 传给 `Pano360`。保住 simulator 加的 `beta3dEnabled` 判断。

## 五、上线后

- **百业后台**：simulator 的 `/admin/token-usage` 现在是「默认只看百业」的版本；百业后台挪到 `/lab/admin` 之后，建议 `/admin/token-usage` 直接跳到 `/lab/admin`（simulator 不再有数据工厂，留一个入口就够）。
- **价目表**：021 预置了通义万相每张、Veo 每秒的**参考价**；Veo 的价格请对照 AI Studio 账单在百业后台的价目表里改。
- **母版搬库**：simulator 库里还是代码版台面（`surface: 'switching'` 这类）。要换成母版配置：`npx tsx scripts/lab-to-master.mts`（先试跑）→ `--apply`（写库前原样备份、每章记一笔留痕；`--revert <备份>` 可回）。重点 demo（火箭、外科、沥青、数据分析、CAD、应急、温室）不在清单里，不会被换。
- **回归检查**：改了 `bench.ts` / 母版之后跑 `npx tsx scripts/lab-masters-check.mts`。
- **全库体检 / AI 评审**：`npx tsx scripts/lab-check-all.mts`、`npx tsx scripts/lab-review.mts <空间>`。
- 国内环境：Veo（视频）、Gemini 视觉（全景识别）、MediaPipe（头部追踪）在国内可能打不开；全景查看本身不依赖它们（拖动 / 滚轮都能用）。

## 六、刻意没带的（演示专用 / 数据工厂）

- 视频录制与剪辑：`scripts/video/*`、`public/video/*`
- 写死空间编号的一次性脚本：`scripts/lab-upgrade-*`、`lab-fix-*`、`.create-batch2.sh`、`.fullday-queue.sh`、`.rename-roles.mts`、各种 `.bench-backup-*` / `.master-backup-*`
- 演示场景数据：`lab-3d-beta.ts` 里的场景条目、`src/lib/pano-spots/*.json`（锅炉房 Poly Haven、珊瑚礁 Wikimedia）、`scripts/beta3d/runs.jsonl`
- 运行产物：`docs/lab-reviews.jsonl`
- 海外部署相关：`aisimjob.com` 域名改写、`LAB_PUBLIC` 的海外口径
- 数据工厂：`fix-1011`、`company-logo`、`agents/company/locate`、工厂的 `/admin` 用量页（companydata 那边已改成只算工厂）

## 七、文件

| 文件 | 内容 |
|---|---|
| `01a-cost.patch` | 成本归属（14 个文件，可直接打） |
| `01b-cost-NEWFILES.patch` | 价目表卡片 + 接口（2 个新文件） |
| `01c-cost-MANUAL.patch` | token-logger / lab-art 的 companydata 改法（参考，不直接打） |
| `02-masters-quality.patch` | 母版 + 第二批台面 + 质量（70 个文件，可直接打） |
| `03-lab-logic.patch` | 设计文档页（可直接打） |
| `03b-proxy-labshell-MANUAL.patch` | proxy / LabShell（参考，手合） |
| `04-pano360.patch` | 全景（12 个文件，可直接打） |
| `04b-3d-beta-MANUAL.patch` | lab-3d-beta / 3D 页（参考，手合；场景数据不要） |
| `files/token-logger.ts` | 换上去的整份 |
| `files/lab-3d-beta-pano-types.ts` | 要加进 lab-3d-beta 的类型 |
