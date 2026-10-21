-- 科研产品图片（用户 10-21：仪器图片很重要）。简介按数据部门口径不含图，图单独存：
-- images = [{"url": 原图链, "alt": 图片说明, "storage_path": 存储桶里的路径, "w": 宽, "h": 高}]，第一张当主图
-- 图片桶公开（前台直接显示）；手册桶 research-docs 仍是私有。可重复执行。
ALTER TABLE research_products ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]';
INSERT INTO storage.buckets (id, name, public) VALUES ('research-images', 'research-images', true) ON CONFLICT (id) DO NOTHING;
