# 给公司 simulator 的同步包（2026-10-19）

海外这套（companydata）10-14 到 10-19 在 /lab 上做的东西 + 新产品线「百业AI｜真活」（/work）+ 两百多份教案和知识底座数据，公司 `eng/simulator` 怎么拿。
上一包（10-14）覆盖到 companydata `bbaae9e`，simulator 已收到 `e427182`（后面还有它自己的 `5dba5c0` 等三个提交）。这一包的补丁都以 `bbaae9e` 为底，覆盖 `bbaae9e..8dd9581`。
按约定这边不直接改 simulator，只出补丁、整文件和数据包。**数据工厂的东西不带**（见文末）。

**演练结果**：把 simulator `main`（`5dba5c0`）复制一份，按「三」的顺序打完四个补丁，再把 `files/` 里 7 个整文件覆盖进去、装两个包，`npx tsc --noEmit` 零错误。

> 给 simulator 那边的 Claude：先读「一」「二」；「三」是代码，「四」是数据（空间 / 教案 / 知识 / 真活四个包怎么导入）；「五」是上线前要换掉的；「六」是刻意没带的。

---

## 一、这次带过去什么

| 能力 | 用户 / 运营看到的 | 代码 | 数据 |
|---|---|---|---|
| **跟我学 / 我教你 · 教案** | 每章进去不用等「备课」：每一步先看什么、老手怎么想、每个选项为什么；工位动作一下一下讲（超过 60 下分块生成再合并）。章节生成时顺手备课；「我教你」= 跟我学，不做两套，时间轴页去掉模式切换 | `01-lesson.patch`：`src/lib/lab-lesson.ts`、`/api/lab/spaces/[id]/lesson`、`SimRunner` / `BenchRunner` 讲解模式、章节生成挂钩、迁移 034、批量脚本 `scripts/lab-lessons.mts` | **空间包**里 220 章都带教案；只补教案用**教案包** |
| **百业登录壳** | `/lab/login` 蒙版式登录：光斑 + 细网格的壳、中间一张卡片，不再看到后台的登录页；账号同一套 | `02-lab-shell-login.patch`：`OverlayLogin`、`/lab/login`、proxy 按前缀跳各自登录页 | |
| **顶栏** | 首页第一屏顶栏透明压在整幅场景上，滚过第一屏才出导航底（深浅色一样）；最右一个渐变胶囊「百业真活 ↗」做品牌切换（和导航分开，同公司不同品牌的感觉） | 同上：`LabShell.tsx`、`lab/page.tsx` | |
| **LLM 底层** | 记账算全：每一次成功调用先记「未归属」，调用方再归到功能（不重复）；固定金额记账 `cost_usd`（系统外花费 `scripts/lab-log-cost.mts --usd`）；Claude 走流式 + 64K 输出（长教案不截断）；模型选单抽到 `model-options.ts`；用量页改数据库汇总（迁移 033，之前四万多条记录拉回来自己加会超时） | `03-llm-plumbing.patch` + `files/` 里合并好的 `llm-client.ts` 等 | |
| **百业AI｜真活**（新产品线，独立于 /lab） | 老板 / 带队的人登录后填企业 + 岗位 → AI 从企业画像、在招岗位、职业典型任务、行业规范里架构出一道此刻真实的业务题（任务书 / 材料包必有一份有坑 / 带依赖的 rubric / AI 基线）→ 把参与链接发给候选人，留名字就做（不登录）→ 四种操作台（文档 / 代码 IDE / 表格 / CAD 设计）或「用自己的软件做」（浏览器录屏 + 上传交付，AI 看录屏抽帧还原过程）→ 交卷后「AI 审计中」：事件流切 2–5 段一段一段看、笔记追加着出现，最后逐条核对 + 过程总评 + 和基线比 → 报告（结果 / 过程 / 高光风险 / 六维 / 审计过程）。每道真活自己的空间（管理 / 分享 / 做题情况 / 报告）；出题人提意见 AI 修订（取材清单证明题从数据底座长出来）；首页 `/work`（浅色、整页工作场所场景当环境、A/B 对比、四段报告）；`/work/login` 蒙版登录；logo「百业AI｜真活 · TRUE WORK, TRUE TALENT」 | `04-work.patch`（表前缀 `work_`，记账 tool=work；迁移 035、036）；后台 `/admin` 侧栏那条入口是数据工厂的，没带——simulator 的入口在百业顶栏胶囊和 `/lab/admin` | **真活包**：4 道示范题（宁德时代供应链 / 嵌入式 / 结构设计、复宏汉霖市场） |
| **知识底座数据** | 和我聊 / 规则出处 / 真活出题都靠它：职业 634、典型任务 956、场所 1158、工位 431、工具 3799、行业标准 598、薪资 2534、实体关联 12564——simulator 上 022–029 建完是空表 | 不是代码 | **知识包** |
| **交接工具** | `/lab/admin` 多一个「交接包」：差距清单 + 库里计数 + 四个包的下载按钮；导出接口 `/api/lab/admin/handover?pack=…` | `05-handover-tool.patch`（simulator 不一定要，装了以后它也能给别人出包） | |

