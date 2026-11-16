/**
 * 数据部门 11-16（姜贺）《AI数据工厂科研仪器公司反馈-1116》：红字是改好的正确值，照着写回企业库。
 * 红字从 xlsx 的样式里读出来（scripts/data/jianghe-1116-red.json：[行号, 列名, 值]，行号对应表里的行）；「null」写空；改过的字段锁住，以后补全不覆盖。
 *   npx tsx scripts/companies/fix-1116.mts --file <xlsx> [--apply]
 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
import XLSX from 'xlsx';
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { normalizeCompanyRegion } = await import('@/lib/region-codes');
const opt = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : ''; };
const APPLY = process.argv.includes('--apply'), SRC = '数据部门 11-16 人工修正';
const rows: any[] = XLSX.utils.sheet_to_json(XLSX.readFile(opt('file')).Sheets['科研仪器公司-ai数据工厂_1110'], { defval: '' });
const red: [number, string, string][] = JSON.parse(fs.readFileSync('scripts/data/jianghe-1116-red.json', 'utf8'));
const COL: Record<string, string> = { applysqure_id: 'external_id', slug: 'external_id' };
const want = new Map<number, Record<string, any>>();
for (const [row, col, v] of red) {
  const id = Number(rows[row - 2]?.id); if (!id) continue;
  const k = COL[col] || col, val = !String(v).trim() || String(v).trim() === 'null' ? null : String(v).trim();
  want.set(id, { ...(want.get(id) || {}), [k]: k === 'country' && val ? String(Number(val)) : val });
}
const ids = [...want.keys()];
const { data } = await db.from('companies').select('*').in('id', ids);
const cur = new Map((data || []).map((c: any) => [c.id, c]));
const stat: Record<string, number> = {}, bak: any[] = [];
for (const [id, w0] of want) {
  const c: any = cur.get(id); if (!c) { console.log('库里没有', id); continue; }
  let w: any = { ...w0 };
  if ('country' in w) w = normalizeCompanyRegion(w, c);
  const changed = Object.keys(w).filter(k => JSON.stringify(c[k] ?? null) !== JSON.stringify(w[k] ?? null));
  for (const k of changed) stat[k] = (stat[k] || 0) + 1;
  if (!changed.length) continue;
  if (changed.includes('external_id')) { const { data: h } = await db.from('companies').select('id, name').eq('external_id', w.external_id).neq('id', id).maybeSingle(); console.log(`#${id} 编号 ${c.external_id} → ${w.external_id}${h ? `（被 #${h.id} ${h.name} 占着，跳过）` : ''}`); if (h) { delete w.external_id; } else w.flora_id_locked = true; }
  bak.push(c);
  if (APPLY) {
    const patch = Object.fromEntries(changed.filter(k => k in w).map(k => [k, w[k]]));
    if (w.flora_id_locked) patch.flora_id_locked = true;
    const ps = { ...(c.profile_source || {}) }; for (const k of Object.keys(patch)) ps[k] = SRC;
    const { error } = await db.from('companies').update({ ...patch, human_locked_fields: [...new Set([...(c.human_locked_fields || []), ...Object.keys(patch).filter(k => k !== 'flora_id_locked')])], profile_source: ps, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) console.log('✗', id, error.message);
  }
}
console.log('要改的企业', bak.length, '字段', stat);
if (APPLY) { fs.writeFileSync('reports/1116-企业修正-改前备份.json', JSON.stringify(bak, null, 1)); console.log('已改'); }
