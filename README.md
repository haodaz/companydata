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

## 工作流

1. **企业实体库 → AI 建名单**：一句话描述（如「汽车行业中外合资企业 20 家」），联网生成名单，勾选导入。
2. **AI 补全画像**：勾选企业批量补全，只填空字段，每个字段带来源链接。
3. **URL 获取工具**：输入企业 → 检索校招官网 / 应届生 / 实习 / 远程实习 / 管培 / 留学生专场 → 存入信息源库。
4. **校招岗位提取**：建任务 → 从信息源库选 URL → 启动。抓主页 → 大模型挑子页面 → 分批抓取 → 结构化 → 入库。
5. **校招岗位库**：筛选（类型 / 招聘季 / 远程 / 面向留学生）、审核、编辑、导出 CSV。

再次提取同一页面：新岗位入库、已有岗位更新、页面上消失的岗位标记「已下线」；
人工审核定论的岗位不覆盖，人工改过的字段会锁定不覆盖。

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
supabase/migrations/001_init.sql   全部表结构
src/lib/job-fields.ts              岗位字段单一来源（提示词 schema / 详情页 / 导出 / 完整度）
src/lib/company-fields.ts          企业字段、分类、类型
src/lib/url-types.ts               信息源分类
src/lib/job-store.ts               岗位入库：去重、下线判定、审核保护
src/lib/agents/                    finder-pipeline / fetcher / structurer-job / company-profile
src/app/admin/                     页面
src/app/api/                       接口（agents = 大模型，db / admin = 数据）
```

调整要采集的岗位字段：改 `src/lib/job-fields.ts`，并在新的 migration 里给 `jobs` 表加列。

> Next.js 16 有破坏性变更，写代码前先看 `node_modules/next/dist/docs/`（见 `AGENTS.md`）。
