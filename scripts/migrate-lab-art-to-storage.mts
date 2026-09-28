/**
 * 把本机 public/lab/gen/ 里的生成美术上传到 Supabase Storage（桶 lab-art，公开），并把技能空间里 /lab/gen/... 的引用改成公开 URL。
 *   npx tsx scripts/migrate-lab-art-to-storage.mts
 */
import fs from 'node:fs';
import path from 'node:path';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { uploadLabAsset } = await import('../src/lib/lab-art');
const dir = path.join(process.cwd(), 'public', 'lab', 'gen');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /\.(png|jpe?g)$/i.test(f)) : [];
const urlOf = new Map<string, string>();
for (const f of files) {
  const url = await uploadLabAsset(fs.readFileSync(path.join(dir, f)), f, f.endsWith('.png') ? 'image/png' : 'image/jpeg');
  urlOf.set(`/lab/gen/${f}`, url); console.log('⬆️', f, '→', url.slice(0, 80));
}
const swap = (u: any) => (typeof u === 'string' && urlOf.has(u) ? urlOf.get(u)! : u);
const { data: tasks } = await db.from('skill_tasks').select('id, sim');
let changed = 0;
for (const t of tasks || []) {
  const sim = t.sim; if (!sim) continue;
  const before = JSON.stringify(sim);
  if (sim.art) { sim.art.cover = swap(sim.art.cover); for (const k of Object.keys(sim.art.scenes || {})) sim.art.scenes[k] = swap(sim.art.scenes[k]); for (const k of Object.keys(sim.art.npcs || {})) sim.art.npcs[k] = swap(sim.art.npcs[k]); }
  for (const s of sim.steps || []) if (s.bench?.scene?.image) s.bench.scene.image = swap(s.bench.scene.image);
  if (JSON.stringify(sim) !== before) { const { error } = await db.from('skill_tasks').update({ sim }).eq('id', t.id); if (error) console.log('❌', t.id, error.message); else { changed++; console.log('✅ 改写', t.id.slice(0, 8)); } }
}
console.log(`DONE 上传 ${files.length} 个文件，改写 ${changed} 个空间`);
