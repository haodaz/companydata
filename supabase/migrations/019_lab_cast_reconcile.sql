-- 019 AI 百业：素材「单链路引用」第 1 步——角色表对账（2026-10-10）
--
-- 目标：图的来源只有一条链：步骤 → 角色表（P / S / T）→ 素材库（A-xxxx）→ 网址。
-- 章节 / 空间 JSON 里存的网址（profile.avatar、sim.art.cover / scenes / npcs、bench.scene.image）以后只是缓存，
-- 不再是真相；换图 = 改素材库或角色表的一行，不再全库搜字符串。
--
-- 这一步只做「对账」：把现有空间里的裸网址反查成素材编号，补齐角色表，每一步写上 place，章节写上 cover_cast。
-- 016 只给「还没有角色表的空间」回填过一次；之后新建的空间（生成接口、预置示范）不写角色表，所以这里做成
-- 一个可以随时再跑的函数 lab_reconcile_cast(task_id)：迁移末尾对全库跑一遍，应用新建空间后也可以 rpc 调它兜底。
-- 整份可重复执行（从 eng/simulator 搬来，2026-10-11）。

-- 章节封面指向哪个场景（角色表 S 的 id）；空 = 用第 1 个有图的场景
ALTER TABLE lab_chapters ADD COLUMN IF NOT EXISTS cover_cast UUID REFERENCES lab_cast(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION lab_reconcile_cast(p_task UUID DEFAULT NULL)
RETURNS TABLE (task_id UUID, assets_added INTEGER, cast_added INTEGER, steps_placed INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
  t RECORD; c RECORD; s JSONB; v RECORD;
  n_assets INTEGER; n_cast INTEGER; n_steps INTEGER;
  a_id UUID; cast_id UUID; self_name TEXT; v_url TEXT; new_steps JSONB; changed BOOLEAN;
BEGIN
  FOR t IN SELECT id, title, profile, sim FROM skill_tasks WHERE p_task IS NULL OR id = p_task LOOP
    n_assets := 0; n_cast := 0; n_steps := 0;

    -- 1. 这个空间用到的每个网址都登记进素材库（已有的跳过）
    FOR v IN
      SELECT DISTINCT ON (u.url) u.kind, u.url, u.reusable, u.tags FROM (
        SELECT 'npc' AS kind, x.value #>> '{}' AS url, TRUE AS reusable, '{}'::text[] AS tags, 1 AS ord
          FROM lab_chapters ch, jsonb_each(CASE WHEN jsonb_typeof(ch.sim->'art'->'npcs') = 'object' THEN ch.sim->'art'->'npcs' ELSE '{}'::jsonb END) x WHERE ch.task_id = t.id
        UNION ALL
        SELECT 'scene', ch.sim->'art'->>'cover', TRUE, '{}', 2 FROM lab_chapters ch WHERE ch.task_id = t.id AND ch.sim->'art'->>'cover' IS NOT NULL
        UNION ALL
        SELECT 'scene', x.value #>> '{}', TRUE, '{}', 3
          FROM lab_chapters ch, jsonb_each(CASE WHEN jsonb_typeof(ch.sim->'art'->'scenes') = 'object' THEN ch.sim->'art'->'scenes' ELSE '{}'::jsonb END) x WHERE ch.task_id = t.id
        UNION ALL
        SELECT 'scene', st->'bench'->'scene'->>'image', FALSE, ARRAY['工位底图'], 4
          FROM lab_chapters ch, jsonb_array_elements(CASE WHEN jsonb_typeof(ch.sim->'steps') = 'array' THEN ch.sim->'steps' ELSE '[]'::jsonb END) st
          WHERE ch.task_id = t.id AND st->>'type' = 'bench' AND st->'bench'->'scene'->>'image' IS NOT NULL
        UNION ALL
        SELECT 'npc', t.profile->>'avatar', FALSE, ARRAY['数字职人'], 0 WHERE COALESCE(t.profile->>'avatar', '') <> ''
      ) u WHERE u.url ~ '^(/|https?://)' ORDER BY u.url, u.ord DESC
    LOOP
      INSERT INTO lab_art_assets (kind, url, reusable, tags, source_task_id) VALUES (v.kind, v.url, v.reusable, v.tags, t.id)
      ON CONFLICT (url) DO NOTHING;
      IF FOUND THEN n_assets := n_assets + 1; END IF;
    END LOOP;

    -- 2. P00 数字职人本人：没有就建；有但没挂头像的，按 profile.avatar 补上
    self_name := COALESCE(NULLIF(t.profile->>'name', ''), t.title);
    SELECT id INTO a_id FROM lab_art_assets WHERE url = t.profile->>'avatar';
    IF NOT EXISTS (SELECT 1 FROM lab_cast x WHERE x.task_id = t.id AND x.is_self) THEN
      INSERT INTO lab_cast (task_id, code, kind, name, type_name, is_self, asset_id)
      VALUES (t.id, 'P00', 'person', self_name, COALESCE(t.profile->>'role', ''), TRUE, a_id)
      ON CONFLICT DO NOTHING;
      IF FOUND THEN n_cast := n_cast + 1; END IF;
    ELSIF a_id IS NOT NULL THEN
      UPDATE lab_cast SET asset_id = a_id, updated_at = now() WHERE lab_cast.task_id = t.id AND is_self AND asset_id IS NULL;
    END IF;

    -- 3. 人物：台词里出过场的、npcs 里有立绘的，角色表没有就补（按第一次出场编号）；有但没图的补图
    FOR v IN
      WITH who AS (
        SELECT st.value->'scene'->>'who' AS name, min(ch.seq * 100 + st.ordinality) AS first_at
        FROM lab_chapters ch, jsonb_array_elements(CASE WHEN jsonb_typeof(ch.sim->'steps') = 'array' THEN ch.sim->'steps' ELSE '[]'::jsonb END) WITH ORDINALITY st
        WHERE ch.task_id = t.id AND COALESCE(st.value->'scene'->>'who', '') NOT IN ('', '你', '我', '旁白', '系统')
        GROUP BY 1
        UNION
        SELECT x.key, 99999 FROM lab_chapters ch, jsonb_each(CASE WHEN jsonb_typeof(ch.sim->'art'->'npcs') = 'object' THEN ch.sim->'art'->'npcs' ELSE '{}'::jsonb END) x WHERE ch.task_id = t.id
      )
      SELECT name, min(first_at) AS first_at,
             (SELECT a.id FROM lab_chapters ch, jsonb_each(CASE WHEN jsonb_typeof(ch.sim->'art'->'npcs') = 'object' THEN ch.sim->'art'->'npcs' ELSE '{}'::jsonb END) x
                JOIN lab_art_assets a ON a.url = x.value #>> '{}' WHERE ch.task_id = t.id AND x.key = who.name LIMIT 1) AS asset_id
      FROM who WHERE name <> self_name GROUP BY name ORDER BY 2, 1
    LOOP
      SELECT id INTO cast_id FROM lab_cast x WHERE x.task_id = t.id AND x.kind = 'person' AND x.name = v.name;
      IF cast_id IS NULL THEN
        INSERT INTO lab_cast (task_id, code, kind, name, asset_id)
        VALUES (t.id, 'P' || lpad((COALESCE((SELECT max(substr(code, 2)::int) FROM lab_cast x WHERE x.task_id = t.id AND x.code ~ '^P[0-9]+$'), 0) + 1)::text, 2, '0'), 'person', v.name, v.asset_id)
        ON CONFLICT DO NOTHING;
        IF FOUND THEN n_cast := n_cast + 1; END IF;
      ELSIF v.asset_id IS NOT NULL THEN
        UPDATE lab_cast SET asset_id = v.asset_id, updated_at = now() WHERE id = cast_id AND asset_id IS NULL;
      END IF;
    END LOOP;

    -- 4. 场景：每张场景图 / 封面 / 工位底图是一个地点；这个空间的角色表里还没有挂这张图的 S 就补一条
    FOR v IN
      WITH pics AS (
        SELECT x.value #>> '{}' AS url, min(ch.seq * 100 + 50) AS first_at, NULL::text AS bench
          FROM lab_chapters ch, jsonb_each(CASE WHEN jsonb_typeof(ch.sim->'art'->'scenes') = 'object' THEN ch.sim->'art'->'scenes' ELSE '{}'::jsonb END) x WHERE ch.task_id = t.id GROUP BY 1
        UNION ALL
        SELECT ch.sim->'art'->>'cover', ch.seq * 100, NULL FROM lab_chapters ch WHERE ch.task_id = t.id AND ch.sim->'art'->>'cover' IS NOT NULL
        UNION ALL
        SELECT st.value->'bench'->'scene'->>'image', ch.seq * 100 + st.ordinality, st.value->'bench'->>'name'
          FROM lab_chapters ch, jsonb_array_elements(CASE WHEN jsonb_typeof(ch.sim->'steps') = 'array' THEN ch.sim->'steps' ELSE '[]'::jsonb END) WITH ORDINALITY st
          WHERE ch.task_id = t.id AND st.value->>'type' = 'bench' AND st.value->'bench'->'scene'->>'image' IS NOT NULL
      ),
      one AS (SELECT url, min(first_at) AS first_at, max(bench) AS bench FROM pics WHERE url IS NOT NULL GROUP BY 1)
      SELECT o.url, o.bench, a.id AS asset_id,
             CASE WHEN o.bench IS NOT NULL THEN '工位：' || o.bench ELSE COALESCE(NULLIF(a.title, ''), NULLIF(a.type_name, ''), '场景') END AS base
      FROM one o JOIN lab_art_assets a ON a.url = o.url
      WHERE NOT EXISTS (SELECT 1 FROM lab_cast x WHERE x.task_id = t.id AND x.kind = 'place' AND x.asset_id = a.id)
      ORDER BY o.first_at, o.url
    LOOP
      INSERT INTO lab_cast (task_id, code, kind, name, type_name, asset_id)
      SELECT t.id, 'S' || lpad((COALESCE((SELECT max(substr(code, 2)::int) FROM lab_cast x WHERE x.task_id = t.id AND x.code ~ '^S[0-9]+$'), 0) + 1)::text, 2, '0'), 'place',
             -- 同名的地点加序号，避开 (task_id, kind, name) 唯一键
             v.base || CASE WHEN EXISTS (SELECT 1 FROM lab_cast x WHERE x.task_id = t.id AND x.kind = 'place' AND x.name = v.base)
                            THEN ' ' || ((SELECT count(*) FROM lab_cast x WHERE x.task_id = t.id AND x.kind = 'place' AND x.name LIKE v.base || '%') + 1) ELSE '' END,
             CASE WHEN v.bench IS NULL THEN v.base ELSE '' END, v.asset_id
      ON CONFLICT DO NOTHING;
      IF FOUND THEN n_cast := n_cast + 1; END IF;
    END LOOP;

    -- 5. 每一步写上 place（还没写的）：这一步的场景图 / 工位底图 → 素材 → 这个空间的 S；章节写上 cover_cast
    FOR c IN SELECT id, seq, sim, cover_cast FROM lab_chapters ch WHERE ch.task_id = t.id LOOP
      changed := FALSE;
      IF jsonb_typeof(c.sim->'steps') = 'array' THEN
        new_steps := '[]'::jsonb;
        FOR s IN SELECT * FROM jsonb_array_elements(c.sim->'steps') LOOP
          IF COALESCE(s->>'place', '') = '' THEN
            v_url := CASE WHEN s->>'type' = 'bench' THEN s->'bench'->'scene'->>'image' ELSE c.sim->'art'->'scenes'->>(s->>'id') END;
            cast_id := NULL;
            IF v_url IS NOT NULL THEN
              SELECT x.id INTO cast_id FROM lab_cast x JOIN lab_art_assets a ON a.id = x.asset_id
              WHERE x.task_id = t.id AND x.kind = 'place' AND a.url = v_url LIMIT 1;
            END IF;
            IF cast_id IS NOT NULL THEN s := s || jsonb_build_object('place', cast_id::text); changed := TRUE; n_steps := n_steps + 1; END IF;
          END IF;
          new_steps := new_steps || jsonb_build_array(s);
        END LOOP;
        IF changed THEN
          UPDATE lab_chapters SET sim = jsonb_set(sim, '{steps}', new_steps), updated_at = now() WHERE id = c.id;
          -- 第 1 章和 skill_tasks.sim 互为镜像（老代码还在读写 sim）
          IF c.seq = 1 THEN UPDATE skill_tasks SET sim = jsonb_set(sim, '{steps}', new_steps) WHERE id = t.id AND jsonb_typeof(sim->'steps') = 'array'; END IF;
        END IF;
      END IF;
      IF c.cover_cast IS NULL AND c.sim->'art'->>'cover' IS NOT NULL THEN
        UPDATE lab_chapters ch SET cover_cast = (
          SELECT x.id FROM lab_cast x JOIN lab_art_assets a ON a.id = x.asset_id
          WHERE x.task_id = t.id AND x.kind = 'place' AND a.url = c.sim->'art'->>'cover' LIMIT 1)
        WHERE ch.id = c.id;
      END IF;
    END LOOP;

    -- 素材库里还没标题的，用第一个挂上它的角色名
    UPDATE lab_art_assets a SET title = x.name FROM lab_cast x WHERE x.task_id = t.id AND a.id = x.asset_id AND a.title = '';

    task_id := t.id; assets_added := n_assets; cast_added := n_cast; steps_placed := n_steps;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- 全库对一遍账（可重复：第二遍全是 0）
SELECT count(*) AS spaces, sum(assets_added) AS assets_added, sum(cast_added) AS cast_added, sum(steps_placed) AS steps_placed FROM lab_reconcile_cast();

COMMENT ON FUNCTION lab_reconcile_cast(UUID) IS 'AI 百业角色表对账：把空间 / 章节 JSON 里的裸网址反查成素材并补齐角色表、步骤 place、章节 cover_cast；可随时重跑';
COMMENT ON COLUMN lab_chapters.cover_cast IS '章节封面用哪个场景（角色表 S 的 id）；空 = 第 1 个有图的场景';

NOTIFY pgrst, 'reload schema';
