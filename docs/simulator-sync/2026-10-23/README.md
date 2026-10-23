# 给公司 simulator 的同步包（2026-10-23）· 第五轮

这一轮只带两样：**百业AI｜真活**（10-19 之后的全部进展，含真活插件）和**百业 AI 工作台**（企业版 `/workspace`、科研版 `/research`，一套代码两个入口）。
**百业学院（/college）不带**——这边的决定，学院的代码、表、数据一概不在包里；包里的注释也已去掉对它的引用。

- 补丁以 companydata `8dd9581`（上一包 10-19 覆盖到的位置）为底，覆盖 `8dd9581..903208f`。
- 目标是 simulator `main` = `d623b98`（10-23，已含你们自己的体验用户 trial、第三方激活码登录）。
- **演练结果**：把 `d623b98` 复制一份，按「三」打完四个补丁、覆盖 `files/`、补齐缺的库文件，`npx tsc --noEmit` 只剩一个错：缺 npm 包 `pinyin-pro`（装上即可）。

> 给 simulator 那边的 Claude：先读「一」「二」；「三」是代码；「四」是上线前要配的；「五」是刻意不带的和要你们自己决定的。

---

## 一、这次带过去什么

| 能力 | 用户看到的 | 代码 | 表 |
|---|---|---|---|
| **真活 · 出题升级** | 出题页 `/work/new`：企业 / 岗位边输边搜；**库里没有的企业贴一段介绍**，AI 先解析成画像再出题；**直接说要找什么样的人**也能出题（不套职位名）；出题等待是盖满整页的卡片，一行行列出平方在做什么；关联主体（共同高管 ≥2 位的两家）的资料也进题 | `01-work.patch`：`src/lib/work/generator.ts`、`src/app/work/new`、`src/components/work/GenProgress.tsx`、`CompanyRolePicker` | 无新表 |
| **真活 · 对比通用模型** | 真活空间里一键：同一句需求直接问千问出题，和平方出的题左右并排；**研判**用同一把尺子（7 项清单两边都打分）+ 对照企业库核实，标出通用模型的编造 / 不符 / 时间错位 / 没材料 / 评分缺依据（引用原文标红） | `01-work.patch`：`src/lib/work/compare.ts`、`/work/<token>/owner` | 结果存在 `work_tasks` 的 JSON 列里 |
| **真活 · 做题 AI** | 做题页的 AI 助理锁定千问 qwen-plus，出错兜底 DeepSeek V4 Pro（同一个百炼 key）；出题页那个下拉文案改成「给答题者配一个 AI 助理」 | `01-work.patch` + `04-llm-plumbing.patch`（llm-client 让 `deepseek-*` 也走百炼） | — |
| **真活插件**（第四种作答方式） | 候选人用自己的网页工具做题，浏览器插件只在「开始记录」到交卷之间记网页访问、页面文字、AI 网站上的对话（不记按键内容）；侧边栏能结束作答、剩 5 分钟 / 1 分钟提醒、到时自动交卷。专门页 `/work/plugin`（介绍 / 下载 / 启动，`?code=` 真活码一键关联）；出题页操作台多一个选项 `env=plugin` | `01-work.patch`：`extension/zhenhuo/`（插件源码）、`public/downloads/zhenhuo-plugin.zip`（打好的包）、`scripts/build-zhenhuo.mjs`、`/api/work/plugin/*`、`/work/plugin` | 过程写进 `work_sessions`（已有表） |
| **真活 · LinkedIn 交档案**（探索，不挂入口） | `/work/linkedin`：LinkedIn 账号主人用插件把自己的主页交上来，千问解析成中文档案（不入库）。插件只开 `linkedin.com/in/me/`，所以只能交本人的 | `01-work.patch`：`/work/linkedin`、`/api/work/linkedin/parse`、`extension/zhenhuo/linkedin.js` | 不入库 |
| **真活 · 权限** | 普通用户只能看 / 管自己出的题（和示范题）；管理员看全部。`/work/mine`、单题详情、AI 基线都按归属检查 | `01-work.patch`：`src/lib/work/access.ts`（只认 `role === 'admin'`，和你们的角色表兼容） | `work_tasks.created_by`（已有） |
| **百业 AI 工作台 · 企业版 `/workspace`** | 照 Claude 的骨架：左侧栏（新对话 + 总览 / 岗位 / 真活 / 职业空间 / 候选人 / 招聘项目 + 最近对话）、中间 AI 总控对话（工具调用过程可见，关键步骤停下来问）、右侧产物面板。一个账号绑一家企业，**AI 只能生成和自己企业相关的**。企业从注册起建进企业库（库里没有就新建 + AI 补画像；公开字段回流，内部信息只留工作台）；企业设置边聊边配；**招聘项目** = 一次招人一个项目（岗位与 JD → 收候选人 → 适配分析 → 真活 → 人才检测 → 面试 → offer → 入职带教）；登录前的介绍页 `/workspace/welcome` | `02-workspace.patch`：`src/lib/ws/`（agent / tools / org / projects / setup / zhichacha）、`/api/ws/*`、`src/app/workspace`、`src/components/ws/` | `migrations/039–042`（见下） |
| **百业 AI 工作台 · 科研版 `/research`** | 同一套工作台，机构类型是课题组 / 研究所：建**学科 / 研究领域空间**（结构化成典型研究岗 + 研究技能 + 硕博到 PI 的路径）和**研究岗空间**（贴着具体实验室的在研项目带教）；介绍页 `/research/welcome`。一个账号在企业版、科研版各有各的机构 | `02-workspace.patch` + `03-research-spaces.patch`（百业空间生成链路加 `discipline` / `researchPost` 两种模式；`/lab/spaces` 列表分「职业岗位体验 / 学科研究体验」） | `ws_orgs.kind`（042） |
| **记账** | 工作台的调用记在 `tool_name = 'workspace'`，归百业；Gemini 的思考 token 也算进输出（10-21 对账发现少记一半） | `04-llm-plumbing.patch`：`token-logger.ts`；`files/products.ts` | — |

