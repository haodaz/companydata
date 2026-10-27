/**
 * Forage 公开模拟（外层）入库：work_external_simulations（迁移 051，10-26）。
 *   npx tsx scripts/forage/load.mts --dir <下载的 html 目录> [--apply]
 * html 文件名 = 网址里 /simulations/ 后面的部分，「/」换成「__」。只解析本地文件，不联网。
 * 公司能对上企业库的（中英文名 / 别名，忽略大小写和标点）挂 company_id；对不上的不新建企业（宁空不错）。
 */
import fs from 'node:fs';
import path from 'node:path';
process.loadEnvFile('.env.local');
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const { parsePage } = await import('./parse.mjs');

const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const DIR = opt('dir'), APPLY = process.argv.includes('--apply');
const norm = (s: string) => (s || '').toLowerCase().replace(/&/g, 'and').replace(/\b(usa|us|uk|au|inc|ltd|llp|plc|group|global|tech|the)\b/g, '').replace(/[^a-z0-9一-龥]+/g, '');

const { data: cs } = await selectAll(() => db.from('companies').select('id, name, name_en, brief_name, aliases').not('if_delete', 'is', true).order('id'));
const byName = new Map<string, number>();
for (const c of cs as any[]) for (const n of [c.name, c.name_en, c.brief_name, ...(c.aliases || [])]) { const k = norm(n); if (k.length >= 3 && !byName.has(k)) byName.set(k, c.id); }

const rows: any[] = [];
const bad: string[] = [];
for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.html')).sort()) {
  const url = `https://www.theforage.com/simulations/${f.replace(/\.html$/, '').replace('__', '/')}`;
  const html = fs.readFileSync(path.join(DIR, f), 'utf8');
  try {
    const r = parsePage(html, url);
    if (!r.title) { bad.push(`${f}：没解析到模拟（可能已下线）`); continue; }
    const cid = byName.get(norm(r.company_name || '')) ?? byName.get(norm((r.company_slug || '').replace(/-/g, ' '))) ?? null;
    rows.push({ ...r, company_id: cid, fetched_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  } catch (e: any) { bad.push(`${f}：${e.message}`); }
}
const linked = rows.filter(r => r.company_id).length;
console.log(`解析 ${rows.length} 个模拟，${new Set(rows.map(r => r.company_name)).size} 家公司，对上企业库 ${linked} 个；失败 ${bad.length}`);
bad.forEach(b => console.log('  ✗', b));
const careers: Record<string, number> = {};
for (const r of rows) for (const c of r.career_areas) careers[c] = (careers[c] || 0) + 1;
console.log('职业方向：', Object.entries(careers).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('、'));
if (!APPLY) process.exit(0);
for (let i = 0; i < rows.length; i += 50) {
  const { error } = await db.from('work_external_simulations').upsert(rows.slice(i, i + 50), { onConflict: 'source,external_id' });
  if (error) { console.log('✗', error.message); process.exit(1); }
}
console.log(`已写入 ${rows.length} 条`);
