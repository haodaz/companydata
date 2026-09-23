# 智能企业数据工厂

以**企业**为个体的 AI 数据平台：企业画像 + 校招项目 / 应届生岗位 / 实习（含远程）的采集、结构化与人工审核。
由院校版 `programcrawler`（全球有数）派生，技术栈与工作方式完全一致，**数据库独立**。

- 目标企业：**中国企业 / 中外合资 / 海外百强**（`companies.segment`）
- 采集重点：**企业信息、校招项目、实习与远程实习**；社招暂不采集（任务里留了「含社招」开关）
- 主线是**从无到有**：AI 建名单 → 找 URL → 提取岗位 → 审核 → 导出

## 概念映射（院校版 → 企业版）

| 院校版 | 企业版 |
| --- | --- |
| 院校 `institutes` | 企业 `companies`（无预置名单，AI 建名单 / 采集时自动建档） |
| 留学项目 `programs` | 校招岗位 `jobs`（校招 / 实习 / 管培专项） |
| 信息源 `url_sources`：官网 / 项目 / 国际生 / 师资 | 官网 / 企业信息 / **校招与实习** / 岗位详情 / 招聘总入口 |
| URL 获取工具（Finder） | 同名；检索维度 = 校招+实习、企业官网+企业信息 |
| 项目信息提取（Fetcher + Structurer） | 校招岗位提取；提取成功自动写入岗位库（待审核） |
| 院校基本信息 AI 补全 | 企业画像 AI 补全（分类、行业、总部、规模、校招官网、校招概况…） |
| 克隆流水线 / 专业库 / 师资 / 国际生政策 | 未搬（企业版从零建库，不存在逐年克隆） |

## 虚拟工厂（`/office`）

同一套能力的另一种操作界面：**给 AI 员工下任务**，而不是自己点工具。产出直接进正式库，和数据后台（`/admin`）完全互通。

- **生产线 `/office`**：一句话下达总任务（如「采集 腾讯、宝洁 的 2027 届校招和实习」）→ 厂长 Max 排产 →
  建名单 → 企业画像 → 寻源 → 抓取与提炼 → 质检，逐道工序可视化；已有画像 / 信息源的企业自动复用，不重复耗 Token。
- **AI 员工 `/office/employees`**：7 位员工各对应一项真实能力，可单独对话——问问题，或直接派活（它会调用平台接口去做）。

| 员工 | 工位 | 对应能力 |
| --- | --- | --- |
| Max 厂长 | 总控室 | 拆解总任务、调度流水线（`/api/office/plan`） |
| Scout 名单情报官 | 情报科 | AI 建名单 |
| Alice 企业画像师 | 画像车间 | 企业画像 AI 补全 |
| Jarvis 寻源侦察员 | 寻源车间 | 校招 / 实习 URL 检索入库 |
| Kelly 网页抓取工 + Dr. Thorne 结构化分析师 | 抓取车间 / 提炼实验室 | Fetcher + Structurer，岗位入库 |
| Nova 质检员 | 质检站 | 完整度、待审核、缺失字段统计（不耗 Token） |

员工定义在 `src/lib/factory-agents.ts`，流水线执行库在 `src/lib/factory-pipeline.ts`。
形象素材在 `public/factory/`（复用自 myAI：像素风只用于生产线，写实形象用于 AI 员工页；登录页主视觉由通义万相生成）。

## 数字技能空间（`/lab`，实验）

每一份 JD 构建一个虚拟技能空间，核心是一个拥有这份 JD 技能的优秀员工 AI（有自己的档案：哪家公司哪个岗、会什么、能解决什么）。
入口在数据后台侧栏「实验室」，新窗口打开；界面刻意和后台不同（浅色科技感）。

- **JD 拆解**：岗位库里的真实 JD → 职责原句 → 能力项 → 可检验的任务 → 模拟操作台 + 评分标准
- **考验新人**：新兵在模拟操作台上走一遍（选第一步、下钻数据、给事件贴标签、分预算、设止损…），逐步对照专家轨迹，再按岗位标准评分
- **向专家学习**：专家在同一个操作台走一遍，AI 核心记录轨迹并追问「为什么」，蒸馏成技能卡（可叠加）
- **解决问题**：把真实问题交给 AI 核心，按专家的做法给方案
- **错位时空**：技能每被调用一次记一笔账（何时、何地、谁、产出了什么）

