-- 百业学院 · 私域课材料（2026-11-03）：实验室 / 课题组拿自己的东西来联合培养科研 AI，材料只归这一家（org_id = ws_orgs.id）。
-- 六类：direction 研究方向 / spec 组内规格 / requirement 实验要求（安全红线、记录规范）/ literature 内部文献（未发表的组内报告、数据）
--      / equipment 组内设备（型号、参数、预约规则、已知毛病）/ knowhow 私域知识（老师傅经验、组里踩过的坑）。
-- 用途：① 用内部文献出私域测评题（college_research_exams scope = private）；② 学员考这家的题时，把材料当知识包装进去（私域知识包）。
-- 用户口径：人只做校正——演示材料由 AI 按机构档案起草（source = ai_draft），实验室的人上传 / 改过的标 lab。
CREATE TABLE IF NOT EXISTS college_private_materials (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL,                       -- ws_orgs.id
  kind        TEXT NOT NULL CHECK (kind IN ('direction', 'spec', 'requirement', 'literature', 'equipment', 'knowhow')),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,                       -- 正文（文件就存抽出来的文字）
  file_url    TEXT,
  source      TEXT NOT NULL DEFAULT 'lab',         -- lab = 实验室提供 / ai_draft = AI 按档案起草（演示）
  is_demo     BOOLEAN NOT NULL DEFAULT false,      -- 演示用的虚构材料
  created_by  TEXT,
  if_delete   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE college_private_materials ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS college_private_materials_org_idx ON college_private_materials (org_id, kind) WHERE NOT if_delete;
