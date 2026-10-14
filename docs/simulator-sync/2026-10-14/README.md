# 给公司 simulator 的同步包（2026-10-14）

海外这套（companydata）10-12 下午到 10-14 在 /lab 上做的东西，公司 `eng/simulator` 怎么复用。
上一包（10-12）覆盖到 companydata `d41af4f`，simulator 已经在 `9fef660` 收下。这一包的补丁都以 `d41af4f` 为底，覆盖 `d41af4f..bbaae9e` 的 /lab 改动。
按约定这边不直接改 simulator，只出补丁和说明。**数据工厂的东西不带**，演示专用的也不带（见文末）。

**演练结果**：把 simulator `main`（`92fda81`，已有 `model-config.ts` 模型总控）复制一份，按「三」的顺序打完五个补丁，再做完「四」里的 5 处手工合并，`npx tsc --noEmit` 零报错。

> 给 simulator 那边的 Claude：先读「一」「二」，知道这轮做了什么、用户定了哪些口径；再按「三」「四」合；「五」是上线前要换掉的海外专属内容和写死的模型。

---

## 一、这次带过去什么（产品层面）

| 能力 | 用户 / 运营看到的 | 入口 |
|---|---|---|
| **和我聊**（这轮的主角） | 数字职人陪你聊这一行。独立浅色页：左边立绘站在工作场景里，右边对话；每句事实带出处编号，点了右侧滑出资料面板（三栏联动）。职业图谱、薪资、场所与工具、在招岗位、「我的行当」这些**功能级资料**在气泡后面出一张**预览卡片**，点「展开看」右侧展开；普通出处还是一行。输入框上方常驻**快捷提问**「职业地图」「我的行当」，问过的收起 | 人物首页第一个大按钮 → `/lab/<空间>/chat` |
| 和我聊 · 可信 | 事实只能来自平方知识库（职业、发展图谱、薪资、典型任务、场所 / 工位 / 工具、行业标准、在招岗位、企业、产业链上下游、问答库）；回答后**逐句核查**，没依据的打回重写，仍没依据就删；资料里没有的才联网，必须说明「网上的说法」、标 W 编号、提醒甄别，**只认真实搜索结果里的链接**（模型自己编的网址一律不要）；前景 / 会不会被取代这类判断题必须去查，不许自己推 | 同上 |
| 给 NOVA 起名字 | 人物首页大按钮上方一行默认亮出名字（如「NOVA-08 ✎ 给 TA 起个名字」），改了只有自己看得到（登录按账号、游客按访客编号）；聊天里职人用这个名字自称 | 人物首页、对话页 |
| 人物首页重排 | 「和我聊」是第一个大按钮、**唯一实心渐变**；我教你 / 考考你 / 你教我 / 问问我改成同尺寸毛玻璃 + 顶上一道细色线；「我的行当」「职业地图」不再单列入口（进了和我聊的快捷提问）；名字和「走进 3D」收在大按钮上方一行，右上角只留管理类按钮 | `/lab/<空间>` |
| 新建空间自动对上职业 | 建空间时按岗位名 / 角色在职业库里找，找不到就当场建档（千问联网检索），图谱 / 场所 / 典型任务后台补 | 建空间后自动 |
| 专家数采 · 规则出处 | 工位里每条规则回挂出处：**标准条款 / 老师傅经验 / AI 推断**（迁移 023）；工作室校验新增 [S1] 没有出处、[S2] 判违规的规则只有 AI 推断 | 工作室 |
| 专家数采 · 示范评审 | 一次工位操作逐条对照规则出处，五道关（守红线 / 达目标 / 讲得清 / 可复现 / 有增量）+ 三档（示范级 / 参考级 / 不采纳转反例），**不靠 AI 自己打分**；生成盯着偏差问的访谈问题 | 工作室「示范评审」→ `/lab/studio/review` |
| 专家数采 · 访谈与回写 | 「你教我」访谈盯着偏差问（越过的红线 / 和老师傅经验不一致 / AI 推断的规则 / 没达成的目标）；吸收时把访谈结论写回规则出处：认了的 AI 推断升级为老师傅经验，不认的记修改建议进留痕，红线分歧不推翻标准 | `?m=learn` |
| 体验百业里的「你教我」 | 每个空间都能「你教我」：点了自动领这个空间的邀请票进去示范，记一笔留痕，同 IP 每小时最多 5 次；留名改成进来就弹的小窗 | `/lab/gallery` → 空间 |
| 权限与体验视角 | 百业工厂要登录（游客只有首页、体验百业、我的证书）；工厂可粘贴全新 JD 建空间；体验视角（未登录或 `?from=gallery`）不显示我被用在哪 / 我的来历；导航加「我的证书」；体验百业精选在前（名单 `src/lib/lab-featured.ts`） | 导航 |
| 「一天」页两处修复 | 左侧时间轴滚动时钉住（`.lab` 的 `overflow-x` 从 hidden 改 clip）；进入按钮从大图上挪到图下面 | `?m=test` |
| 首页改版 | banner = 我们自己空间的循环画面（火箭 3D → 锅炉房 360° → 手术室 3D → 指挥大厅 3D → 咖啡吧台 3D，约 49 秒无缝），几乎满屏、蒙版更透；第二屏体验视频（带封面和字幕）；「一个职业，四种空间：可信、升维、求真、心智」；「让资深技能被记录、被校正、被再用」配动态图（KeepChart）；走马灯和企业带挪到 2–3 模块之间；首屏底部「下滑了解 AI 百业」提示；**首页只有深色** | `/lab` |

