# 给公司 simulator 的同步说明（2026-10-09）

海外这套（companydata）上 /lab 新做的东西，公司 `eng/simulator` 怎么复用。
分叉点：两边最后一个共同的 /lab 提交是 `444b2d5`（修「生成职业空间时整页崩溃」）。之后海外这边 31 个提交，其中 /lab 相关的按下面挑。

> 数据工厂（企业库、岗位抓取、飞轮、记账）技术同事正在拆，**这次只同步 /lab**。几个两边都在用的底层文件（模型调用、记账）单独列出来。

---

## 一、这次新增了什么（产品层面）

| 能力 | 用户看到的 | 入口 |
|---|---|---|
| 「一天」页 | 考考你 / 我教你 / 你教我 都先落在时间轴页：左边一天的时间轴，右边整段内容（场景大图、这一段、会遇到谁、这一段考什么） | `/lab/<空间>?m=test` |
| 每段介绍页 + 连续往下走 | 进操作台先看这一幕是什么；走完一段可以直接进下一段 | 操作台内 |
| 你教我（原教教我） | 请一位资深从业者把这一天逐段示范，每段走完接受追问，吸收后各段示范存回各段 | `?m=learn` |
| 百业工厂 · 工作室 | 编辑每一章（时段 / 标题 / 类型 / 步骤），校验「一天的逻辑」（早上不许复盘），草稿 / 发布 / 锁定，试玩 | `/lab/studio/<空间>` |
| 排骨架 + 按格生成 | AI 先排一天 6–8 格，管理员一格一格生成，后台任务有进度 | 工作室顶部 / 每章上方 |
| 角色表 + 素材库 | 每个空间的人物 P / 场景 S / 道具 T，指向全局素材库 A-xxxx；同样的不重画，新画立刻归库 | 工作室左栏、`/lab/assets` |
| 体验百业（体验馆） | 所有已发布空间，像应用商店，点开就玩 | `/lab/gallery` |
| 成绩与证书夹 | 每段一份成绩（仿雅思：各维度 1–9 等级、和老师傅一致度、超过多少人、雷达图）；每段都 ≥ 60 分才发证书（封皮 → 证书 \| 画作 → 各段成绩 → 全天成绩），签发：平方创想 + 方略研究院 | `/lab/cert/day?s=…`、`/lab/me` |
| 我的进度与证书 | 按访客编号（浏览器 + 登录账号）找回历史；每个职业一排成绩卡 + 一本证书夹 | `/lab/me` |

---

## 二、要跑的迁移（只要 /lab 的）

按顺序跑，都可以重复执行（适合 CI 的 sync-db 整份重跑）：

| 迁移 | 内容 | 依赖 |
|---|---|---|
| `015_lab_chapters.sql` | 章节表 `lab_chapters`、生成任务表 `lab_jobs`、`skill_tasks.bible`、`skill_submissions.chapter_id`；老空间的 sim 变成第 1 章；触发器兜底同步 | 002（技能实验室） |
| `016_lab_cast_assets.sql` | 角色表 `lab_cast`；素材库 `lab_art_assets` 加道具、编号、规范类型名等；老空间的立绘 / 场景图回填 | 009（素材库）、015 |
| `017_lab_visitor.sql` | `skill_submissions.visitor_id`（我的历史 / 证书夹按它找） | — |

**不要跑** 012 / 013 / 014：那是数据工厂的（flora 编号、需登录 URL、记账价目表）。
（`token-logger.ts` 在 014 没跑时会自动去掉新列再写，不影响 /lab。）

跑完 016 后，老空间的角色表名字比较乱（台词里的说话人写成一句话），跑一次整理脚本：

```bash
npx tsx scripts/lab-normalize-cast.mts --dry --model qwen-max   # 先看方案
npx tsx scripts/lab-normalize-cast.mts --model qwen-max         # 落库
```

已有多章的空间补评分标准：`npx tsx scripts/lab-chapter-rubric.mts --model qwen-max`

---

## 三、要复制的代码

### 1. 整个新增的文件（直接拷）