需要先执行 `supabase/migrations/002_skill_lab.sql`。首页「从岗位 JD 构建新空间」目前可选两份 JD，选中后构建出对应的预置空间
（字节跳动 · 数据分析师-番茄小说；Unilever · UFLP Marketing），两条 JD 抓取自企业官方招聘站，题目情境与数据为虚构练习材料。
代码：`src/lib/skill-lab*.ts`、`src/lib/skill-sim.ts`、`src/lib/agents/skill-lab.ts`、`src/components/lab/SimRunner.tsx`、`src/app/lab/`、`src/app/api/lab/`。

生产线的任务历史（表 `factory_runs`）也在 002 里。

## 工作流（数据后台 `/admin`）

1. **企业实体库 → AI 建名单**：一句话描述（如「汽车行业中外合资企业 20 家」），联网生成名单，勾选导入。
2. **AI 补全画像**：勾选企业批量补全，只填空字段，每个字段带来源链接。
3. **URL 获取工具**：输入企业 → 检索校招官网 / 应届生 / 实习 / 远程实习 / 管培 / 留学生专场 → 存入信息源库。
4. **校招岗位提取**：建任务 → 从信息源库选 URL → 启动。抓主页 → 大模型挑子页面 → 分批抓取 → 结构化 → 入库。
5. **校招岗位库**：筛选（类型 / 招聘季 / 远程 / 面向留学生）、审核、编辑、导出 CSV。

再次提取同一页面：新岗位入库、已有岗位更新、页面上消失的岗位标记「已下线」；
人工审核定论的岗位不覆盖，人工改过的字段会锁定不覆盖。

**AI 补全**（岗位库「AI 补全」）：先打开岗位详情页重新提取；求职关键字段仍缺则联网检索官方信息再补。只填空字段，每个字段的来源链接记在 `jobs.ai_sources`。
**人工审核**（企业、岗位同一套）：待审核 / 通过 / 不通过 / 未更新 / 隐藏；定论后 AI 不再覆盖；人工编辑过的字段锁定。AI 新写入的记录默认「待审核」。
**URL 获取工具 · 批处理**：粘贴名单或从企业库多选，逐家检索并落库，可暂停 / 停止。

### 企业画像工具（独立于岗位提取，`/admin/tool-company`，migration 005）

一家企业一条流水线：**定位官方页面**（官网 / 关于 / 投资者关系 / 新闻 / 管理团队 / 文化福利，写入信息源库）→ **抓取 raw**（Jina 整页原文保留）→ **官方页面提取**（不联网）→ **分主题联网检索**（基础与工商 / 融资历史 / 近期动态与舆情 / 管理团队 / 行业与赛道 / 校招与雇主口碑，每主题一次）→ **合并入库**（先到先得、只填空；人工锁定字段与审核定论的企业不覆盖）。

- **只有任务这一套 UI**：新建任务 → 从企业库多选 / 粘贴名单 / 加一家 → 启动；单家画像 = 任务里只放一家（企业库、健康看板的「画像」按钮会自动建好单家任务）。可暂停 / 停止 / 单家重跑；「只跑缺的」跳过目标字段已齐且子实体已有记录的主题。
- 每家企业一个三栏视图（流水日志 / 结构化结果 + Raw Markdown + 各工序原始返回 / AI 逐工序摘要 + 终局 JSON），与院校版师资工具同一形态。
- **终局 vs raw**：终局字段 = `companies` + 三个子实体 `company_financings` / `company_news` / `company_executives`（字段名按数据同事的字段表，含 external_id / data_source_id / org_id / if_delete / latest_full_sync_task_id 同步字段）；raw 层在 `company_crawl_logs`（raw_markdown、pages_fetched、raw_searches、structured_json），以后加字段可从 raw 重新提炼。
- **子实体审核**：企业详情页三个 tab 逐条通过 / 不通过 / 软删（if_delete，流水线不复活）；人工编辑过的字段锁定。
- **完整度**：`computeCompanyCompleteness`（字段按权重 + 三个子实体有无），写在 `companies.completeness_score`。
- **健康看板** `/admin/health-company`：字段填充率、子实体覆盖、动态新鲜度、完整度分布、审核与分类、最弱企业、成本最高企业。
- **成本**：每次调用记 `token_usage_logs`（tool_name = company-pipeline，institution = 企业名，batch_id = 本次运行），跑完按 batch_id 汇总到日志的 llm_calls / token_total / cost_usd。
- 舆情、求职者口碑只用联网检索能搜到的公开讨论，标注为观点；不抓 Glassdoor / 看准 / 脉脉。