## 二、这轮用户定下的口径（请照着做）

**可信（底线）**
- 绝对不编造。事实必须出自资料并标来源编号；角色感靠语气和视角，不靠编个人经历。
- 网上查来的必须说明来自互联网、提醒甄别，链接只用真实搜索结果；判断性问题没依据就去查，不许自己推。
- 首页、宣传上只放验证过的数字；**小数字不放**（「61 位数字职人、13 个领域」这种反而显得小）。
- 3D 重建坏了宁可撤掉也不放（这轮摊铺现场就撤了：几乎全是针状高斯，挪机位、滤浮点都救不回来）。

**AI 陪伴，不让人干读**
- 用户原话：不想让用户纯阅读大量内容，而是有 AI 伴随。大块内容页（职业地图、行当）改成对话里的快捷提问，由职人带着讲。
- 功能级资料用**预览卡片**（标签 + 标题 + 两三行预览 + 「展开看」按钮），和普通一行出处要明显不同；点了右侧展开，不跳走。

**界面**
- 一屏一个焦点：主行动唯一实心，其余降成毛玻璃；一排同样的蓝色「显眼但不好看」。
- 操作收在一处，不要散在右上角、右下角；浮动按钮贴内容区（1280 宽）的右边，不贴屏幕边。
- 名字默认就亮出来，可改；昵称只自己看。
- 首页：创造是管理员、体验是用户——首页不放「亲手造一个」，hero 只有「体验百业」；标题直说，不自问自答。

**动态画面（banner 等）**
- 镜头只水平移 + 缓慢推进，不要上下晃（∞ 字轨迹看三轮就晕）；360° 慢转约 6°/秒，用全景原图逐帧算角度（每帧转同样多），不要拿录屏放慢（会卡会抖）；锅炉房「转太快会头晕」「完全静止又不对」。
- 一段 10 秒左右，段间 1 秒淡入淡出，最后一段淡回第一段，无缝循环。
- 看起来像自然风光的不放（珊瑚礁会被当成风景片，不像职业空间）。
- **换媒体文件必须改文件名**（`spaces-loop-v4.mp4`），同名替换会被缓存，表现为「播完三段就黑屏」。

**数据与库**
- 新表必须同时开 RLS（`ENABLE ROW LEVEL SECURITY`）；这轮新表都开了。

## 三、迁移

| 迁移 | 内容 | 备注 |
|---|---|---|
| `022_industry_standards.sql` | 行业标准库 `industry_standards`、标准与空间规则的关联 `standard_links`（另有 `standard_tasks` / `standard_searches` 是获取工具的任务表，建了不用也无妨） | 规则出处要用 `standard_links` |
| `023_standard_links_basis.sql` | `standard_links` 加 `basis`（standard / expert / ai）、`evidence` | |
| `files/024_occupations.sql` | **simulator 版 024**：只有职业实体库两张表 `occupations`、`occupation_salaries` | companydata 的 024 还带企业工商名称、岗位来源两列，是数据工厂的，不要 |
| `025_occupation_graph_regions.sql` | 职业发展图谱 `occupations.career_map`、各地区薪资 `occupation_region_salaries` | |
| `026_places_items.sql` | 场所 / 工位 / 工具设备 / 典型任务 + 实体关联 `entity_links` | |
| `027_persona_chat.sql` | 职人人设 `occupations.persona`、对话记录 `persona_chats` | |
| `028_lab_nicknames.sql` | 昵称 `lab_nicknames` | |
| `029_kg_questions.sql` | 问答日志 `kg_questions`、平方问答库 `occupation_faqs` | 日志照样记；后台工作台是数据工厂的，不带 |

