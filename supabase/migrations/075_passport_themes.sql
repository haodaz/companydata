-- 人才护照 · 定制我的护照（2026-11-17）：封面颜色、内页纸张颜色、封面烫印纹样、封面一句话
-- 本人在「我的 · 定制我的护照」里选；分享出去的那本也按持有人的定制显示。
-- cover_theme：navy 深藏青（默认）| wine 酒红 | green 墨绿 | black 黑（配银）| brown 深棕 | royal 皇家蓝
-- paper_theme：内页纸张，像电子书那样几种浅色切换（不做深色）：cream 奶白（默认）| sepia 米黄（护眼）| gray 浅灰 | mint 淡青绿 | pink 淡粉
-- cover_pattern：plain 素面（默认）| fret 经典回纹 | wave 波浪防伪纹 | stars 星点
-- cover_motto：封面下方烫金的一句话，≤ 12 字；空 = 不显示
-- 值由服务端接口按白名单校验（不加 check 约束，以后加样式不用改表）。
-- 只新增列，不改动、不删除任何已有的表和数据。可重复执行。
ALTER TABLE passports ADD COLUMN IF NOT EXISTS cover_theme   TEXT NOT NULL DEFAULT 'navy';
ALTER TABLE passports ADD COLUMN IF NOT EXISTS paper_theme   TEXT NOT NULL DEFAULT 'cream';
ALTER TABLE passports ADD COLUMN IF NOT EXISTS cover_pattern TEXT NOT NULL DEFAULT 'plain';
ALTER TABLE passports ADD COLUMN IF NOT EXISTS cover_motto   TEXT NOT NULL DEFAULT '';

NOTIFY pgrst, 'reload schema';
