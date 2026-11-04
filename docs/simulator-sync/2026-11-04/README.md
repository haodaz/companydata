# 给公司 simulator 的同步包（2026-11-04）· 第七轮 · 只带百业AI｜真活

起因：合作方（潜历）反馈两条——**① 报告里看不到候选人的原始作答和上传的附件；② 想看整个做题过程（像会议记录那样的答题历程）**。查下来：

- ① 出任务的人后台「看报告」抽屉里本来就有「交付物原文」（第六轮已带），但**「报告链接」那页只有 AI 评价、没有原文**；开放模式候选人**上传的文件哪里都点不开**（只有 txt / csv 读进了评卷，PDF / Word / Excel 只记了文件名）。
- ② 过程事件一直按秒存着（打开材料、问 AI、粘贴、采纳、离开……），问 AI 的原文也存着，但**没有给人看的界面**，只有 AI 审计的摘要。

这一轮补上这两条，同时把 10-27 之后真活的其余进展一起带过去（simulator 停在第六轮 `ed5d7ec`，之后真活有 24 个提交）。**百业学院（/college）不带。**

- 补丁以 companydata `28e7d09` 为底（你们已打成 `ed5d7ec`），覆盖 `28e7d09..86a016d`。
- **演练结果**：把 `ed5d7ec` 克隆一份，`git apply --reject --binary 01-work.patch` 拒 6 处，全是你们那边改过的小地方（注释里的人名换成「产品负责人」、去掉学院分支、插件域名）；用 `files/` 里合并好的 5 个文件覆盖（见「三」）、插件说明 json 保留你们的，`npx tsc --noEmit` **0 错**。迁移只有一个新表，已开 RLS。

> 给 simulator 那边的 Claude：先读「一」；「二」是潜历那两条具体怎么做的；「三」是打补丁的步骤；「四」上线前要配的；「五」刻意不带的。

---

## 一、这一轮带过去的（simulator 里还没有）

| 能力 | 用户看到的 | 代码位置 |
|---|---|---|
| **答题历程**（潜历反馈 ②） | 报告里一条时间轴：每个时间点做了什么——打开哪份材料、切到哪份交付物、**问 AI 的原话和 AI 的回答**、采纳了 AI 多少字、粘贴多少字、上传了什么文件、录屏画面（AI 看图记的）、离开 / 空闲、交卷；连续改稿合成一条「写作 +N 字」；顶上一条总览条（颜色分类）；可按「问 AI / 材料与文件 / 稿子快照」筛 | `src/components/work/WorkProcess.tsx`（新）；出任务的人「看报告」抽屉 `WorkTaskDetail.tsx`；报告页 `src/app/work/[token]/page.tsx` 的 `ReportOriginal` |
| **稿子快照** | 考试台每 3 分钟存一份当时的稿子（有变化才存，12000 字封顶），时间轴上点「看这一刻的稿子」——能看到候选人是怎么一步步写出来的，过程性评价的依据 | 做题页 `page.tsx`（`draft` 事件）；同步接口 `sessions/[sid]/route.ts` 收 `text`；**评卷和审计都把 `draft` 滤掉**（`grader.ts`、`audit.ts`），不影响分数、不加 token |
| **原始作答 + 附件**（潜历反馈 ①） | 报告链接那页也先放「交付物原文」，再放交付文件（候选人上传的原文件可下载、录屏可播），再放 AI 评价 | `page.tsx` 的 `ReportOriginal`；数据 `GET /api/work/<token>/sessions/<sid>?full=1`（**交卷后**才给事件 + 问 AI 原文） |
| **开放模式交付文件能读了** | PDF / Word / Excel 也抽出文字给评卷（以前只读 txt / csv），交付物里每份文件带下载链接 | `src/lib/work/recording.ts` 的 `readTextFiles`（用 `samples.ts` 的 `extractText` + `xlsx`） |
| **AI 使用能力评分** | 报告里和结果分并列一项 0–100：提问 / 核验 / 取舍 / 分工 / 整合五个子项，每项带证据；按**这家企业、这个岗位的 AI 使用标准**评（哪些环节鼓励用 / 慎用 / 不能用、治理红线，每条标出处） | `src/lib/work/grader.ts`（`analyzeAiUse`）、`src/lib/work/ai-policy.ts`（新）；任务详情「AI 使用标准」标签；后台「法规清单」`GovernancePanel.tsx` + `api/admin/work/governance` |
| **最后一问（选填）** | 题目列表最后一问「如果再给一天，先改哪里」，占作答时间、写不写都行；插件作答页和侧边栏也有 | 做题页 `NEXT_Q`；`PluginWork.tsx`；插件 `extension/zhenhuo/sidepanel.js`；报告里单独一张卡 |
| **一眼看懂 + 成绩单** | 报告顶上逐条雷达（叠 AI 基线）+ 逐条对照条 + 一句话；候选人可领一页成绩单 `/work/<token>/card?s=`，可存 PDF | `WorkReport.tsx`；`src/app/work/[token]/card/page.tsx`（新） |
| **一道任务发一批人** | 做题情况按分排名（预览不算）；勾 2–4 人并排对比；导出候选名单 CSV；补算 AI 使用分 | `WorkTaskDetail.tsx`；`owner/route.ts` |
| **任务库自己长** | 题目资产库里 AI 基线 ≥70 的已发布任务列成候选，AI 去掉企业名写展示题面，管理员看过上架 | `src/lib/work/showcase.ts`、`ShowcaseAdmin.tsx`、`api/admin/work/showcase`；表 `work_showcase`（迁移 054） |
| **聊着出任务：柔性收集** | 首页引导用一句大白话说最实际的要求（举了例子，点一下填进输入框），助理一次问一件、细节先定默认再复述；上传的文件显示成输入框上方的小卡片，上传 / 看图没完锁住发送 | `src/app/work/new/chat/page.tsx`、`src/lib/work/chat-agent.ts` |
| **潜历 11-03 反馈的出任务 bug** | ① 对 AI 说「改成 180 分钟」改不动 → 新工具 `update_task_settings`，时长 20–240 分钟，任务书里写的时长一起换；任务空间也能直接改；② 按意见修订会把出任务的人上传的图 / 文件改成纯文字 → 原样保留；③ 原题直发的任务打开任务空间报错 → 修；④ 用参与链接里的 token 也能找到任务 | `generator.ts`（`clampMinutes` / `withMinutes` / `reviseTask` / `normCtx`）、`chat-agent.ts`、`owner/route.ts` PATCH、`WorkTaskDetail.tsx` |
| **做题台手机适配** | 窄屏一次只看一块（材料 / 作答 / AI 助手），底部三个标签切换 | `page.tsx` |
| **白板组件库 18 → 39 件** | 图表（柱状 / 折线 / 指标卡…）、表单、移动端组件等 | `benches/BoardBench.tsx`、`boardLibrary.ts` |
| **企业版 / 科研版工作台** | 登录前介绍页（`Welcome.tsx`）、默认浅色主题、首页铜版画、对话默认千问 3.7 Plus | `src/components/ws/*`、`public/workspace/*`、`public/ws-welcome/*` |