编号和 simulator 现有的不撞（simulator 到 021）；都可重复执行，启动自动迁移可以直接吃。

## 四、打补丁的顺序与手工合并

在 simulator 根目录：

```bash
P=<companydata>/docs/simulator-sync/2026-10-14
git apply --reject $P/01-guest-gallery.patch   # 权限 / 体验视角 / 精选顺序 / 游客标记 / 我的证书导航 / 一天页时间轴钉住；会拒 3 处，见下面 1
git apply --3way  $P/02-expert-capture.patch   # 规则出处、示范评审、访谈回写、体验百业你教我、迁移 022 / 023；skill-lab.ts 会冲突，见 3
git apply --3way  $P/03-space-page.patch       # 人物首页（和我聊大按钮、名字行、按钮配色）、一天页按钮、职业地图脚本、行当接口；ecosystem 会冲突，见 4
git apply --3way  $P/04-persona-chat.patch     # 和我聊全部（kg/、对话页、资料面板、昵称、问答日志落库、自动建档、迁移 025–029）
git apply --3way  $P/05-landing.patch          # 首页改版 + banner 视频 / 封面 / 字幕 + KeepChart
cp $P/files/lab-guest.ts $P/files/review-status.ts $P/files/job-fields.ts src/lib/
cp $P/files/024_occupations.sql supabase/migrations/024_occupations.sql
find . -name '*.rej' -not -path './node_modules/*' -delete    # 做完下面 1 再删
npx tsc --noEmit
```

**通用规则：冲突处一边是 `DEFAULT_MODEL` / 写死的模型名、一边是 simulator 的 `LLM_MODEL`，一律保留 `LLM_MODEL`，只把这边新加的参数 / 逻辑带上。**

手工合并（5 处）：

1. **`01` 被拒的 3 处都是「游客标记」**（companydata 3a7f6c1）：
   - `src/proxy.ts`：剥掉客户端自带的 `x-lab-guest`，登录判断之后给没登录的请求打上，再走 LAB_PUBLIC 放行。合完长这样：
     ```ts
     headers.delete(INVITED); headers.delete(INVITED_BY); headers.delete(LAB_GUEST);
     const token = req.cookies.get('auth_token')?.value;
     const payload = token ? await verifyToken(token) : null;
     if (payload) return NextResponse.next({ request: { headers } });
     headers.set(LAB_GUEST, '1');
     if (LAB_PUBLIC() && pathname.startsWith('/api/lab/') && !LAB_PROTECTED(pathname, req.method)) return NextResponse.next({ request: { headers } });
     ```
   - `src/app/api/lab/route-problem/route.ts`、`src/app/api/lab/spaces/[id]/submit/route.ts`：只差一行 `import { labModel } from '@/lib/lab-guest';`（用法那几行已经打上了）。
2. **`src/lib/lab-guest.ts` 用 `files/lab-guest.ts`（simulator 版）**：companydata 那边游客锁在 Gemini 3.8 Flash；simulator 版改成游客用 `LLM_MODEL`、登录的人选的模型过 `pickModel`。「和我聊」「昵称」接口靠这个标记认游客，所以标记要带。
3. **`src/lib/agents/skill-lab.ts`**：`nextQuestion` 新加了第 5 个参数 `focus: string[] = []`（访谈盯着偏差问），默认模型保留 `LLM_MODEL`：
   ```ts
   export async function nextQuestion(topic: string, turns: InterviewTurn[], modelId = LLM_MODEL, expertWalkthrough = '', focus: string[] = []): Promise<{ question: string; enough: boolean }> {
   ```
4. **`src/app/api/lab/spaces/[id]/ecosystem/route.ts`**：import 两行都留（simulator 的 `LLM_MODEL` + 这边抽出去的 `matchCompanies`，函数挪到了 `src/lib/lab-ecosystem.ts`，和我聊的知识包也用它）。
5. **三个附带文件**：`files/review-status.ts`（标准 / 职业入库用的审核状态）、`files/job-fields.ts`（资料面板显示岗位用的字段与薪资格式），simulator 原来都没有，直接拷。

## 五、上线前要换掉 / 要知道的

**写死的 Gemini（国内连不上，改成 `LLM_MODEL` 或过 `pickModel`）**：
- `src/lib/kg/ensure-occupation.ts` 第 25 行（新建空间自动建档）
- `src/lib/kg/fill-occupation.ts` 第 12 行默认参数（补职业某一块）
- `src/lib/lab-standards.ts` 第 42、119 行（规则回挂、访谈回写）
- `scripts/seed-places-items.mts` 第 31 行
- `src/lib/agents/occupation-enrich.ts`：国内信息本来就走千问联网（`cn()`）；**各国薪资那一步原来走 Gemini**，国内要么换成千问、要么先不做各国薪资（只要中国各地区）。
- `CHAT_MODEL` 默认 `qwen-plus`，可用环境变量 `PERSONA_CHAT_MODEL` 改。

