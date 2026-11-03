-- 实验方法实体（2026-11-02）：连接「仪器 / 试剂（research_products）」和「学科 / 课题 / 百业科研空间」的中间层。
-- 一个方法 = 一类实验手艺（细胞培养、液相色谱、电化学阻抗谱、共聚焦成像…）：原理一句话、典型实验、操作指南（步骤）、
-- 常见坑（现象 → 原因 → 怎么判断 / 处理）、安全要点、训练的本事、用到的通用仪器（对百业工具设备库 work_items）。
-- 操作指南是 AI 按通用实验常识写的，human_review_status 默认 review；产品信息仍只从厂商 / 会刊原文抽。
CREATE TABLE IF NOT EXISTS research_methods (
  id                  SERIAL PRIMARY KEY,
  key                 TEXT UNIQUE NOT NULL,          -- 英文短 key，如 hplc、cell_culture
  name                TEXT NOT NULL,                 -- 中文名
  name_en             TEXT,
  aliases             TEXT[] DEFAULT '{}',
  field               TEXT,                          -- 大类：生命科学 / 化学与材料 / 物理与工程 / 地球与环境 / 医学 / 计算与数据
  disciplines         TEXT,                          -- 适用学科，中文分号隔开（和 research_products.disciplines 同口径）
  summary             TEXT,                          -- 原理 / 用途一两句
  typical_experiments JSONB DEFAULT '[]',            -- [{ name, goal }]
  steps               JSONB DEFAULT '[]',            -- 操作指南：[{ title, detail }]
  pitfalls            JSONB DEFAULT '[]',            -- 常见坑：[{ symptom, cause, check }]
  safety              TEXT,
  skills              JSONB DEFAULT '[]',            -- 训练的本事：[{ name, why }]
  generic_instruments TEXT[] DEFAULT '{}',           -- 通用仪器名（对 work_items.name / aliases）
  level               TEXT,                          -- 入门（本科 / 研一）/ 进阶（博士）/ 专精（平台工程师）
  product_count       INT DEFAULT 0,                 -- 对上的科研产品数（脚本回写）
  source              TEXT,
  ai_sources          JSONB,
  human_review_status TEXT DEFAULT 'review',
  human_locked_fields TEXT[] DEFAULT '{}',
  if_delete           BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE research_methods ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS research_methods_field_idx ON research_methods (field);

-- 产品用到的方法：方法 key，英文逗号隔开（如 "hplc,lcms"）；表只有一万行，加可空列不重写表
ALTER TABLE research_products ADD COLUMN IF NOT EXISTS methods TEXT;
