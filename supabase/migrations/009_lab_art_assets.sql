-- 技能空间的美术图库：生成过的场景底图与人物立绘登记在这里，
-- 下一个领域相近的空间（会计 ↔ 精算、咖啡师 ↔ 调酒师、焊工 ↔ 钣金工）直接复用，不重复花钱重画。
-- 匹配靠两个字段：family（一级领域）+ slot（场景位 / 人物角色）。
create table if not exists lab_art_assets (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('scene', 'npc')),
  family      text not null default '',   -- 一级领域：制造 / 餐饮零售 / 医疗健康 / 金融财会 ...
  slot        text not null default '',   -- scene：车间 / 门店 / 办公室 / 实验室 …；npc：带教师傅 / 主管 / 客户 …
  domain      text not null default '',   -- 原始领域文本（技能卡的 domain），留作追溯
  profession  text not null default '',   -- 当时是给哪个职业 / 岗位生成的
  prompt      text not null default '',
  url         text not null,
  uses        integer not null default 1, -- 被几个空间用过
  created_at  timestamptz not null default now()
);

create index if not exists lab_art_assets_lookup on lab_art_assets (kind, family, slot);
create unique index if not exists lab_art_assets_url on lab_art_assets (url);

comment on table lab_art_assets is '技能空间美术图库：按「一级领域 + 场景位 / 人物角色」复用已生成的底图与立绘';
comment on column lab_art_assets.uses is '被多少个空间引用过；同一组合攒够若干张后就不再新生成，改为随机复用，兼顾省钱与不千篇一律';
