-- ============================================
-- 026: 工作场所 / 工位 / 工具设备 / 典型任务 + 实体关联（2026-10-13）
--   用户：职业已经和人、企业连上了，还要和「空间」「物」连起来；还要「工位 / 操作台」（本质是仪器、设备、操作对象、软件的组合），
--   「典型任务」是另一种子实体，发生在工位上，涉及工位（环境与设备）、任务目标、任务过程、相关方。
--   图谱：职业 → 典型任务 → 工位（在场所里，由物组成）；任务 → 相关方（人）/ 技能 / 标准
--   work_places        工作场所（规范类型）：手术室、咖啡吧台、转炉车间、变电站……
--   work_stations      工位 / 操作台：转炉操作台、急诊抢救单元、咖啡出品位、温室环控中控台（百业虚拟工位是它的可交互实例）
--   work_items         工具设备（规范类型）：工具 / 设Success. No rows returned备仪器 / 耗材 / 软件 / 防护用品 / 单据表单 / 证照
--   typical_tasks      典型任务：目标、验收标准、过程步骤、相关方、难度、常见失误（百业章节是它的演出实例）
--   entity_links       统一关联：职业 ↔ 任务 / 场所 / 工位 / 物品 / 标准 / 企业，任务 ↔ 工位，工位 ↔ 物品 / 场所，场所 ↔ 物品
-- 种子来自 AI 百业：各空间角色表（lab_cast）里的景 / 道具按规范类型名归一，配图直接用百业素材库（只读引用，不改 /lab 的表）。
-- 在 Supabase SQL Editor 中整段执行，可重复执行。新表都开 RLS（不加策略：只有服务端 service role 能读写）。
-- ============================================

