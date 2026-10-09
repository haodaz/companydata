-- 016 AI 百业：角色表（人物 / 场景 / 道具）+ 素材库编号（2026-10-09）
--
-- 编号链：空间（NOVA-53）→ 故事线（D1）→ 章节（C02）→ 角色表里的人 / 景 / 道具（P01 / S01 / T01）→ 素材库（A-0412）
--   角色表 lab_cast：这个空间里「出场的是谁」——名字、性格、和主角的关系；一个人一行，整天各章共用。
--   素材库 lab_art_assets：「长什么样」——图、规范类型名、领域；所有空间共用，同样的人 / 场景 / 道具不重画，新画的立刻归库。
--   章节步骤里用 scene.who（人名）、place（场景的角色表 id）、props（道具的角色表 id 数组）指向角色表。
-- 老数据：已有的立绘 / 场景图 / 工位底图 / 数字职人头像全部登记进素材库，各空间的人和场景登记成 P / S，图不变。
-- 整份可重复执行（公司那边 CI 的 sync-db 会整份重跑）。

-- ── 1. 素材库：加道具类别、编号、规范类型名等 ─────────────────────────────
ALTER TABLE lab_art_assets DROP CONSTRAINT IF EXISTS lab_art_assets_kind_check;
ALTER TABLE lab_art_assets ADD CONSTRAINT lab_art_assets_kind_check CHECK (kind IN ('npc', 'scene', 'prop'));
ALTER TABLE lab_art_assets ALTER COLUMN url DROP NOT NULL;            -- 道具可以先建档、不画图
CREATE SEQUENCE IF NOT EXISTS lab_art_asset_no;
ALTER TABLE lab_art_assets ADD COLUMN IF NOT EXISTS code TEXT;                                  -- A-0412，给人看的编号
ALTER TABLE lab_art_assets ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';             -- 显示名：中年男带教师傅 / 商场公共卫生间 / 含氯消毒液
ALTER TABLE lab_art_assets ADD COLUMN IF NOT EXISTS type_name TEXT NOT NULL DEFAULT '';         -- 规范类型名：判断「是不是同一个」靠它
ALTER TABLE lab_art_assets ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE lab_art_assets ADD COLUMN IF NOT EXISTS note TEXT NOT NULL DEFAULT '';
ALTER TABLE lab_art_assets ADD COLUMN IF NOT EXISTS reusable BOOLEAN NOT NULL DEFAULT TRUE;     -- 数字职人本人、工位底图：专属，不给别的空间用
ALTER TABLE lab_art_assets ADD COLUMN IF NOT EXISTS source_task_id UUID REFERENCES skill_tasks(id) ON DELETE SET NULL;  -- 最早为哪个空间画的
ALTER TABLE lab_art_assets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE lab_art_assets ALTER COLUMN code SET DEFAULT ('A-' || lpad(nextval('lab_art_asset_no')::text, 4, '0'));

