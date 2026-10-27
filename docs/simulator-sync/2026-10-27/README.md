# 给公司 simulator 的同步包（2026-10-27）· 第六轮 · 只带百业AI｜真活

真活在这边又往前走了一大段，准备往 ToB 收费推。这一轮把 **10-23 之后真活的全部进展**带过去：出任务的两种方式都升级了，多了任务库（明牌）和样本库 / 题目资产库（暗牌），操作台改成按交付物挂模组、新增白板，做题页和出任务一侧的界面整体重做。

**百业学院（/college）不带**：学院的代码、表、数据一概不在包里；补丁新增代码里对学院的注释和分支都已去掉。

- 补丁以 companydata `5cb96e6` 为底（你们已打成 `5470248`），覆盖 `5cb96e6..28e7d09`。
- 目标：simulator `main` = `5470248`。
- **演练结果**：把 `5470248` 克隆一份，`git apply --reject --binary 01-work.patch` 只拒 1 处（`llm-client.ts`，**保留你们的版本即可**，见「三」），补上 `files/StatCards.tsx`、装 `@excalidraw/excalidraw@0.18.1` 后 `npx tsc --noEmit` **0 错**。迁移四个都是新表 / 加列，无外键依赖，已开 RLS。

> 给 simulator 那边的 Claude：先读「一」「二」；「三」是代码；「四」是数据；「五」是上线前要配的；「六」是刻意不带的。

---

## 一、这边比 simulator 先进在哪（逐项）

simulator 现在有的真活 = 第五轮（10-23）：出题单页、对比通用模型、做题 AI、真活插件、权限。以下都是之后的，simulator 里**没有**：

### A. 出任务（出任务的人一侧）

| 能力 | 用户看到的 | 代码位置 |
|---|---|---|
| **叫法改成「出任务」** | 填表出任务 / 聊着出任务 / 出任务的人 / 任务设置；「真活」概念不变 | 全部页面文案；聊天助理提示词也要求这么说（`src/lib/work/chat-agent.ts`） |
| **聊着出任务** | `/work/new/chat`：出任务助理一件件追问企业 / 要找的人 / 考什么；问要不要给候选人素材；一个「📎 文件」按钮，素材还是参考由助理按语境判断；出好在右侧面板直接改 | 页面 `src/app/work/new/chat/page.tsx`；接口 `src/app/api/admin/work/chat/route.ts`（NDJSON 流，复用工作台 `runTurn`）；工具与提示词 `src/lib/work/chat-agent.ts`；对话存 `work_threads`（迁移 047） |
| **填表出任务拆两页** | 第一页「任务」：你是哪家企业？你在找什么样的人？想考什么？题里给做题人什么素材？有没有以前的题可参照？第二页「任务设置」：配哪个 AI、要不要指定操作台 | `src/app/work/new/page.tsx`、`src/components/work/CompanyRolePicker.tsx` |
| **原题直发** | 手里有一道干净的题，整段贴进来一字不改发出去，平台只整理交付物和评分点 | `chat-agent.ts` 的 `createWorkTask`（`verbatim`）、`generator.ts` 的 `verbatimTask` |
| **题目素材（给候选人的附件）** | 表格 / 图纸 / 截图 / PDF 上传进材料包；Excel 按工作表抽成表格，候选人端渲染成数据表；**图片用视觉模型写说明**，出题 / 评卷 / 候选人 AI 都读得到 | 上传 `src/components/work/AttachUpload.tsx` → `src/app/api/admin/work/attach/route.ts`（存 `lab-media` 桶）；看图 `src/lib/work/vision.ts`；材料拼接 `generator.ts` 的 `attachmentsToMaterials` |
| **参考资料（出任务的人自己的过往题）** | 贴 / 传一道以前用过的题，AI 拆成骨架后「照它改背景换数字」出（不给候选人看） | `src/components/work/SampleUpload.tsx`、`src/lib/work/samples.ts`、`src/app/api/admin/work/samples/route.ts` |
| **库里没有的企业按单入库** | 贴了介绍的新企业，出任务时自动新建进企业库（来源「真活出题」、待审核），任务挂上企业 id | `src/lib/work/company-entity.ts`；`src/lib/ws/setup.ts` 的 `createCompanyEntity` 加了 `source` 参数、`source` 先按字符串写 |
| **发布流程** | 出好的任务先「待发布」；凭管理密钥**预览做题台**（预览作答单独标出）；确认后「发布」参与链接才生效；可「下架」 | `src/app/work/[token]/owner/page.tsx`、`src/app/api/work/[token]/route.ts`（`?k=` 预览）、`sessions/route.ts`（预览作答打标）；聊天里 `publish_task` 工具 |
| **任务空间首次引导 + 修订记录** | 第一次进空间四步说明；按意见改过的记录列在反馈框下 | `owner/page.tsx`、共用 `src/components/work/Tour.tsx` |
| **统一顶栏 + 账号** | 我的真活 / 任务库 / 管理全部（admin）；右侧出任务按钮或填表 / 聊着切换；登录了显示名字 + 菜单（含退出），没登录才显示登录；任务空间有面包屑；预览做题台有「回到真活空间」 | `src/components/work/WorkTopBar.tsx`（各页都换成它）；预览条在 `src/app/work/[token]/page.tsx` 的 `OwnerPreviewBar` |

