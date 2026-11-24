-- 职业库别名改成英文分号隔开的文本（数据部门 11-24 赞灵）：原来是 text[]，数组专用的 GIN 索引先去掉；635 行，几秒完成
DROP INDEX IF EXISTS idx_occupations_aliases;
ALTER TABLE occupations ALTER COLUMN aliases DROP DEFAULT;
ALTER TABLE occupations ALTER COLUMN aliases TYPE text USING NULLIF(array_to_string(aliases, ';'), '');