## 二、潜历那两条，给对方怎么说

- **看原始作答和附件**：出任务的人在任务空间「做题情况与评分」点某人的「看报告」——最上面是交付物原文，下面是交付文件（可下载）和答题历程，再往下是 AI 评价。发给别人的「报告链接」现在也是同样的顺序。
- **整个做题过程**：同一个抽屉里的「答题历程」。考试台（在线作答）记得最细，**有稿子快照**；开放模式（用自己的软件）靠录屏 + AI 看图；插件模式靠插件记的网页动作。**只有这一轮之后开始的作答才有稿子快照**，以前的作答时间轴里有动作和问 AI，没有快照。

## 三、打补丁

```bash
git apply --reject --binary 01-work.patch
# 6 处 reject，全部用 files/ 里合并好的版本覆盖（我们的新代码 + 你们的改动：人名换「产品负责人」、去学院分支、插件域名）
cp files/WorkReport.tsx            src/components/work/WorkReport.tsx
cp files/WorkTaskDetail.tsx        src/components/work/WorkTaskDetail.tsx
cp files/work-token-page.tsx       "src/app/work/[token]/page.tsx"
cp files/manifest.json             extension/zhenhuo/manifest.json      # 版本 0.2.2，域名是你们的
cp files/sidepanel.js              extension/zhenhuo/sidepanel.js       # 说明页链接是你们的
git checkout -- public/downloads/zhenhuo-plugin.json public/downloads/zhenhuo-plugin.zip   # 保留你们的，按下面重打包
find . -name '*.rej' -delete
npx tsc --noEmit    # 演练 0 错
```

迁移：`migrations/054_work_showcase.sql`（新表 `work_showcase` + 索引 + RLS，无外键）。你们没有 054，保留编号即可。

## 四、上线前

这一轮已经直接推到 simulator main（提交说明写「同步 companydata 11-04（第七轮）」），下面三件在那个提交里**已经做了**：
1. 插件按你们的域名重打包（`node scripts/build-zhenhuo.mjs`），v0.2.2，侧边栏有「最后一问」；
2. 成绩单页脚的 `www.aidataoffice.com` 去掉了；
3. 迁移 `054_work_showcase.sql` 放进了 `supabase/migrations/`——**库里还要跑一遍**。

`xlsx`、`unpdf` 你们已经装了。模型照旧走你们的模型总控；AI 使用能力评分和 AI 使用标准生成也会被换成千问。

## 五、刻意不带的

- `src/lib/llm-client.ts`：这边改成「优先 Claude、千问兜底」，你们有模型总控，**保留你们的**。
- 百业学院、/lab 一个 JD 生成整套（`src/lib/suite.ts`、`/lab/admin/suite`）。
- 真活操作手册的网页版（`public/work-guide/`，截图多、指向海外站）：手册另发 PDF。