### B. 任务库（明牌）和样本库 / 题目资产库（暗牌）

| 能力 | 用户看到的 | 代码位置 / 表 |
|---|---|---|
| **任务库** `/work/library` | 25 道挑好的任务、10 个行业（新能源制造、投资、生物医药、科研、互联网、消费零售、设计、法律、咨询、会计），企业名都去掉了；选一道 → **原题直出，换成我们公司**（结构 / 交付物 / 材料和坑 / 评分要点照搬，企业背景和数字换掉）或**仅做参考** → 进填表（只问企业）或聊天（输入框预填，助理只问企业）。登录即可看，不必 admin | 页面 `src/app/work/library/page.tsx`；接口 `src/app/api/work/library/route.ts`；去标识题面 `src/lib/work/showcase.json`（人工整理）；生成时回读原任务全文 `src/lib/work/showcase.ts` → `generateTask` 的 `base` 参数；原任务在数据包 `data/work_tasks_showcase.json` |
| **样本库（暗牌）** | 出任务时后台按岗位自动挑 0–2 份好题骨架当结构参照，用户看不见；后台「样本库」标签可逐份看骨架 | `src/lib/work/samples.ts`（解析 / 自动挑 / 渲染）、`src/components/work/SamplesPanel.tsx`；表 `work_samples`（迁移 047 / 048）；数据包 571 份：r1 2 份、r2 322 份（案例集、技能认定、take-home）、r3 247 份（Forage 岗位模拟转译，中文重写） |
| **题目资产库** | 出题 / 修订 / 基线 / 评卷后自动沉淀题骨架 + 出题参数 + 质量信号；出题时参照同企业 / 同行业的高分题（只借结构，换角度）；后台 `/admin/db-question` 看 | `src/lib/work/question-bank.ts`；后台页 `src/app/admin/db-question/page.tsx` + `src/app/api/admin/questions/route.ts`；表 `work_question_bank`（迁移 049）。**不带数据**，你们自己出题会自己长 |
| **外部模拟参照（Forage）** | 271 个公开职业模拟的外层（谁家、岗位方向、角色与目标、任务结构、技能、评价），后台 `/admin/db-external-sim` 看，点一行出抽屉，每条带原页链接 | 后台页 `src/app/admin/db-external-sim/page.tsx` + `src/app/api/admin/external-sims/route.ts`；表 `work_external_simulations`（迁移 051）；数据包 `data/work_external_simulations.json` |

### C. 做题（候选人一侧）

| 能力 | 用户看到的 | 代码位置 |
|---|---|---|
| **操作台按交付物挂模组、可混用** | 一道任务要交几样就挂几个台子：文档 / 表格 / 代码 / 参数草图 / 画布 / **白板**；标签常驻、20 分钟没打开弹气泡、交卷前提醒没动笔的；每份交付物的要求印进试卷 | 模组定义与识别 `src/lib/work/modules.ts`（`resolveModule`：format 强信号纠偏）；做题页 `src/app/work/[token]/page.tsx`（`partsOf` / `PartState`）；各台子 `src/components/work/benches/*` |
| **新台子：画布** | 流程图 / 泳道图 / 思维导图 / 架构图，拖节点连线，交付自动转 Mermaid 文本进评分 | `src/components/work/benches/CanvasBench.tsx`、`modules.ts` 的 `canvasToText` |
| **新台子：白板** | 产品 / UI / 视觉 / 品牌设计：自由画、贴图、画框，手机屏 / 网页屏 / 便签模板；**组件库** 18 个线框组件（按钮、输入框、导航栏、标签栏、卡片、列表、弹窗、开关……+ 色板、九宫格、角色比例），点一下放上去；交卷时整板存 PNG 给出任务的人看、内容转文字进评分 | `src/components/work/benches/BoardBench.tsx`（Excalidraw，MIT）、`boardLibrary.ts`、`modules.ts` 的 `boardToText`；交卷截图在做题页 `submit` 里上传到 `sessions/[sid]/upload` |
| **布局像 AI workspace** | 材料栏 / AI 助手可收；材料面板可拖高 / 占满 / 收成一条 / 关；AI 助手卡片按 Markdown 渲染（表格、引用、代码块）；进来默认打开第一份材料；第一次进弹五步说明 | `src/app/work/[token]/page.tsx`；`src/components/ws/Md.tsx` |
| **各台子工具栏补全** | 文档：标题 / 粗斜 / 列表 / 任务 / 引用 / 表格 / 链接 / 代码块 / 预览；表格：增删行列、排序、求和、CSV；代码台改浅色 | `benches/DocBench.tsx`、`SheetBench.tsx`、`CodeBench.tsx` |
| **报告** | 出任务的人先看交付物原文，再看逐条评价；没有过程记录的作答也能打开 | `src/components/work/WorkReport.tsx`、`WorkTaskDetail.tsx` |