## 二、这轮用户定下的口径（请照着做）

- **百业和真活是两个品牌、一套账号**：顶导航不混（真活在最右当品牌切换）；登录壳各是各的，别让用户看到后台 / 数据工厂的登录页。
- **真活台**：出题要登录，做题免登录，示范题所有账号都看得到；企业 / 岗位边输边搜，搜不到就当新的（别让人在列表里做选择题）；C 端是老板不是 HR；管理端不和数据实体后台掺合；不模拟职业，职业 / 岗位 / 企业背景是出题 context；评价措辞只写「观察到」，不下定性；可以随便用 AI，评的是怎么用。
- **渐进式评分**：交卷后不是直接出报告，是「有个 AI 在审计」的过程感——分段看、笔记 append、暂定六维会随后面的段变。
- **首页**：先抛问题再讲产品（「企业怎么选定真人才」），文案不要 AI 腔；整页用场景图当环境、浅色蒙版、要有下滑提示；对比表要能一眼看出差别。
- **教案**：跟我学 = 我教你，不做两套；教案在生成章节时就备好，不让用户进来等。
- **记账要算全**：免费额度、个人充值、系统外（Nebius、Claude Code）都按市价记进同一本账；功能分布按用户能理解的「活」分组。
- 视频旁白：多音字（「一行一行」）念稿换同音字、字幕不变（`scripts/video/tts.mjs` 的 `spoken`）。

## 三、代码：打补丁的顺序与手工合并

在 simulator 根目录（以 `5dba5c0` 为准）：

```bash
P=<companydata>/docs/simulator-sync/2026-10-19
git apply --reject $P/01-lesson.patch           # 教案；lab-guest.ts 会拒 1 处 → 用 files/lab-guest.ts
git apply --reject $P/02-lab-shell-login.patch  # 登录壳 / 顶栏 / 品牌切换；proxy.ts 会拒 3 处 → 用 files/proxy.ts
git apply --reject $P/03-llm-plumbing.patch     # 记账 / Claude 流式 / 模型选单 / 迁移 033；llm-client / model-context / products 会拒 → 用 files/
git apply --reject --binary $P/04-work.patch    # 真活全部（含 public/work 的截图，4 MB）；next.config.ts 会拒 → 用 files/next.config.ts
git apply --reject $P/05-handover-tool.patch    # 可选：交接包页面与导出接口
cp $P/files/llm-client.ts $P/files/model-options.ts $P/files/model-context.tsx $P/files/lab-guest.ts src/lib/
cp $P/files/products.ts src/lib/cost/products.ts
cp $P/files/proxy.ts src/proxy.ts
cp $P/files/next.config.ts next.config.ts
cp $P/files/import-pack.mts scripts/import-pack.mts
find . -name '*.rej' -not -path './node_modules/*' -delete
npm i @anthropic-ai/sdk@^0.135.0 ffmpeg-static     # Claude SDK（录屏看图直接用）、ffmpeg（录屏抽帧）
npx tsc --noEmit
```

`files/` 里 7 个整文件是我在 simulator 副本上合并好的（都保留了 simulator 自己的 `model-config` 总闸）：

