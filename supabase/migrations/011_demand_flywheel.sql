-- 011 需求飞轮：需求信号 → 归一热力 → 每日缺口检测 → 自动排产 → 数据入库 → 下一轮
--
-- 岗位不像人才：一个人被搜到，下一个人立刻能用；岗位会变、也穷举不完。
-- 所以飞轮的用法是「前人搜得多的地方，平台每天主动批量补一批」：
-- 信号按行业 / 职能 / 职业领域 / 企业归一后看热度，热但数据薄或旧的地方，每天排成采集任务。
-- 信号来源：后台搜索、/lab 提问与浏览、数据部门建的任务、下载、联网扫到的招聘趋势与融资；
-- 以后的 ToC 产品走同一张表（source 以 toc_ 开头）。

-- 1. 需求信号：每一次「有人在意这个」都记一条，入库时就地归一
CREATE TABLE IF NOT EXISTS demand_signals (
  id            BIGSERIAL PRIMARY KEY,
  source        TEXT NOT NULL,                 -- 见 src/lib/flywheel/sources.ts
  query         TEXT NOT NULL DEFAULT '',      -- 原话：搜索词 / 问题 / 职业名 / 企业名 / 趋势摘要
  actor         TEXT,                          -- 谁：后台账号邮箱 / lab 访客 / cron
  weight        NUMERIC NOT NULL DEFAULT 1,    -- 这条信号算几分（按来源，见 sources.ts）
  -- 归一结果（四个口径，能对上几个填几个）
  industry      TEXT,                          -- 标准行业（src/lib/flywheel/taxonomy.ts INDUSTRIES）
  job_function  TEXT,                          -- 职能（与 jobs.job_function 同一套）
  career_family TEXT,                          -- 职业领域（与 /lab 同一套，src/lib/career-family.ts）
  profession    TEXT,                          -- 具体职业名（如 焊接工程师 / 咖啡师），原话里有才填
  company_id    INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  company_name  TEXT,                          -- 对不上库里企业时也留名字（融资新闻里的新机构）
  normalized_by TEXT,                          -- rule 规则就地归一 | llm 模型批量归一 | none 归不出
  normalized_at TIMESTAMPTZ,
  meta          JSONB NOT NULL DEFAULT '{}',   -- 来源附带信息：页面、筛选条件、链接、融资轮次……
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS demand_signals_created_idx ON demand_signals (created_at DESC);
CREATE INDEX IF NOT EXISTS demand_signals_pending_idx ON demand_signals (created_at) WHERE normalized_at IS NULL;
CREATE INDEX IF NOT EXISTS demand_signals_company_idx ON demand_signals (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS demand_signals_industry_idx ON demand_signals (industry, created_at DESC);
CREATE INDEX IF NOT EXISTS demand_signals_function_idx ON demand_signals (job_function, created_at DESC);

-- 2. 归一词典：一个说法只让模型归一一次，之后直接查表（企业库里五花八门的行业写法也走这里）
CREATE TABLE IF NOT EXISTS taxonomy_aliases (
  dim        TEXT NOT NULL,                    -- industry | job_function | career_family
  raw        TEXT NOT NULL,                    -- 原始写法（小写、去空白）
  canonical  TEXT NOT NULL,                    -- 归到的标准名
  by         TEXT NOT NULL DEFAULT 'llm',      -- rule | llm | human（人工改过的不会被模型覆盖）
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (dim, raw)
);

-- 3. 每日检测（人工触发，一天一行，重跑覆盖）：当天的热度、供给、缺口、联网扫到的信号，以及排了哪些任务
CREATE TABLE IF NOT EXISTS flywheel_days (
  day        DATE PRIMARY KEY,
  stats      JSONB NOT NULL DEFAULT '{}',      -- 信号数、归一率、各口径 Top
  gaps       JSONB NOT NULL DEFAULT '[]',      -- 缺口清单：[{ dim, key, heat, supply, reason }]
  web        JSONB NOT NULL DEFAULT '{}',      -- 联网扫描：{ trends: [...], fundings: [...] }
  actions    JSONB NOT NULL DEFAULT '[]',      -- 排产：[{ kind, task_id, name, count, reason }]
  model_id   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE demand_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxonomy_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE flywheel_days ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE demand_signals IS '需求信号：后台搜索、lab 提问/浏览、任务、下载、联网趋势与融资，入库时归一到行业/职能/职业领域/企业';
COMMENT ON TABLE taxonomy_aliases IS '归一词典：原始说法 → 标准行业/职能/职业领域，模型归一一次后复用';
COMMENT ON TABLE flywheel_days IS '飞轮每日检测：热度、缺口、联网信号、自动排产的任务';

NOTIFY pgrst, 'reload schema';