```
src/lib/lab-studio.ts            工作室校验（前后端共用）：一天的规则、步骤结构、示范轨迹
src/lib/lab-studio-server.ts     工作室读空间（含草稿、角色表、校验结果）
src/lib/lab-cast.ts              角色表 / 素材库的纯函数（编号、出场记录、把角色表的图套到章节）
src/lib/lab-cast-server.ts       角色表 / 素材库读写、按规范类型名复用、现画并归库
src/lib/lab-jobs.ts              生成任务（lab_jobs，after() 后台跑）
src/lib/lab-cert.ts              等级换算（1–9）、证书编号、及格线 60、访客编号
src/lib/lab-cert-server.ts       成绩单数据（维度、超过多少人、同段平均、画作页的人和场景、社会价值）
src/lib/agents/lab-chapters.ts   排一天骨架、按格生成章节（含评分标准、示范答案、角色复用、画图归库）
src/components/lab/CertFolio.tsx 证书夹（封皮、证书、画作、成绩记录、能力画像、翻页）+ 书架小封皮

src/app/lab/studio/[id]/page.tsx      工作室
src/app/lab/assets/page.tsx           素材库
src/app/lab/gallery/page.tsx          体验馆
src/app/lab/me/page.tsx               我的进度与证书
src/app/lab/cert/day/page.tsx         证书夹
src/app/lab/cert/[sid]/page.tsx       单段链接 → 跳进证书夹

src/app/api/lab/studio/**             工作室接口（章节、角色、骨架、生成、任务进度、画图）
src/app/api/lab/assets/**             素材库接口
src/app/api/lab/cert/**               成绩 / 证书夹接口（公开）
src/app/api/lab/me/route.ts           我的历史

public/lab/brand/visionsquare.png、fanglue.png   签发单位 logo
scripts/lab-normalize-cast.mts、lab-chapter-rubric.mts
docs/lab-studio.md                    方案文档
```

### 2. 改过的文件（要合并，别整份覆盖）

| 文件 | 改了什么 |
|---|---|
| `src/app/lab/[id]/page.tsx` | 「一天」页（DayView）、每段介绍页（ChapterIntro）、走完进下一段、你教我逐段示范、评分按章、访客编号、姓名只问一次 |
| `src/app/lab/layout.tsx` | 导航改成「首页 / 百业工厂 / 体验百业」；窄屏顶栏 |
| `src/app/lab/page.tsx` | 首页文案改成「一整天」的说法 |
| `src/app/lab/spaces/page.tsx` | 卡片上「编辑」进工作室、素材库入口、完成页文案 |
| `src/components/lab/SimRunner.tsx` | 去掉题卡里多余的「退出操作台」 |
| `src/lib/skill-lab-server.ts` | `loadSpace` 带章节和角色表、`sortByDay`、`chapterTask`（按章评分）、通用评分四项 |
| `src/lib/skill-lab.ts` | `GENERIC_CHAPTER_RUBRIC` |
| `src/lib/skill-sim.ts` | 步骤加 `place` / `props` |
| `src/lib/agents/skill-lab-build.ts` | 导出 `ART_SLOTS` / `NPC_SLOTS` |
| `src/app/api/lab/spaces/route.ts` | 列表带章节概况和封面 |
| `src/app/api/lab/spaces/[id]/submit/route.ts` | 按这一章的题面和评分标准评分；记 `chapter_id`、`visitor_id` |
| `src/app/api/lab/spaces/[id]/distill/route.ts` | 吸收时各段示范存回各段 |
| `src/proxy.ts` | 见下面「拦截」 |

两边共用的底层（数据工厂拆完后 simulator 也要留着）：

| 文件 | 改了什么 |
|---|---|
| `src/lib/llm-client.ts` | 接入通义千问（DashScope 原生接口，`enable_search` 联网 + 来源）；`generateCheap` 便宜模型默认 `qwen-plus` |
| `src/lib/agents/search-llm.ts` | 联网检索走千问时的分支、重试 |
| `src/lib/token-logger.ts` | 记账：价目表、联网搜索次数（014 没跑时自动降级） |
| `src/lib/model-context.tsx` | 模型下拉加「通义千问 Plus / Max」 |

合并做法（在 simulator 仓库里）：

