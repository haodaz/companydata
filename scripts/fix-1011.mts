/**
 * 数据部门 2026-10-11 反馈的存量回溯：
 *   npx tsx scripts/fix-1011.mts            只出报告，不写库
 *   npx tsx scripts/fix-1011.mts --apply    写库
 *   --only name|logo                        只跑其中一步
 *
 * ① 英文名里存的是网址（早先粘贴导入「名称, 官网」，官网落进了英文名列）：
 *    官网空着就把它的站点根地址挪过去；英文名清空后让便宜模型按「中文名 + 官网」给官方英文名，不确定的留空。
 * ② logo_url：有官网、没 logo 的企业抓官网首页找 logo 图片地址（src/lib/company-logo.ts）。
 * 人工锁定的字段（human_locked_fields）不动。
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { selectAll } = await import('../src/lib/supabase-all');
const { generateCheap } = await import('../src/lib/llm-client');
const { parseJsonLoose } = await import('../src/lib/agents/search-llm');
const { findLogoUrl } = await import('../src/lib/company-logo');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const ONLY = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : '';
const run = (k: string) => !ONLY || ONLY === k;
console.log(APPLY ? '▶ 写库' : '▶ 只出报告（加 --apply 写库）');

const { data: rows, error } = await selectAll(() => db.from('companies').select('id, name, name_en, official_website, logo_url, human_locked_fields').order('id'));
if (error) throw error;
const locked = (r: any, k: string) => (r.human_locked_fields || []).includes(k);
const isUrl = (s: string | null) => !!s && /^(https?:\/\/|www\.)/i.test(s.trim());

// ── ① 英文名 ──
if (run('name')) {
  const bad = rows.filter((r: any) => isUrl(r.name_en) && !locked(r, 'name_en'));
  console.log(`\n① 英文名是网址的企业 ${bad.length} 家`);
  for (const r of bad) {
    try {
      const u = new URL(/^https?:/i.test(r.name_en) ? r.name_en : `https://${r.name_en}`);
      // 招聘 / 分站子域名（talent.deepseek.com、jn.58.com）换成 www.主域名
      const parts = u.hostname.split('.');
      if (parts.length >= 3 && parts[0] !== 'www' && !/^(com|net|org|co)$/.test(parts[parts.length - 2])) u.hostname = ['www', ...parts.slice(-2)].join('.');
      r._site = r.official_website || `${u.protocol}//${u.hostname}/`;
    } catch { r._site = r.official_website; }
  }
  // 便宜模型按批给英文名
  const names = new Map<number, string | null>();
  for (let i = 0; i < bad.length; i += 40) {
    const batch = bad.slice(i, i + 40);
    const prompt = `For each company below, give its official English name as used on its website / annual report (e.g. "Luxshare Precision Industry Co., Ltd." or the brand name used internationally like "BYD"). If the name is already English, return it as is. If you are not confident, return null — do NOT transliterate pinyin or guess.
Return ONLY JSON: { "items": [ { "id": <id>, "name_en": "..." | null } ] }

${batch.map((r: any) => `${r.id}\t${r.name}\t${r._site || ''}`).join('\n')}`;
    try {
      const res = await generateCheap(prompt, 'gemini-3.8-flash', { jsonMode: true });
      for (const it of parseJsonLoose(res.text)?.items || []) {
        const v = typeof it?.name_en === 'string' ? it.name_en.trim() : '';
        names.set(Number(it.id), v && !isUrl(v) && !/^null$/i.test(v) ? v : null);
      }
    } catch (e: any) { console.warn(`  第 ${i / 40 + 1} 批英文名失败：${e.message}`); }
    process.stdout.write(`\r  英文名 ${Math.min(i + 40, bad.length)}/${bad.length}`);
  }
  console.log();
  let moved = 0, named = 0;
  for (const r of bad) {
    const patch: Record<string, any> = { name_en: names.get(r.id) ?? null };
    if (patch.name_en) named++;
    if (!r.official_website && r._site && !locked(r, 'official_website')) { patch.official_website = r._site; moved++; }
    if (bad.indexOf(r) < 12) console.log(`  #${r.id} ${r.name}：${r.name_en} → 英文名 ${patch.name_en ?? '（空）'}${patch.official_website ? `，官网 ${patch.official_website}` : ''}`);
    if (APPLY) { const { error } = await db.from('companies').update(patch).eq('id', r.id); if (error) console.warn(`  #${r.id} 写库失败：${error.message}`); }
    if (patch.official_website) r.official_website = patch.official_website;
  }
  console.log(`  清掉网址 ${bad.length} 家，其中补上英文名 ${named} 家、官网空着挪过去 ${moved} 家`);
}

// ── ② logo ──
if (run('logo')) {
  const todo = rows.filter((r: any) => r.official_website && !r.logo_url && !locked(r, 'logo_url'));
  console.log(`\n② 有官网、没 logo 的企业 ${todo.length} 家`);
  let hit = 0, done = 0, fav = 0;
  const queue = [...todo];
  await Promise.all(Array.from({ length: 8 }, async () => {
    for (let r = queue.shift(); r; r = queue.shift()) {
      const logo = await findLogoUrl(r.official_website).catch(() => null);
      done++;
      if (logo) {
        hit++; if (/favicon|\.ico(\?|$)/i.test(logo)) fav++;
        if (hit <= 10) console.log(`  #${r.id} ${r.name}：${logo}`);
        if (APPLY) await db.from('companies').update({ logo_url: logo }).eq('id', r.id);
      }
      if (done % 50 === 0) console.log(`  进度 ${done}/${todo.length}，找到 ${hit}`);
    }
  }));
  console.log(`  找到 logo ${hit}/${todo.length} 家（其中只拿到站点图标 ${fav} 家）`);
}
