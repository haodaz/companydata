/**
 * 撞脸修复：npx tsx scripts/lab-unique-faces.mts [--dry]
 * 以前「从业者本人」的立绘按领域复用，几位数字职人共用一张脸。每组留最早建的那位，
 * 其余的按各自职业现画一张；最后把四周仍不透明的立绘用泛洪去背补一遍。旧图都不删。
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin } = await import('../src/lib/supabase');
const { makeNpcAsset, edgeOpaque, cutoutByBorder, uploadLabAsset } = await import('../src/lib/lab-art');
const dry = process.argv.includes('--dry');

const { data } = await supabaseAdmin.from('skill_tasks').select('id, profile, jd_snapshot, created_at').order('created_at', { ascending: true });
const rows = (data || []) as any[];
const seen = new Map<string, string>();
const redo = rows.filter(t => { const a = t.profile?.avatar; if (!a) return false; if (seen.has(a)) return true; seen.set(a, t.profile.name); return false; });
console.log(`撞脸要重画 ${redo.length} 位：${redo.map(t => `${t.profile.name}·${t.profile.role}`).join('、')}\n`);

const fetchBuf = async (u: string) => Buffer.from(await (await fetch(u.startsWith('/') ? `http://localhost:3003${u}` : u)).arrayBuffer());

for (const t of redo) {
  const prof = t.jd_snapshot?.career?.profession || t.jd_snapshot?.title || '';
  const prompt = `${prof}本人（行当里叫「${t.profile.role}」），穿着这一行真实的工作服装，手里拿着这一行最典型的工具或物件，神情专注、自信、亲和，看得出是干这一行的人`;
  if (dry) { console.log('·', t.profile.name, prompt); continue; }
  try {
    const url = await makeNpcAsset(prompt, `face-${t.id.slice(0, 8)}-${Date.now().toString(36)}`);
    await supabaseAdmin.from('skill_tasks').update({ profile: { ...t.profile, avatar: url } }).eq('id', t.id);
    t.profile.avatar = url;
    console.log(`✅ ${t.profile.name}·${t.profile.role} 有了自己的脸`);
  } catch (e: any) { console.log(`❌ ${t.profile.name}：${e.message}`); }
}

console.log('\n检查四周仍不透明的立绘……');
for (const t of rows) {
  const u = t.profile?.avatar; if (!u) continue;
  try {
    const buf = await fetchBuf(u);
    const before = await edgeOpaque(buf);
    if (before <= 0.3) continue;
    const out = await cutoutByBorder(buf);
    const after = await edgeOpaque(out);
    if (dry) { console.log(`· ${t.profile.name} 四周不透明 ${Math.round(before * 100)}% → ${Math.round(after * 100)}%`); continue; }
    if (after >= before) { console.log(`– ${t.profile.name} 去背没变好，保留原图`); continue; }
    const url = await uploadLabAsset(out, `rekey-${t.id.slice(0, 8)}-${Date.now().toString(36)}.png`, 'image/png');
    await supabaseAdmin.from('skill_tasks').update({ profile: { ...t.profile, avatar: url } }).eq('id', t.id);
    console.log(`✅ ${t.profile.name} 去背：四周不透明 ${Math.round(before * 100)}% → ${Math.round(after * 100)}%`);
  } catch (e: any) { console.log(`❌ ${t.profile?.name}：${e.message}`); }
}
console.log('\n══ 立绘修复完成 ══');
