/**
 * 第六轮（2026-10-27）真活数据导入：样本库（暗牌，出题时后台自动挑参照）+ 任务库的 25 道原题（明牌「原题直出」生成时按 id 回读）+ 外部模拟参照（Forage）。
 * 先跑迁移 047 / 048 / 049 / 051。按 id upsert，可重跑。
 *   npx tsx files/import-work-1027.mts <本包目录>/data
 * 环境：NEXT_PUBLIC_SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY（simulator 自己的库）
 */
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
try { process.loadEnvFile('.env.local'); } catch {}
const dir = process.argv[2] || 'data';
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const read = (f: string) => JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8'));
async function up(table: string, rows: any[], conflict = 'id') {
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + 100), { onConflict: conflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  console.log(`✅ ${table} ${rows.length}`);
}
// 样本：occupation_id 是这边职业库的编号，你们库里不一定对得上 → 清空，只留 occupation_name
await up('work_samples', read('work_samples.json').map((r: any) => ({ ...r, occupation_id: null })));
// 任务库原题：status=archived（不出现在任何列表），分享链接 / 管理密钥现生成，不对外
await up('work_tasks', read('work_tasks_showcase.json').map((t: any) => ({ ...t, share_token: randomBytes(8).toString('base64url'), owner_key: randomBytes(12).toString('base64url'), owner: { name: '任务库原题', contact: '' }, created_by: 'showcase' })));
await up('work_external_simulations', read('work_external_simulations.json'), 'source,external_id');