CREATE TABLE IF NOT EXISTS work_places (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,                       -- 规范名：手术室 / 咖啡吧台 / 转炉炉前平台
  name_en TEXT,
  aliases TEXT[] DEFAULT '{}',              -- 百业里的叫法（B1 女卫生间 → 商场公共卫生间）
  category TEXT,                            -- 见 src/lib/entity-fields.ts PLACE_CATEGORY_LABELS
  setting TEXT,                             -- indoor 室内 | outdoor 户外 | mixed
  description TEXT,                         -- 这是个什么地方、里面有什么
  environment TEXT,                         -- 环境特点：噪声 / 高温 / 洁净 / 夜班 / 高空……
  safety TEXT,                              -- 安全要求与防护
  industries TEXT[] DEFAULT '{}',           -- 典型行业
  image_url TEXT,                           -- 配图（百业素材库 / 其他公开图）
  lab_asset_id UUID,                        -- 百业素材库 lab_art_assets.id（只读引用）
  source TEXT,                              -- lab（百业种子）/ ai / manual
  ai_sources JSONB DEFAULT '{}',
  completeness_score INTEGER,
  human_review_status VARCHAR(20) DEFAULT 'review',
  human_review_at TIMESTAMPTZ,
  human_locked_fields JSONB DEFAULT '[]',
  if_delete BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_work_places_name ON work_places(name) WHERE NOT if_delete;
CREATE INDEX IF NOT EXISTS idx_work_places_aliases ON work_places USING GIN(aliases);
ALTER TABLE work_places ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS work_items (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,                       -- 规范名：意式咖啡机 / 除颤仪 / 绝缘电阻测试仪
  name_en TEXT,
  aliases TEXT[] DEFAULT '{}',
  kind TEXT,                                -- tool 工具 | equipment 设备 | material 耗材 | software 软件 | ppe 防护用品 | document 单据表单 | credential 证照
  category TEXT,                            -- 细分：医疗器械 / 电工仪表 / 厨房设备 / 办公软件……
  description TEXT,                         -- 是什么、干什么用
  usage TEXT,                               -- 怎么用 / 操作要点
  specs TEXT,                               -- 常见规格参数
  brands TEXT,                              -- 常见品牌型号（顿号分隔）
  price_range TEXT,                         -- 价位
  safety TEXT,                              -- 使用安全要点
  image_url TEXT,
  lab_asset_id UUID,
  lab_bench TEXT,                           -- 百业虚拟工位里能亲手体验的设备（工位类型，如 greenhouse / teststand）
  source TEXT,
  ai_sources JSONB DEFAULT '{}',
  completeness_score INTEGER,
  human_review_status VARCHAR(20) DEFAULT 'review',
  human_review_at TIMESTAMPTZ,
  human_locked_fields JSONB DEFAULT '[]',
  if_delete BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_work_items_name ON work_items(name) WHERE NOT if_delete;
CREATE INDEX IF NOT EXISTS idx_work_items_aliases ON work_items USING GIN(aliases);
CREATE INDEX IF NOT EXISTS idx_work_items_kind ON work_items(kind);
ALTER TABLE work_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS work_stations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,                       -- 规范名：转炉炉前操作台 / 急诊抢救单元 / 意式咖啡出品位
  aliases TEXT[] DEFAULT '{}',
  description TEXT,                         -- 这个工位是什么、谁在这里干什么
  environment TEXT,                         -- 环境：站姿 / 噪声 / 高温 / 洁净 / 视线 / 空间布局
  controls JSONB DEFAULT '[]',              -- 操作对象（控制量）：[{ name, unit, range, purpose }]，如 氧枪高度 / 送丝速度 / 萃取时间
  monitors JSONB DEFAULT '[]',              -- 监测量（仪表 / 屏幕上看的）：[{ name, unit, normal, alarm }]
  safety TEXT,
  image_url TEXT,
  lab_bench TEXT,                           -- 百业虚拟工位类型（surface），有就说明能亲手体验
  source TEXT,
  ai_sources JSONB DEFAULT '{}',
  completeness_score INTEGER,
  human_review_status VARCHAR(20) DEFAULT 'review',
  human_review_at TIMESTAMPTZ,
  human_locked_fields JSONB DEFAULT '[]',
  if_delete BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_work_stations_name ON work_stations(name) WHERE NOT if_delete;
CREATE INDEX IF NOT EXISTS idx_work_stations_aliases ON work_stations USING GIN(aliases);
ALTER TABLE work_stations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS typical_tasks (
  id SERIAL PRIMARY KEY,
  occupation_id INTEGER REFERENCES occupations(id) ON DELETE CASCADE,   -- 主职业（别的职业也做的话走 entity_links）
  name TEXT NOT NULL,                       -- 「午高峰前把萃取参数拉回标准」「前臂裂伤清创缝合」
  summary TEXT,                             -- 情境：什么时候、为什么要做
  goal TEXT,                                -- 任务目标
  success_criteria JSONB DEFAULT '[]',      -- 验收标准 / 指标：[{ name, target }]
  process JSONB DEFAULT '[]',               -- 过程：[{ step, action, items: [物品名], checkpoint }]
  stakeholders JSONB DEFAULT '[]',          -- 相关方：[{ role, relation, interaction }]，如 带教师傅 / 患者家属 / 客户
  common_mistakes TEXT,                     -- 常见失误 / 风险
  difficulty INTEGER,                       -- 1 入门 / 2 独立 / 3 资深（对应成长阶梯）
  frequency TEXT,                           -- daily / weekly / occasional
  duration TEXT,                            -- 通常用时
  skill_ids TEXT[] DEFAULT '{}',            -- 发展图谱技能节点
  source TEXT,
  ai_sources JSONB DEFAULT '{}',
  lab_task_ids UUID[] DEFAULT '{}',         -- 演出这个任务的百业空间
  completeness_score INTEGER,
  human_review_status VARCHAR(20) DEFAULT 'review',
  human_review_at TIMESTAMPTZ,
  human_locked_fields JSONB DEFAULT '[]',
  if_delete BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_typical_tasks_occ ON typical_tasks(occupation_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_typical_tasks_name ON typical_tasks(occupation_id, name) WHERE NOT if_delete;
ALTER TABLE typical_tasks ENABLE ROW LEVEL SECURITY;

-- 统一关联：一条 = 一个实体用到 / 在 / 依据另一个实体
CREATE TABLE IF NOT EXISTS entity_links (
  id SERIAL PRIMARY KEY,
  from_type TEXT NOT NULL,                  -- occupation | task | station | place
  from_id INTEGER NOT NULL,
  to_type TEXT NOT NULL,                    -- task | station | place | item | standard | company
  to_id INTEGER NOT NULL,
  role TEXT DEFAULT 'primary',              -- primary 主要 | secondary 次要
  frequency TEXT,                           -- daily 每天 | weekly 每周 | occasional 偶尔
  proficiency TEXT,                         -- 熟练度要求：了解 / 会用 / 熟练 / 精通
  skill_ids TEXT[] DEFAULT '{}',            -- 关联到发展图谱里的技能节点（occupations.career_map.skills[].id）
  note TEXT,                                -- 用法 / 在这里干什么
  source TEXT,                              -- lab（百业角色表）/ ai / manual
  lab_task_ids UUID[] DEFAULT '{}',         -- 依据的百业空间（skill_tasks.id，可多个）
  confidence INTEGER,                       -- 0–100
  if_delete BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (from_type, from_id, to_type, to_id)
);
CREATE INDEX IF NOT EXISTS idx_entity_links_to ON entity_links(to_type, to_id);
ALTER TABLE entity_links ENABLE ROW LEVEL SECURITY;
