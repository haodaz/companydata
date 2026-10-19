/**
 * 交接包导入（放到 simulator 的 scripts/ 下）：
 *   npx tsx --env-file=.env.local scripts/import-pack.mts <包.json> [--bucket lab-art] [--dry]
 * 包来自 companydata 的 /lab/admin/handover（或 /api/lab/admin/handover?pack=…），格式 { manifest: { format: 'ai100-pack', kind }, ...表名: 行[], assets: [{ bucket, path, url }] }。
 * 做三件事：1) 按 assets 清单把图片从海外公网地址下下来、传到本地 Supabase 的同名桶同名路径（已存在跳过）；
 *          2) 把包里所有海外地址替换成本地地址；3) 各表按 id upsert（重复导入 = 覆盖更新）。
 * 表的顺序按外键：skills → skill_tasks → lab_chapters → lab_art_assets → lab_cast → standard_links；occupations → 其它。
 */
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const [file, ...rest] = process.argv.slice(2);
if (!file) { console.error('用法：npx tsx scripts/import-pack.mts <包.json> [--bucket lab-art] [--dry]'); process.exit(1); }
const DRY = rest.includes('--dry');
const BUCKET_OVERRIDE = rest.includes('--bucket') ? rest[rest.indexOf('--bucket') + 1] : '';
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = createClient(URL_, KEY, { auth: { persistSession: false } });

const pack = JSON.parse(fs.readFileSync(file, 'utf8'));
if (pack.manifest?.format !== 'ai100-pack') { console.error('不是交接包'); process.exit(1); }
console.log(`包：${pack.manifest.kind} · 导出于 ${pack.manifest.exported_at}`, pack.manifest.counts);

// 1) 图片：下载 → 上传本地桶 → 记录新旧地址
const map = new Map<string, string>();
for (const a of pack.assets || []) {
  const bucket = BUCKET_OVERRIDE || a.bucket; const local = `${URL_}/storage/v1/object/public/${bucket}/${a.path}`;
  map.set(a.url, local);
  if (DRY) continue;
  const exists = await db.storage.from(bucket).list(a.path.split('/').slice(0, -1).join('/') || undefined, { search: a.path.split('/').pop() });
  if (exists.data?.some(f => f.name === a.path.split('/').pop())) continue;
  const r = await fetch(a.url); if (!r.ok) { console.warn('下载失败', a.url, r.status); continue; }
  const buf = Buffer.from(await r.arrayBuffer());
  const up = await db.storage.from(bucket).upload(a.path, buf, { contentType: r.headers.get('content-type') || 'application/octet-stream', upsert: true });
  if (up.error) console.warn('上传失败', a.path, up.error.message); else console.log('图片', a.path, `${Math.round(buf.length / 1024)}KB`);
}
// 2) 全文替换地址
let text = JSON.stringify(pack);
for (const [from, to] of map) text = text.split(from).join(to);
const data = JSON.parse(text);

// 3) upsert
const ORDER: Record<string, string[]> = {
  // 顺序按外键：章节的 cover_cast 指人物表，所以人物表在章节前；人物表的 asset_id 指素材库
  spaces: ['skills', 'spaces:skill_tasks', 'art:lab_art_assets', 'cast:lab_cast', 'chapters:lab_chapters', 'standard_links'],
  lessons: ['lessons:lab_chapters'],
  knowledge: ['occupations', 'occupation_salaries', 'occupation_region_salaries', 'occupation_faqs', 'typical_tasks', 'work_places', 'work_stations', 'work_items', 'industry_standards', 'entity_links'],
  work: ['work_tasks'],
};
// 空间包：人物表 (task_id, code) 唯一、规则出处 (standard_id, space_id, chapter_id, target) 唯一——公司库里这些空间下可能已有对账脚本建的同编号不同 id 的行，
// 先把这些空间下的旧行删掉再插（章节 cover_cast 指向旧行的会被 SET NULL，随后章节 upsert 又指回包里的新行）
if (data.manifest.kind === 'spaces' && !DRY) {
  const spaceIds: string[] = (data.spaces || []).map((t: any) => t.id);
  for (let i = 0; i < spaceIds.length; i += 50) {
    const ids = spaceIds.slice(i, i + 50);
    const d1 = await db.from('standard_links').delete().in('space_id', ids); if (d1.error) { console.error('清旧规则出处失败', d1.error.message); process.exit(1); }
    const d2 = await db.from('lab_cast').delete().in('task_id', ids); if (d2.error) { console.error('清旧人物表失败', d2.error.message); process.exit(1); }
  }
  console.log(`清掉 ${spaceIds.length} 个空间下的旧人物表 / 规则出处`);
}
for (const spec of ORDER[data.manifest.kind] || []) {
  const [key, table] = spec.includes(':') ? spec.split(':') : [spec, spec];
  const rows: any[] = data[key] || []; if (!rows.length) continue;
  console.log(`${table}: ${rows.length} 行${DRY ? '（dry）' : ''}`);
  if (DRY) continue;
  // 章节：skill_tasks 有个触发器（015 lab_sync_first_chapter），空间第一次写进去、还没有章节时会自动生成一条「第 1 章」（新 id）；
  // 包里的第 1 章随后按自己的 id 插进去就成了两条 seq=1。插章节前把这些空间下不在包里的章节删掉（作答记录 chapter_id 会 SET NULL）
  if (table === 'lab_chapters' && data.manifest.kind === 'spaces') {
    const keep = new Set(rows.map(r => r.id)); const spaceIds: string[] = [...new Set(rows.map(r => r.task_id))];
    let removed = 0;
    for (let i = 0; i < spaceIds.length; i += 50) {
      const r = await db.from('lab_chapters').select('id').in('task_id', spaceIds.slice(i, i + 50)); if (r.error) { console.error('查旧章节失败', r.error.message); process.exit(1); }
      const extra = (r.data || []).map(x => x.id).filter(id => !keep.has(id));
      if (extra.length) { const d = await db.from('lab_chapters').delete().in('id', extra); if (d.error) { console.error('清触发器生成的章节失败', d.error.message); process.exit(1); } removed += extra.length; }
    }
    console.log(`清掉触发器 / 旧数据生成的多余章节 ${removed} 条`);
  }
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    // 教案包只更新两列，别把别的列覆盖掉
    const { error } = data.manifest.kind === 'lessons'
      ? await Promise.all(chunk.map(r => db.from(table).update({ lesson: r.lesson, lesson_at: r.lesson_at }).eq('id', r.id))).then(rs => ({ error: rs.find(x => x.error)?.error }))
      : await db.from(table).upsert(chunk, { onConflict: table === 'industry_standards' ? 'dedupe_key' : 'id' });
    if (error) { console.error(`${table} 第 ${i} 批失败：`, error.message); process.exit(1); }
  }
}
console.log('完成');
