> 2026-10-11 从 eng/simulator 搬到 companydata：019 对账、读写走角色表、素材库换图 / 删除（加了管理员校验）、示范图搬进 Storage（`scripts/lab-localize-seed.mts`）。没搬：后台空间管理 / 空间包导入导出、Storage 孤儿清理、`NEXT_PUBLIC_LAB_ART_URL` 和 relink（公司部署专用）。

# AI 百业 · 素材的来源与引用（单链路）

2026-10-10 定的规矩，给技术同事看。背景：换一张图要全库搜网址字符串反查，不稳；代码里还直接引用仓库里的图，和生成的图是两套来源。

## 一句话

**图的来源只有一条链：步骤 → 角色表 → 素材库 → 网址。JSON 里存的网址只是缓存，不是真相。**

| 层 | 表 | 管什么 | 换图 = 改哪里 |
|---|---|---|---|
| 素材库（全局） | `lab_art_assets`（A-xxxx） | 「长什么样」：一张图一行，网址只存这一份；规范类型名决定能不能跨空间复用 | 这张图整体换掉 → 改这一行的 `url`，所有用到它的空间自动变 |
| 角色表（每个空间） | `lab_cast`（P00 主角 / P 人物 / S 场景 / T 道具） | 「出场的是谁」：各指向一个素材 `asset_id` | 只给这个空间换一张脸 → 改这一行的 `asset_id`（挑库里另一张或现画） |
| 章节 / 空间 | `lab_chapters.sim`、`skill_tasks.sim / profile` | 「哪里出场」：步骤 `scene.who`（人名）、`place`（S 的 id）、`props`（T 的 id 数组）、章节 `cover_cast`（S 的 id）、工位步 `place` | 不手改。`sim.art.*`、`profile.avatar`、`bench.scene.image` 里的网址是**算出来的缓存** |

效率：读一个空间时按角色表现算一遍（`applyCastArt`，一次查询十几行）；列表页 / 宣传页读缓存。改了素材或角色表只重算受影响的空间（`refreshArtCache`），不扫全库。

## 代码在哪

- `src/lib/lab-cast.ts`：纯函数。`applyCastArt(sim, cast, coverCast)` 把角色表的图套到一章上（立绘按人名、场景按 `place`、工位底图按 `place`、封面按 `cover_cast`）；`castAvatar` 取 P00 的头像。
- `src/lib/lab-cast-server.ts`：
  - `reconcileCast(taskId)`：调迁移 019 的 `lab_reconcile_cast`，新建 / 导入空间后对账。
  - `refreshArtCache(taskIds)`：把角色表算出来的图写回缓存（`profile.avatar`、各章 `sim.art`、第 1 章镜像到 `skill_tasks.sim`）。
  - `tasksUsingAssets(assetIds)`：哪些空间挂着这些素材。
  - `rewriteUrlEverywhere(old, new)`：全库字符串改写，**只做兜底**（019 之前没对上账的引用）。
- `src/lib/lab-seed-assets.ts`：预置示范的图从仓库 `public/lab/` 搬进 Storage（`seed-<原名>`），`localizeLibrary()` 把库里还指着 `/lab/…` 的一次搬完。
- `supabase/migrations/019_lab_cast_reconcile.sql`：函数 `lab_reconcile_cast(task_id)` + `lab_chapters.cover_cast`。可重复执行，迁移末尾对全库跑一遍，第二遍全是 0。

## 什么时候会写角色表

| 入口 | 以前 | 现在 |
|---|---|---|
| 新建空间（职业名 / JD） | 只写 `sim.art` 网址，没有角色表 | 建完 `reconcileCast` → P00 / 人物 / 场景 / 工位底图全进角色表 |
| 灌预置示范 | 引用 `public/lab/*.jpg` | 先上传 Storage，再 `reconcileCast` |
| 工作室排骨架 / 按格生成 | 已经写角色表 | 不变 |
| 导入 / 覆盖空间包 | 用包里的角色表 | 末尾再 `reconcileCast`，老包（没角色表）也能对上 |
| 工作室给角色换素材 / 现画 | 读的时候现算 | 同时 `refreshArtCache`，列表页也立刻对 |
| 素材库「替换图片」 | 全库搜旧网址改写 | 先 `refreshArtCache(挂着它的空间)`，再兜底改写 |

## 上线顺序（公司环境）

1. 部署这版代码 + 点 `sync-db_alpha`（跑 019，自动对全库账）。
2. 管理后台 → Storage 页 → 「示范图搬进 Storage」，把昨天灌的示范从 `/lab/…` 换成 Storage 网址。
3. 之后新灌的示范、新建的空间自动走这条链。
4. 两边（公司 / 海外）都搬完以后，仓库里的 `public/lab/*.jpg|png` 可以删掉（`public/lab/brand/` 是证书 logo，留着）。

## 还没做 / 可以再简化

- 空间包（`lab-space-pack.ts`）仍按「旧网址 → 新网址」改写引用，再对账。既然引用都是角色表 id 了，导出可以只带素材行 + 文件、不再改写网址；等这版跑稳了再收。
- 人物仍按名字（`scene.who`）指向角色表，改名时各章一起改（已有）。要不要也换成 id，看以后多语言 / 同名的需要。
- 道具（T）还不画图。