| 文件 | 合并要点 |
|---|---|
| `llm-client.ts` | companydata 的全文（兜底记账 `autoLog`、Claude 流式、免费池、`callCompat`）+ simulator 的 `resolveModel → pickModel`、付费千问路径按 simulator 的规矩（联网走原生接口且只认 qwen-plus/max/turbo/long，其余走兼容接口、qwen3.x 关思考）、`cheapModel = CHEAP_MODEL` |
| `model-options.ts` | companydata 的选单 + simulator 的 `ALLOWED` 过滤（只列 qwen），主力模型排第一；`isKnownModel` 真活出题接口用 |
| `model-context.tsx` | 从 `model-options` 取选单；默认 `LLM_MODEL` |
| `lab-guest.ts` | simulator 语义（游客锁主力、登录的过 `pickModel`）+ `GUEST_MODELS`（页头游客下拉要，LabShell 补丁引用了） |
| `products.ts` | simulator 的分组 + `work` / `unattributed` / `external` 归到百业 |
| `proxy.ts` | simulator 的 + `/api/work/*` 放行、`/lab/login` `/work/login` 公开、`/work/mine` `/work/new` `/work/admin` 要登录、按前缀跳各自登录页、matcher |
| `next.config.ts` | simulator 的 + `serverExternalPackages: ['ffmpeg-static']`（不外置的话录屏抽帧抽到 0 帧——海外这边踩过） |

**迁移**（编号和 simulator 现有的不撞，它到 029；都可重复执行）：

| 迁移 | 内容 |
|---|---|
| `033_token_usage_agg.sql` | 用量汇总函数 `token_usage_agg`（用量页不再拉全量） |
| `034_lab_lesson.sql` | `lab_chapters.lesson` / `lesson_at` |
| `035_work.sql` | `work_tasks`、`work_sessions`（RLS 已开） |
| `036_work_owner.sql` | `work_tasks.owner_key` / `owner` |

跳过的编号：030、031（数据部门反馈的企业 / 岗位列）、032（岗位采集标记）是数据工厂的。

**模型**：真活的出题 / 评分 / 分段审计默认写的是 Claude（`WORK_MODEL` / `WORK_GRADE_MODEL` / `WORK_AUDIT_MODEL`），经 `resolveModel` 会被 `pickModel` 换成 `LLM_MODEL`（qwen3.7-plus），能跑；出题页下拉只会列 qwen。**录屏看图**（`src/lib/work/recording.ts` 的 `describeFrames`）直接走 Anthropic SDK，不经过总闸：没有 `ANTHROPIC_API_KEY` 时失败会被捕获，报告里写「录屏分析失败，过程只按上传 / 下载事件评」——要用开放模式就换成 qwen-vl（百炼 `qwen3-vl-plus`，兼容接口传 image_url），这是 simulator 那边的活。

**环境变量**：`WORK_MODEL`、`WORK_GRADE_MODEL`、`WORK_AUDIT_MODEL`、`WORK_VISION_MODEL`（可不设）；`WORK_PUBLIC_CREATE=1` 才开公开出题接口（默认关，出题要登录）。

## 四、数据：四个包怎么导

包从 companydata 的 `/lab/admin/handover` 下载（或 `GET /api/lab/admin/handover?pack=spaces|lessons|knowledge|work`，登录后），都是 JSON，格式 `{ manifest: { format: 'ai100-pack', kind, counts }, ...表名: 行[], assets: [{ bucket, path, url }] }`。**图片不打进包**：包里所有 Storage 地址原样保留，`assets` 列清单；导入脚本按清单下载、传到自己的桶同名路径、再把包里的海外地址全部替换成自己的。

| 包 | 内容 | 大小 | 导入顺序 |
|---|---|---|---|
| 知识包 `knowledge` | occupations 630 / 薪资 1430 + 1104 / 典型任务 956 / 场所 1158 / 工位 431 / 工具 3799 / 行业标准 598 / 实体关联 12564；图片 195 张 | 12 MB | 1 |
| 空间包 `spaces` | skills 61 / 空间 61 / 章节 220（**教案 220 都在里面**）/ 人物场景道具 728 / 素材库 671 / 规则出处 426；图片 529 张（约 94 MB，从海外公网桶下） | 5.4 MB | 2（知识包之后：规则出处指行业标准） |
| 真活包 `work` | 示范真活 4 道（材料包、rubric、AI 基线；不带作答） | 0.1 MB | 3 |
| 教案包 `lessons` | 只有章节 id → 教案；空间已导过、只补教案时用 | 1.1 MB | 随时 |

