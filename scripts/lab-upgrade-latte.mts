/**
 * 拉花师傅 09:00 章：三台拉花工位换成手势台面（surface: 'latte'，LatteOverlay）——变量 / 规则 / 目标 / 轨迹都不动，只是不再拨滑块。
 *   npx tsx scripts/lab-upgrade-latte.mts            # 写入
 *   npx tsx scripts/lab-upgrade-latte.mts --restore  # 去掉 surface 字段，回到滑块
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');

const TASK = '155db8f9-b0b3-4f08-a842-df1e94c381f4', CHAPTER = '6326d2ab-c9e3-47a3-a345-c7f6a307d381';
const restore = process.argv.includes('--restore');
const patch = (sim: any) => { let n = 0; for (const s of sim?.steps || []) if (s.type === 'bench' && s.bench) { if (restore) delete s.bench.surface; else s.bench.surface = 'latte'; n++; } return n; };

const { data: ch, error } = await db.from('lab_chapters').select('sim').eq('id', CHAPTER).single();
if (error) throw error;
const n = patch(ch.sim);
const { error: e2 } = await db.from('lab_chapters').update({ sim: ch.sim, updated_at: new Date().toISOString() }).eq('id', CHAPTER);
if (e2) throw e2;
const { data: t } = await db.from('skill_tasks').select('sim').eq('id', TASK).single();
if (t?.sim?.steps) { const m = patch(t.sim); await db.from('skill_tasks').update({ sim: t.sim }).eq('id', TASK); console.log('skill_tasks.sim 镜像', m, '台'); }
console.log(restore ? `已去掉 surface（${n} 台）` : `已标成拉花手势台面（${n} 台）`);