**海外专属内容**：
- `src/lib/lab-featured.ts`：精选名单是海外库的空间编号，换成 simulator 自己的。
- 首页 `DEMO_VIDEO` 指向海外 Supabase 的 `lab-media/landing/baiye-demo-720.mp4`：传到 simulator 自己的桶、改地址（封面 `demo-poster.jpg`、字幕 `demo.vtt` 已在 `public/lab-landing/`）。
- banner `public/lab-landing/spaces-loop-v4.mp4`（4 MB）是海外这几个空间录的；simulator 有同样的空间就能直接用，没有就换自己的（换的时候改文件名）。
- 首页「一个职业，四种空间」的数字来自 `/api/lab/landing` 的 `kg` 计数（企业、岗位、职业、典型任务、场所、标准……）。simulator 库里这些表刚建是空的或很小——**数字小就别显示**（见「二」），等知识底座有了再放。

**知识底座的数据（要拍板）**：
- 这轮的「和我聊」「规则出处」靠职业 / 场所 / 工具 / 典型任务 / 行业标准这套知识底座。simulator 上 022–029 建完是空表：
  - 和我聊**第一次打开会自动建档**（千问联网检索职业基本信息，几十秒），图谱 / 场所 / 任务在后台补——能用，但慢、而且是现查的；
  - 行业标准库空着，规则出处就只有「老师傅经验 / AI 推断」两类，[S1] / [S2] 校验会多报。
- 想要海外这边已经审过的职业 / 标准数据，可以照「空间包」的思路做一个**知识包**：导出端做在 companydata，导入端做在 simulator。还没做，等你们定。
- 「我的行当」的上下游公司来自企业库；simulator 企业库的数据量决定能配出多少家。

**已知问题（companydata 这边会修，修了下一包带过去）**：
- 产业链上下游配公司偏松（只按关键词匹配，会配进不相关的公司，比如火箭的「核心零部件」配进了汽车零部件和游戏公司）。
- 逐句核查偶有漏网：个别句子标了出处，但出处里其实没有。

## 六、刻意没带的

**数据工厂**（技术同事在拆，simulator 不要）：
- 职业库 / 实体库 / 问答日志的后台页（`/admin/db-occupation`、`/admin/db-place` 等，`/admin/kg-questions` 工作台与它的接口）、职业 / 实体接口 `/api/occupations`、`/api/entities`
- 行业标准**获取工具**：`src/lib/standard-run.ts`、`src/lib/agents/standard-radar.ts`、`scripts/standards-seed.mts`（依赖企业库写入和抓取器）
- companydata 024 里的企业工商名称、岗位来源两列；数据部门反馈脚本 `scripts/fix-1013.mts`

**演示专用**：
- banner 的录制与剪辑：`scripts/video/lab-hero-*.scenes.mjs`、`scripts/lab-landing-veo.mjs`
- 3D 场景数据（`src/lib/lab-3d-beta.ts` 里撤掉摊铺现场那一处不用跟；simulator 本来就不带海外场景数据）

## 附：补丁清单

| 补丁 | 覆盖的 companydata 提交 |
|---|---|
| `01-guest-gallery.patch` | ae07f4a 粘贴 JD 建空间 / 工厂要登录 / 体验视角、4c87c15 精选顺序、3a7f6c1 游客标记、888aa24 我的证书导航、7cc5a46 + 84a927f 主题（最终仍默认深色）、dfd35ed 时间轴钉住 |
| `02-expert-capture.patch` | 6fc9260（只取标准库表与读写，不取获取工具）、18c58d4 + cdeeff4 规则出处、789c5a2 示范评审、f4abc5e 体验百业你教我、4df0159 访谈盯偏差与回写 |
| `03-space-page.patch` | 258d2c0 留名弹窗、f801816 一天页按钮、9e5ddc9 职业地图、d14e11e 名字行、54d11d2 和我聊大按钮与配色（人物首页部分）、行当接口抽出 `matchCompanies` |
| `04-persona-chat.patch` | a04e301、55b83cb、a9dd2b0、65bf486、66a9f32、169ad55、0e4d3d8、54d11d2（快捷提问、行当进知识包、修开场白重复请求冲掉提问）、bbaae9e 功能卡片 |
| `05-landing.patch` | 7c8be44、664fae7、aa8a852、8dd5206、5beeb76、294c22d、2241bcf、c05936a |
