/**
 * 数据部门 11-09（姜贺）《科研仪器厂商企业反馈-1109》：按名单刷新 external_id / slug；重复的按「处理」列；source=科研仪器 且 external_id 为空的按老规则赋值。
 * 依赖迁移 065（052 的冻结留了 flora_id_locked 的口子）。先写备份 reports/1109-科研仪器编号-刷新前备份.json。
 *   npx tsx scripts/companies/refresh-supplier-ids-1109.mts --file <xlsx> [--apply]
 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
import XLSX from 'xlsx';
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const { ensureCompanyFloraId, countryCode, nameInitials } = await import('@/lib/company-flora-id');
const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APPLY = process.argv.includes('--apply');
const rows: any[] = XLSX.utils.sheet_to_json(XLSX.readFile(opt('file')).Sheets['新赋值'], { defval: '' });
const ids = rows.map(r => Number(r.id));
const cur = new Map<number, any>();
for (let i = 0; i < ids.length; i += 200) { const { data } = await db.from('companies').select('id, name, external_id, slug, if_delete, human_review_status, parent_company_id, flora_id_locked').in('id', ids.slice(i, i + 200)); for (const c of data || []) cur.set(c.id, c); }
const assign: { id: number; to: string }[] = [], hide: number[] = [], parent: { id: number; to: number }[] = [], probs: string[] = [];
for (const r of rows) {
  const id = Number(r.id), to = String(r.external_id_new || '').trim(), how = String(r['处理']), c = cur.get(id);
  if (!c) { probs.push(`#${id} ${r.name}：库里没有`); continue; }
  if (String(c.external_id) !== String(r.external_id)) probs.push(`#${id} ${c.name}：表里旧编号 ${r.external_id}，库里 ${c.external_id}`);
  if (/^if_delete/.test(how)) { hide.push(id); continue; }
  if (/F列/.test(how)) { if (!to) probs.push(`#${id}：要赋值但 F 列是空的`); else if (to !== c.external_id) assign.push({ id, to }); }
  const m = how.match(/parent_company_id 赋值\s*(\d+)/); if (m) parent.push({ id, to: Number(m[1]) });
}
const tos = new Map<string, number[]>(); for (const a of assign) tos.set(a.to, [...(tos.get(a.to) || []), a.id]);
for (const [t, a] of tos) if (a.length > 1) probs.push(`名单内撞号 ${t}：${a.map(i => `#${i} ${cur.get(i).name}`).join(' / ')}`);
const holders = new Map<string, any>();
const vals = [...tos.keys()];
for (let i = 0; i < vals.length; i += 100) { const { data } = await db.from('companies').select('id, name, external_id, if_delete').in('external_id', vals.slice(i, i + 100)); for (const c of data || []) holders.set(c.external_id, c); }
const assigning = new Set(assign.map(a => a.id)), hiding = new Set(hide);
const blocked = new Set<string>();
for (const [t, h] of holders) if (!tos.get(t)!.includes(h.id)) { const moves = assigning.has(h.id); probs.push(`${t} 已被 #${h.id} ${h.name}${h.if_delete ? '（已删）' : ''} 占着${moves ? '（它本身也要换号）' : hiding.has(h.id) ? '（它这次标删除）' : ''}，要给 #${tos.get(t)!.join(',')}`); if (!moves) blocked.add(t); }
const { data: nul } = await selectAll(() => db.from('companies').select('id, name, country, official_website').eq('source', '科研仪器').is('external_id', null).not('if_delete', 'is', true).order('id'));
const { data: prods } = await db.from('research_products').select('supplier_id').in('supplier_id', hide).eq('if_delete', false);
const pc: any = {}; for (const p of prods || []) pc[p.supplier_id] = (pc[p.supplier_id] || 0) + 1;
console.log(`名单 ${rows.length}；要换号 ${assign.length}（已经是这个号的不动）；标删除 ${hide.length}；挂集团 ${parent.length}；编号为空待赋值 ${(nul as any[]).length}`);
console.log('标删除的企业下面还有产品：', hide.map(i => `#${i} ${cur.get(i)?.name}：${pc[i] || 0}`).join('；'));
console.log('问题', probs.length); probs.forEach(p => console.log(' ', p));
console.log('空编号：', (nul as any[]).map(c => `#${c.id} ${c.name}|${c.country}|${c.official_website || '无官网'}|${countryCode(c.country, c.name) || '国家认不出'}.${nameInitials(c.name)}`).join('\n  '));
if (!APPLY) process.exit(0);
const bak = 'reports/1109-科研仪器编号-刷新前备份.json';
if (!fs.existsSync(bak)) fs.writeFileSync(bak, JSON.stringify([...cur.values()], null, 1));
let done = 0;
const dups = new Set([...tos].filter(([, a]) => a.length > 1).map(([t]) => t));
// 占号的先挪开（它自己也要换号时），两步走：先写临时号
const order = assign.filter(a => !dups.has(a.to) && !blocked.has(a.to));
for (const a of order) { const { error } = await db.from('companies').update({ external_id: `tmp-1109-${a.id}`, flora_id_locked: true }).eq('id', a.id); if (error) { console.log('✗ tmp', a.id, error.message); process.exit(1); } }
for (const a of order) { const { error } = await db.from('companies').update({ external_id: a.to, flora_id_locked: true }).eq('id', a.id); if (error) console.log('✗', a.id, a.to, error.message); else done++; }
if (hide.length) { const { error } = await db.from('companies').update({ if_delete: true, human_review_status: 'hidden' }).in('id', hide); if (error) console.log('✗ hide', error.message); }
for (const p of parent) await db.from('companies').update({ parent_company_id: p.to }).eq('id', p.id);
let filled = 0;
for (const c of nul as any[]) { await db.from('companies').update({ updated_at: new Date().toISOString() }).eq('id', c.id); const v = await ensureCompanyFloraId(c.id).catch(() => null); if (v) filled++; else console.log('  没赋上', c.id, c.name); }
console.log(`已换号 ${done}；标删除 ${hide.length}；挂集团 ${parent.length}；空编号赋上 ${filled}/${(nul as any[]).length}；跳过撞号 ${assign.length - order.length}`);
