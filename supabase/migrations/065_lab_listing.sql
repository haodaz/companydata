-- 百业工厂 · 空间上架状态（2026-11-06）：以前只要有一章「已发布」空间就进体验馆，生成完直接上架、没有管理这一步。
-- draft 草稿（只在百业工厂里，体验馆看不到）/ listed 已上架 / unlisted 已下架（体验馆看不到，有链接的人仍能打开）。
-- 已有的空间默认 listed，照旧；从新建空间页生成的先是 draft，在工厂里点「上架」。
ALTER TABLE skill_tasks ADD COLUMN IF NOT EXISTS listing TEXT NOT NULL DEFAULT 'listed' CHECK (listing IN ('draft', 'listed', 'unlisted'));
ALTER TABLE skill_tasks ADD COLUMN IF NOT EXISTS listed_at TIMESTAMPTZ;
NOTIFY pgrst, 'reload schema';