```bash
npx tsx --env-file=.env.local scripts/import-pack.mts ai100-knowledge-2026-10-19.json --dry   # 先看计数
npx tsx --env-file=.env.local scripts/import-pack.mts ai100-knowledge-2026-10-19.json
npx tsx --env-file=.env.local scripts/import-pack.mts ai100-spaces-2026-10-19.json            # 会下载并上传 529 张图，几分钟
npx tsx --env-file=.env.local scripts/import-pack.mts ai100-work-2026-10-19.json
```

- 全部按 `id` upsert（行业标准按 `dedupe_key`），重复导入 = 覆盖更新；教案包只更新 `lesson` / `lesson_at` 两列。
- 空间包里 61 个空间会**覆盖 simulator 里同 id 的空间**（simulator 上的空间本来就是从这边搬的，id 一致）；simulator 自己新建的空间 id 不同，不受影响。
- `--bucket` 可以把所有图片改传到一个桶；不传就按清单里的桶名（`lab-art`）。导入后图片地址是 `NEXT_PUBLIC_SUPABASE_URL` 下的公网地址，和 `next.config.ts` 的 `remotePatterns` 对上即可。
- 真活包里的 `company_id` / `context` 指的是海外企业库，simulator 当「新企业」看待即可（出题人空间的「取材清单」照样能看，只是链接不通）。`share_token` / `owner_key` 原样带，参与链接 / 管理链接的路径不变。
- 知识包里 `occupations` 是 630 条（有 4 条 `if_delete` 的没带）。

## 五、上线前要换掉 / 要知道的

- **真活首页的视频**：`src/app/work/page.tsx` 的 `MEDIA` 指向海外 Supabase 的 `lab-media/landing/work-demo-720.mp4` + 海报；字幕 `public/work/work-demo.vtt` 在补丁里。传到自己的桶、改地址。
- **真活首页的场景图**：`SCENES` 用的是 `lab-art` 桶里的工作场所图（空间包会把这些图一起带过去），地址前缀 `ART` 改成自己的。
- **衬线标题字体**：`layout.tsx` 用 next/font 自托管 Noto Serif SC（构建时从 Google 下载分片）；公司构建机连不上 Google 就把 `Noto_Serif_SC` 那两行去掉，`serif` 保底是思源宋体 / 宋体。
- **登录卡片上「没有账号？找管理员开通」**：和 simulator 的注册策略对一下。
- `WorkLogo`（`src/components/work/WorkLogo.tsx`）在 02 补丁里（百业登录壳引用了），04 补丁不重复带。
- 已知问题（这边会修，修了下一包带）：真活开放模式录屏只抽到帧、看不到候选人是否采纳 AI；代码台自测只认 JS。

## 六、刻意没带的

- 数据工厂：岗位 / 企业列的反馈迁移（030–032）、数据部门反馈脚本、外采篮（`src/lib/basket.ts`、`/api/basket`）、岗位补采 / 关联专业脚本、飞轮、`/admin` 侧栏真活入口。
- 演示专用：视频录制与剪辑（`scripts/video/work*.mjs`、`autospeed-narr.py`、封面 html）、`scripts/.*` 临时脚本、`out/`。
- 记账补记脚本 `scripts/lab-log-cost.mts --usd` 带了（在 03 里）；Claude Code 出题模式那批补记的数据没带（是海外这边的账）。

## 附：补丁清单

| 补丁 | 大小 | 覆盖的 companydata 提交 |
|---|---|---|
| `01-lesson.patch` | 77 KB | 01ca1c4 跟我学教案、fee2701 我教你=跟我学、33d84a6 旋钮口径、df9b822 分块生成、章节生成挂钩、证书记账标签 |
| `02-lab-shell-login.patch` | 25 KB | 1a99c21（/lab/login 部分）、8c8d046（品牌切换）、94b68dd（顶栏透明 + 胶囊最右）、689ad90 游客默认千问 |
| `03-llm-plumbing.patch` | 37 KB | 661f26b 兜底记账、ea96087 / 7255900 / a86641a Claude 流式与 64K、8a8ca34 模型选单、f91d35d 千问价目、013eb54–ae4f8f2 免费池（海外省钱用，simulator 不配 `DASHSCOPE_FREE_KEY` 就走不到）、033 |
| `04-work.patch` | 4.4 MB（截图） | 4c9c1d5 起到 8dd9581 的全部真活提交（约 25 个） |
| `05-handover-tool.patch` | 小 | 交接包页面 / 接口 / 导出库 |