## 二、这轮用户定下的口径（请照着做）

- **工作台两层**：平台运营 = 百业工厂 / 真活出题（能生成任何企业、任何行业的内容）；企业层 = 工作台，**工具没有企业参数，一律用 `org.company_id`，查题 / 查结果只认 `org_id`**。别把平台运营的东西暴露给企业用户。
- **关键步骤 AI 停下来问**（`ask_user`）：选哪个业务问题、发不发候选人、建不建空间——人在环里。
- **直接说要找什么样的人**：老板不套职位名，「我要一个能看懂 AI 行业的人来做投资」→ 就考这个本事。
- **做题 AI 锁千问**，兜底 DeepSeek；Claude 国内用不了不进这条链。出题页「出题模型」只改文案（怕被看成「就是个大模型」）。
- **对比通用模型只用千问**（国内同一竞争环境）；文案说「通用模型」，不点名。
- **真活插件和数据外采篮是完全两个东西**（名字、代码、包、页面都分开）；插件不覆盖已有模式。
- **真活权限**：出题要登录，做题免登录；普通用户只管自己出的题；示范题所有账号可见、只有管理员能改。
- 底色是淡淡的纸张色（Claude 那种），不是纯白；和 NeoWork 要有区分度。

## 三、代码：打补丁的顺序与手工合并

在 simulator 根目录（以 `d623b98` 为准）：

```bash
P=<companydata>/docs/simulator-sync/2026-10-23
git apply --reject --binary $P/01-work.patch            # 真活全部（含插件源码、打好的 zip、截图教程 ~0.9 MB）；应当零拒绝
git apply --reject --binary $P/02-workspace.patch       # 工作台全部（含介绍页截图 ~3.9 MB）；应当零拒绝
git apply --reject $P/03-research-spaces.patch          # 学科 / 研究岗空间；career.ts 会拒 1 处 → 用 files/agents/career.ts
git apply --reject $P/04-llm-plumbing.patch             # llm-client（deepseek、temperature）、token-logger；products.ts 会拒 → 用 files/products.ts
find . -name '*.rej' -not -path './node_modules/*' -delete

# 合并好的整文件（都是在 d623b98 上合的，保留了你们的 model-config / trial 逻辑）
cp $P/files/agents/career.ts src/lib/agents/career.ts
cp $P/files/products.ts src/lib/cost/products.ts
cp $P/files/proxy.ts src/proxy.ts

# 工作台 / 真活要用、simulator 里没有的库文件（来自数据工厂，只是纯函数和字段表）
cp $P/files/agents/company-profile.ts src/lib/agents/
cp $P/files/company-fields.ts $P/files/company-flora-id.ts $P/files/company-deep-topics.ts $P/files/region-codes.ts src/lib/
mkdir -p src/data && cp $P/files/data/region-options.json $P/files/data/world-cities.json src/data/

npm i pinyin-pro            # company-flora-id 用（给新建企业生成编号）
npx tsc --noEmit            # 演练：零错误
```

`files/` 里的合并要点：

| 文件 | 合并要点 |
|---|---|
| `agents/career.ts` | 你们的（`modelId = LLM_MODEL`）+ 第三个参数 `mode: 'career' \| 'discipline'`（学科模式换提示词） |
| `products.ts` | 你们的分组 + `workspace` 归百业 |
| `proxy.ts` | 你们的（含 trial 全部逻辑）+ 三处：`/api/work/companies` 要登录（企业库搜索是数据资产）；`/workspace`、`/research` 要登录、没登录转各自的 `/welcome`、登录页走 `/lab/login?next=`；matcher 加这两个路径。`/api/ws/*` 走你们原有的「API 一律要登录」 |
| `agents/company-profile.ts`、`company-fields.ts`、`company-flora-id.ts`、`company-deep-topics.ts`、`region-codes.ts` + `data/*.json` | companydata 原文，没改 |

**跳过的**：`skill-lab.ts` 的评分维度对齐（你们的 `matchDimensions` 已经更好，补丁里没带）。

**迁移**（编号从 039 起，不撞你们的 038_third_party_users；都可重复执行，都开了 RLS）：