```bash
# 在 companydata 里导出 /lab 相关的改动
git diff --binary 444b2d5..HEAD -- src/app/lab src/app/api/lab src/components/lab src/lib/lab-*.ts src/lib/skill-*.ts src/lib/agents/lab-chapters.ts src/lib/agents/skill-lab-build.ts src/lib/llm-client.ts src/lib/agents/search-llm.ts src/lib/token-logger.ts src/lib/model-context.tsx src/proxy.ts public/lab/brand scripts/lab-*.mts supabase/migrations/015_lab_chapters.sql supabase/migrations/016_lab_cast_assets.sql supabase/migrations/017_lab_visitor.sql docs/lab-studio.md > lab-sync.patch
# 在 simulator 里
git apply --3way lab-sync.patch
```

2026-10-09 在 simulator 当前 main（`eaef8ba`）上试过 `git apply --check --3way`：**整份能干净打上，没有冲突**（图片要带 `--binary`）。
以后公司那边改了 `src/proxy.ts`（接统一认证）或 `llm-client.ts`，冲突会出在这两个文件，按「四、拦截」的规则合。

---

## 四、拦截（公司和海外只差在这里）

- 海外 `LAB_PUBLIC=1`：整个 /lab 免登录（融资演示）。**公司不设**，/lab 照常要登录。
- 不管设不设，这些**始终要登录**：`/lab/studio/*`、`/lab/assets`、`/api/lab/studio/*`、`/api/lab/assets*`、生成 / 预置示范 / 删除空间 / 发邀请 / 蒸馏。
- 这些**始终公开**：`/lab/cert/*`、`/api/lab/cert/*`（证书链接本身就是查验方式，分享出去的人不该被拦去登录）；`/lab/**/*.png` 等静态图（含 `/lab/brand/`）。
- 访客编号：登录用户是 `u:<账号 id>`，没登录是浏览器本地随机编号。公司接统一认证后，`useUser()` 拿到的 id 就是账号，换设备也找得回历史。

---

## 五、环境变量

| 变量 | 说明 | 公司建议 |
|---|---|---|
| `LAB_PUBLIC` | 1 = /lab 免登录 | 不设 |
| `NEXT_PUBLIC_LAB_GEN_MODEL` | 工作室排骨架 / 按格生成的默认模型 | `qwen-max`（国内用不了 OpenAI） |
| `CHEAP_MODEL` | 简单活的便宜模型（社会价值文案、整理角色表 cheap 模式等） | `qwen-plus`（默认就是） |
| `DASHSCOPE_API_KEY` | 通义千问 + 通义万相画图 | 公司的 |
| `NEXT_PUBLIC_SUPABASE_URL` 等 | 公司自建库；`next.config` 的图片白名单按它放行 `lab-art` 桶 | 公司的 |

---

## 六、注意事项

1. **生成用的模型**：海外示范（开腹医师一整天）用 `gpt-5.6-terra` 生成、人工改过人物。国内用 `qwen-max` 效果待验证——建议先拿一个空间排骨架 + 生成一格，看质量再铺开。便宜模型（qwen-plus）会把「患者和家属」合成一个角色、把职务称呼当成物件，整理角色表要用好一点的模型。
2. **社会价值文案**：每个职业第一次开证书时用便宜模型写一次，提示词明确「不写任何数字」（之前出现过编造的百分比），存在 `skill_tasks.profile.social_value`。
3. **素材库复用规则**：同一空间里不同的人不共用一张脸；人物的规范类型名要带性别年龄段（「患者家属·中年男」），否则会出现女儿和儿子同一张脸。数字职人本人的形象不复用。
4. **评分**：第 2 段以后按各自的题面和评分标准评分（以前都按第 1 段评，会诊那段拿阑尾手术的标准打分——simulator 里如果已经有多章数据，跑 `lab-chapter-rubric.mts` 补评分标准）。
5. **证书**：每段 ≥ 60 分（等级 5.5「基本胜任」）才算通过，取最好的一次；全部通过才发证书。及格线在 `src/lib/lab-cert.ts` 的 `PASS_SCORE`。
6. **老数据迁移**：海外已生成的空间、章节、角色表、素材怎么搬到公司库——空间包 v2（带章节、角色表）还没做，见 `docs/lab-studio.md` 第 5 步。