### D. 出题与评卷质量（看不见但影响结果）

- 企业自身负面舆情不进题干（企业是客户）；没有同名岗位时按「要找的人」相关度挑参考岗位 —— `src/lib/work/generator.ts`
- 生成器知道全部模组（产品 / 视觉设计用白板、别用工程参数台）—— `generator.ts` 提示词
- 「做一道真活」统一入口 `src/lib/work/solve.ts`（AI 基线走它，分步推进 + 操作台说明 + 材料）
- 评卷 JSON 解析失败同模型严格重试一次 —— `src/lib/work/grader.ts`
- 千问出错的兜底（挑参照 / 评卷 / 候选人 AI / 做题基线）—— 在你们那边会被 `model-config` 统一换成千问，兜底到 Claude 的分支不会触发

## 二、口径（请照着做）

- **明牌和暗牌分开**：任务库是明牌，给用户挑；样本库 / 题目资产库是暗牌，后台训练出题能力，**对客户不讲**。
- 任务库只给题、不讲出题逻辑；**原企业名一个都不露**（题面已人工去标识）；生成时「原题直出」也要求原企业名不出现在新题里。
- 动词说「出任务」，概念说「真活」；做题的人不用登录。
- 题干里不写企业自身的负面舆情。
- 产品 / UI / 视觉 / 品牌设计的交付物用白板；工程设计（要定尺寸的）才用参数草图台。

## 三、代码

在 simulator 根目录（以 `5470248` 为准）：

```bash
P=<companydata>/docs/simulator-sync/2026-10-27
git apply --reject --binary $P/01-work.patch      # 57 个文件；只拒 src/lib/llm-client.ts 一处（qwen3 走兼容接口）——你们的版本已经处理得更完整，删掉 .rej、保留你们的即可
find . -name '*.rej' -not -path './node_modules/*' -delete
cp $P/files/StatCards.tsx src/components/admin/   # 两个后台页要用的统计卡（数据工厂的小组件）
npm i @excalidraw/excalidraw@0.18.1               # 白板
npx tsc --noEmit                                   # 演练结果 0 错
```

两个后台页（`/admin/db-question` 题目资产库、`/admin/db-external-sim` 外部模拟参照）**没有改你们的后台导航**，需要的话在 `src/app/admin/layout.tsx` 里自己挂入口。

## 四、数据

1. 跑迁移（`migrations/`）：`047_work_samples`（样本库 + 聊天出题对话 `work_threads`）、`048_work_samples_links`、`049_work_question_bank`、`051_external_simulations`。编号和你们的不冲突（你们到 043）；要改号随意。
2. 导入：`npx tsx $P/files/import-work-1027.mts $P/data`（按 id upsert，可重跑）
   - `work_samples.json` 571 份（只有骨架，不含原文）；`occupation_id` 清空（职业编号两边对不上），保留 `occupation_name`
   - `work_tasks_showcase.json` 25 道：任务库的原题，导入成 `archived`（任何列表都不出现），分享链接 / 管理密钥现生成；任务库按 `showcase.json` 里的 `source_task_id` 回读它们
   - `work_external_simulations.json` 271 条

## 五、上线前要配的

- `npm i @excalidraw/excalidraw@0.18.1`
- 存储桶 `lab-media`（附件、白板截图）——你们已有
- **看图写说明**（`vision.ts`）现在走 Claude / OpenAI，你们没配这两个 key，会直接跳过（不报错，只是图片没有文字说明）。要用就换成 qwen-vl
- 聊着出任务页面默认模型写的是 Claude，会被你们的 `model-config` 换成千问；也可以直接把默认值改成千问
- 白板组件库 `boardLibrary.ts` 是纯数据，加组件照现有条目写就行
- 任务库加题：往 `showcase.json` 加条目（去标识写法照现有的）+ 原任务导入 `work_tasks`

## 六、刻意不带的

- 百业学院（/college）全部
- 迁移 050（企业库画像审核问题类型，属于数据工厂）
- 题目资产库的数据（你们出题会自己沉淀）
- Forage 抓取脚本、Forage → 样本的转译工具（数据已经转好放在包里）
- 演示视频脚本、录屏工具的改动