-- 老空间里用到、但还没进库的图（预置示范的 /lab/*.jpg、数字职人头像、工位底图）补登记
WITH used AS (
  SELECT c.task_id, 'npc'::text AS kind, v.value #>> '{}' AS url, TRUE AS reusable, '{}'::text[] AS tags, c.seq, 1 AS ord
  FROM lab_chapters c, jsonb_each(CASE WHEN jsonb_typeof(c.sim->'art'->'npcs') = 'object' THEN c.sim->'art'->'npcs' ELSE '{}'::jsonb END) v
  UNION ALL
  SELECT c.task_id, 'scene', c.sim->'art'->>'cover', TRUE, '{}', c.seq, 2 FROM lab_chapters c WHERE c.sim->'art'->>'cover' IS NOT NULL
  UNION ALL
  SELECT c.task_id, 'scene', v.value #>> '{}', TRUE, '{}', c.seq, 3
  FROM lab_chapters c, jsonb_each(CASE WHEN jsonb_typeof(c.sim->'art'->'scenes') = 'object' THEN c.sim->'art'->'scenes' ELSE '{}'::jsonb END) v
  UNION ALL
  SELECT c.task_id, 'scene', s->'bench'->'scene'->>'image', FALSE, ARRAY['工位底图'], c.seq, 4
  FROM lab_chapters c, jsonb_array_elements(CASE WHEN jsonb_typeof(c.sim->'steps') = 'array' THEN c.sim->'steps' ELSE '[]'::jsonb END) s
  WHERE s->>'type' = 'bench' AND s->'bench'->'scene'->>'image' IS NOT NULL
  UNION ALL
  SELECT t.id, 'npc', t.profile->>'avatar', FALSE, ARRAY['数字职人'], 0, 0 FROM skill_tasks t WHERE COALESCE(t.profile->>'avatar', '') <> ''
)
INSERT INTO lab_art_assets (kind, url, reusable, tags, source_task_id)
SELECT DISTINCT ON (url) kind, url, reusable, tags, task_id FROM used
WHERE url ~ '^(/|https?://)'
ORDER BY url, ord DESC, seq
ON CONFLICT (url) DO NOTHING;

-- 头像、工位底图即便早就在库里，也标成专属
UPDATE lab_art_assets a SET reusable = FALSE, tags = (SELECT array_agg(DISTINCT x) FROM unnest(a.tags || ARRAY['数字职人']) x)
WHERE a.url IN (SELECT profile->>'avatar' FROM skill_tasks) AND (a.reusable OR NOT ('数字职人' = ANY(a.tags)));
UPDATE lab_art_assets a SET reusable = FALSE, tags = (SELECT array_agg(DISTINCT x) FROM unnest(a.tags || ARRAY['工位底图']) x)
WHERE a.url IN (
  SELECT s->'bench'->'scene'->>'image' FROM lab_chapters c, jsonb_array_elements(CASE WHEN jsonb_typeof(c.sim->'steps') = 'array' THEN c.sim->'steps' ELSE '[]'::jsonb END) s
  WHERE s->>'type' = 'bench') AND (a.reusable OR NOT ('工位底图' = ANY(a.tags)));

-- 老库里的「场景位 / 人物角色」先当规范类型名，之后由脚本 / 人工细化
UPDATE lab_art_assets SET type_name = slot WHERE type_name = '' AND slot NOT IN ('', '其他');

-- 编号：按入库先后
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM lab_art_assets WHERE code IS NULL ORDER BY created_at, id LOOP
    UPDATE lab_art_assets SET code = 'A-' || lpad(nextval('lab_art_asset_no')::text, 4, '0') WHERE id = r.id;
  END LOOP;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS lab_art_assets_code ON lab_art_assets(code);
CREATE INDEX IF NOT EXISTS lab_art_assets_type ON lab_art_assets(kind, type_name);

-- ── 2. 角色表 ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lab_cast (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES skill_tasks(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,                       -- P00 数字职人本人 / P01… 人物 / S01… 场景 / T01… 道具
  kind        TEXT NOT NULL CHECK (kind IN ('person', 'place', 'prop')),
  name        TEXT NOT NULL,                       -- 故事里的叫法：老周 / B1 女卫生间 / 含氯消毒液
  type_name   TEXT NOT NULL DEFAULT '',            -- 规范类型名（和素材库对得上）：带教师傅 / 商场公共卫生间
  note        TEXT NOT NULL DEFAULT '',            -- 人：性格、和主角的关系；地点 / 道具：用途、状态
  look        TEXT NOT NULL DEFAULT '',            -- 外形 / 陈设描述（画图用）
  asset_id    UUID REFERENCES lab_art_assets(id) ON DELETE SET NULL,
  is_self     BOOLEAN NOT NULL DEFAULT FALSE,      -- 数字职人本人
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, code),
  UNIQUE (task_id, kind, name)
);
CREATE INDEX IF NOT EXISTS lab_cast_asset ON lab_cast(asset_id);

-- 故事线：现在一个空间就是「一天」= D1；以后做「第一周」「项目周期」再展开
ALTER TABLE lab_chapters ADD COLUMN IF NOT EXISTS line INTEGER NOT NULL DEFAULT 1;

-- ── 3. 老空间回填角色表（已经有角色表的空间跳过）──────────────────────────
-- P00：数字职人本人
INSERT INTO lab_cast (task_id, code, kind, name, type_name, is_self, asset_id)
SELECT t.id, 'P00', 'person', COALESCE(NULLIF(t.profile->>'name', ''), t.title), COALESCE(t.profile->>'role', ''), TRUE,
       (SELECT id FROM lab_art_assets a WHERE a.url = t.profile->>'avatar')
FROM skill_tasks t
WHERE NOT EXISTS (SELECT 1 FROM lab_cast x WHERE x.task_id = t.id)
ON CONFLICT DO NOTHING;

-- 人物：章节里出过场的每个人（有立绘的挂上立绘），按第一次出场排 P01、P02…
WITH fresh AS (SELECT task_id FROM lab_cast GROUP BY task_id HAVING count(*) = 1 AND bool_and(is_self)),
who AS (
  SELECT c.task_id, s.value->'scene'->>'who' AS name, min(c.seq * 100 + s.ordinality) AS first_at
  FROM lab_chapters c JOIN fresh f ON f.task_id = c.task_id,
       jsonb_array_elements(CASE WHEN jsonb_typeof(c.sim->'steps') = 'array' THEN c.sim->'steps' ELSE '[]'::jsonb END) WITH ORDINALITY s
  WHERE COALESCE(s.value->'scene'->>'who', '') NOT IN ('', '你', '我', '旁白', '系统')
  GROUP BY 1, 2
  UNION
  SELECT c.task_id, v.key, 99999
  FROM lab_chapters c JOIN fresh f ON f.task_id = c.task_id,
       jsonb_each(CASE WHEN jsonb_typeof(c.sim->'art'->'npcs') = 'object' THEN c.sim->'art'->'npcs' ELSE '{}'::jsonb END) v
),
one AS (SELECT task_id, name, min(first_at) AS first_at FROM who GROUP BY 1, 2)
INSERT INTO lab_cast (task_id, code, kind, name, asset_id)
SELECT o.task_id, 'P' || lpad(row_number() OVER (PARTITION BY o.task_id ORDER BY o.first_at, o.name)::text, 2, '0'), 'person', o.name,
       (SELECT a.id FROM lab_chapters c, jsonb_each(CASE WHEN jsonb_typeof(c.sim->'art'->'npcs') = 'object' THEN c.sim->'art'->'npcs' ELSE '{}'::jsonb END) v
          JOIN lab_art_assets a ON a.url = v.value #>> '{}'
        WHERE c.task_id = o.task_id AND v.key = o.name LIMIT 1)
FROM one o
WHERE o.name <> (SELECT x.name FROM lab_cast x WHERE x.task_id = o.task_id AND x.is_self)
ON CONFLICT DO NOTHING;

-- 场景：每张用到的场景图 / 工位底图是一个地点，先叫「门店 1」「工位：xxx」，之后由脚本按画面描述起名
WITH fresh AS (SELECT task_id FROM lab_cast GROUP BY task_id HAVING NOT bool_or(kind = 'place')),
pics AS (
  SELECT c.task_id, v.value #>> '{}' AS url, min(c.seq * 100 + 50) AS first_at, NULL::text AS bench
  FROM lab_chapters c JOIN fresh f ON f.task_id = c.task_id,
       jsonb_each(CASE WHEN jsonb_typeof(c.sim->'art'->'scenes') = 'object' THEN c.sim->'art'->'scenes' ELSE '{}'::jsonb END) v
  GROUP BY 1, 2
  UNION ALL
  SELECT c.task_id, c.sim->'art'->>'cover', c.seq * 100, NULL FROM lab_chapters c JOIN fresh f ON f.task_id = c.task_id WHERE c.sim->'art'->>'cover' IS NOT NULL
  UNION ALL
  SELECT c.task_id, s.value->'bench'->'scene'->>'image', c.seq * 100 + s.ordinality, s.value->'bench'->>'name'
  FROM lab_chapters c JOIN fresh f ON f.task_id = c.task_id,
       jsonb_array_elements(CASE WHEN jsonb_typeof(c.sim->'steps') = 'array' THEN c.sim->'steps' ELSE '[]'::jsonb END) WITH ORDINALITY s
  WHERE s.value->>'type' = 'bench' AND s.value->'bench'->'scene'->>'image' IS NOT NULL
),
one AS (SELECT task_id, url, min(first_at) AS first_at, max(bench) AS bench FROM pics WHERE url IS NOT NULL GROUP BY 1, 2),
named AS (
  SELECT o.*, a.id AS asset_id,
         CASE WHEN o.bench IS NOT NULL THEN '工位：' || o.bench ELSE COALESCE(NULLIF(a.type_name, ''), '场景') END AS base,
         row_number() OVER (PARTITION BY o.task_id ORDER BY o.first_at, o.url) AS n
  FROM one o JOIN lab_art_assets a ON a.url = o.url
)
INSERT INTO lab_cast (task_id, code, kind, name, type_name, asset_id)
SELECT task_id, 'S' || lpad(n::text, 2, '0'), 'place',
       base || CASE WHEN count(*) OVER (PARTITION BY task_id, base) > 1 THEN ' ' || row_number() OVER (PARTITION BY task_id, base ORDER BY n) ELSE '' END,
       CASE WHEN bench IS NULL THEN base ELSE '' END, asset_id
FROM named
ON CONFLICT DO NOTHING;

-- 素材库里还没标题的，用第一个挂上它的角色名
UPDATE lab_art_assets a SET title = c.name
FROM (SELECT DISTINCT ON (asset_id) asset_id, name FROM lab_cast WHERE asset_id IS NOT NULL ORDER BY asset_id, created_at) c
WHERE a.id = c.asset_id AND a.title = '';

ALTER TABLE lab_cast ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE lab_cast IS 'AI 百业角色表：一个空间里出场的人物 / 场景 / 道具（P / S / T 编号），指向素材库；整天各章共用';
COMMENT ON COLUMN lab_art_assets.code IS '素材编号 A-0001 起，给人看';
COMMENT ON COLUMN lab_art_assets.type_name IS '规范类型名：同类型的人 / 场景 / 道具优先复用，不重画';

NOTIFY pgrst, 'reload schema';
