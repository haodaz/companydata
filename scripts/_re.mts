import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin } = await import('../src/lib/supabase');
const { discoverRecruitEntry } = await import('../src/lib/agents/recruit-entry');
const named = ['华泰证券', '珞石科技', '华大九天', '蓝箭航天', '立讯精密'];
const { data: a } = await supabaseAdmin.from('companies').select('id, name, official_website, campus_url, careers_url').in('name', named);
const { data: b } = await supabaseAdmin.from('companies').select('id, name, official_website, campus_url, careers_url').not('official_website', 'is', null).is('campus_url', null).is('careers_url', null).not('profile_crawled_at', 'is', null).limit(200);
const rnd = (b || []).sort(() => Math.random() - 0.5).slice(0, 7);
const list = [...(a || []), ...rnd];
const res = await Promise.all(list.map(async (c: any) => {
  const t0 = Date.now();
  const r = await discoverRecruitEntry(c.name, c.official_website).catch(e => ({ via: 'error ' + e.message } as any));
  return `${c.name.padEnd(10)} ${String(r.via).padEnd(8)} ${Math.round((Date.now() - t0) / 1000)}s\n    校招 ${r.campus || '—'}\n    实习 ${r.intern || '—'}\n    社招 ${r.social || '—'}\n    总入口 ${r.careers || '—'}`;
}));
console.log(res.join('\n'));