| 迁移 | 内容 |
|---|---|
| `039_workspace.sql` | `ws_orgs` / `ws_members` / `ws_threads`；`work_tasks.org_id`、`skill_tasks.org_id` |
| `040_workspace_setup.sql` | `ws_orgs.website / context / setup_step`；`ws_roles`、`ws_contributions`（公开字段回流企业库的待审核记录） |
| `041_ws_projects.sql` | `ws_projects`、`ws_candidates`；`ws_threads / work_tasks / skill_tasks.project_id` |
| `042_ws_org_kind.sql` | `ws_orgs.kind`（company / lab）——科研版 |

真活这轮**没有新表**，插件和 LinkedIn 的数据都落在已有的 `work_sessions` / 不入库。

## 四、上线前要配的

- **模型**：工作台总控默认 `WS_MODEL=claude-opus-5-5`，你们没有 Anthropic key → `.env` 里设 `WS_MODEL=qwen3.7-plus`（`src/lib/ws/agent.ts` 自带千问路径，走 `DASHSCOPE_API_KEY`）。总控在前端能换模型，选单经你们的 `model-options` 的 `ALLOWED` 过滤，只会列千问。`WS_PROFILE_MODEL`（补企业画像）默认 `qwen-plus`，不用改。
- **真活做题 AI**：已锁 qwen-plus，兜底 `deepseek-v4-pro`（同一个 DASHSCOPE key；llm-client 这轮让 `deepseek-*` 也走百炼）。
- **录屏看图**仍然是 Claude（`recording.ts` 直接用 Anthropic SDK）——没 key 时这步跳过，和上一轮一样；换 qwen-vl 待你们做。
- **人才检测（智查查）**：`DATASQUARE_URL` + `DATASQUARE_API_KEY`，没配就是功能不可用（工具会报「未配置」），其余不受影响。
- **真活插件**：`extension/zhenhuo/manifest.json` 的 `matches` 和 `background.js` 的 `DEFAULT_API` 写的是海外域名 `www.aidataoffice.com`；换成你们的域名后跑 `node scripts/build-zhenhuo.mjs` 重新打 `public/downloads/zhenhuo-plugin.zip`。`/work/plugin` 页的截图教程（`public/work/plugin/*.jpg`）是海外站截的，域名字样不同，能用。
- **企业库字段**：工作台「企业落地」会往 `companies` 写画像字段（`company-fields.ts` 的 `PROFILE_FIELDS`：introduction、business_profile、growth_signals…）和 `jobs`（贴 JD 新建岗位）。你们的 `companies` / `jobs` 是 10-09 分叉时的结构，**先对一遍这些列在不在**，缺的加上（`ALTER TABLE … ADD COLUMN IF NOT EXISTS`），不然新建企业那一步会报列不存在。

## 五、刻意不带的

- **百业学院** `/college` 全部（教务处、学院秘书、学员 / 学籍 / 去向表、两支片子）。
- **账号层级 `baiye_user`**（海外这边 10-23 加的「只用百业、碰不到数据资产」的对外角色，角色按库实时判）。你们已经有 `trial` 在走类似的路，就不往这边硬合了；需要的话 companydata 的 `src/lib/roles.ts` + `src/proxy.ts`（`liveRole` 那段）可以当参考。真活的 `access.ts` 只认 `role === 'admin'`，和你们的角色表天然兼容。
- 数据工厂的东西（企业 / 岗位 / 职业 / 科研产品库、千里标签、采集脚本、迁移 037_job_field_values…046_field_formats）。
- `/lab` 这边 10-19 之后的其它改动（证书、素材库、工作室权限 `lab-owner`、首页改版）——按 10-19 的约定，公司版由产品经理按需求挑，这轮没要就没带。

## 六、合入后的跟进（2026-10-23 晚，simulator 已合到 3dd5ea3）

你们反馈的三处在 companydata `5cb96e6` 修了，打 `06-followup-1023.patch`（以 3dd5ea3 上的这三个文件为底，应当零拒绝），再 `npm i unpdf`：

| 反馈 | 处理 |
|---|---|
| `/work/new` 调数据工厂的 `/api/db/companies/:id/deep-research` 404 | `GenProgress.tsx`：接口不 ok 就当这家没有深度画像专题，不报错、不再依赖 |
| `companies.source` 老结构是 text，工作台写数组存成字面量 | `ws/setup.ts`：先按数组写，库报类型错就退回写字符串 `'企业工作台'`；你们已经存进去的那条「宁德时代」如果 source 是 `'["企业工作台"]'`，手工改一下 |
| PDF 简历直接调 Claude，国内不通 | `ws/projects.ts`：有 `ANTHROPIC_API_KEY` 才试 Claude，没有或失败就用 `unpdf`（纯 JS）把 PDF 抽成文字，再和文本简历一样交给千问 qwen-plus；扫描件抽不出字会明确提示贴文本 |

`recording.ts`（录屏看图）仍是 Claude、没 key 跳过，换 qwen-vl 还是留给你们。
`WS_MODEL` 默认值改读你们的模型总控——对，这边不动。你们在测试账号下留的机构和题不用清。