## 本地运行

```bash
npm install
cp .env.example .env.local   # 变量名与院校版完全一致，只有 Supabase 两项换成企业版项目
npm run dev -- -p 3003
```

### 数据库（独立的 Supabase 项目）

在 Supabase **SQL Editor** 里整段执行 `supabase/migrations/001_init.sql`（可重复执行）。
所有表开启 RLS 且不建 policy，只有服务端的 `SUPABASE_SERVICE_ROLE_KEY` 能访问。

### 账号

打开 `/register` 注册，**第一个注册的账号自动成为管理员**，其余为普通账号（管理员可在「系统账号管理」里调整）。
除 `/api/auth/*` 外，所有 API 都需要登录。

## 目录

```
supabase/migrations/               001 基础表 / 002 技能空间 / 003 字段对齐 / 004 审核与来源 / 005 企业画像流水线与子实体
src/lib/job-fields.ts              岗位字段单一来源（提示词 schema / 详情页 / 导出 / 完整度）
src/lib/company-fields.ts          企业字段、分类、类型
src/lib/url-types.ts               信息源分类
src/lib/job-store.ts               岗位入库：去重、下线判定、审核保护
src/lib/agents/                    finder-pipeline / fetcher / structurer-job / company-profile（轻量一次检索）/ company-pipeline（画像流水线）
src/lib/company-merge.ts           画像值清洗、子实体去重键、多来源合并（前后端共用）
src/lib/company-store.ts           画像入库：只填空、锁定 / 定论保护、子实体 upsert、完整度、成本汇总
src/lib/company-pipeline-client.ts 浏览器端编排（单家 / 批处理共用）
src/app/admin/                     页面
src/app/api/                       接口（agents = 大模型，db / admin = 数据）
```

调整要采集的岗位字段：改 `src/lib/job-fields.ts`，并在新的 migration 里给 `jobs` 表加列。

### 与平方数据基础设施的字段对齐（`003_align_fields.sql`）

`companies` / `jobs` 的字段名以数据同事提供的《岗位及公司字段.xlsx》为准（对方有的字段我们都有、同名）；我们多出来的字段保留。
- 改名（数据保留）：companies `website→official_website`、`description→introduction`、`founded_year→info_founding_year`、`employee_count→company_scale`、`revenue→operating_revenue`、`hq_city→city`、`hq_country→country`；
  jobs `title→name`、`company→institute_or_company_name`、`qualifications→overview`、`benefits→welfare`、`job_url→link`、`apply_url→application_website`、`posted_date→official_publish_date`、`application_start→application_start_date_str`、`deadline→application_end_date_str`、`salary_min/max→internship_salary_min/max`、`salary_period→salary_unit`（值改为 per_month 等）、`experience_years_min→exp_years`、`experience_requirement→exp_labels`、`skills→skill_labels`、`headcount→number_of_recruits`。
- 值口径未对齐、留给同步层：对方 `city / country / province` 存行政区划代码，我们存名称；对方公司 `kind` 是法律形态，我们的 `company_type` 是所有制分类，两者并存；岗位 `kind` 按对方枚举由 `job_type` 推导。

> Next.js 16 有破坏性变更，写代码前先看 `node_modules/next/dist/docs/`（见 `AGENTS.md`）。
