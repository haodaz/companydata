/**
 * 老空间第 1 章扩成一整天之后的收尾（2026-10-11）：
 *   - 拉花师傅 / 焊工师傅：老第 1 章原来横跨周一到周三，排进一天后落在 09:00——场景时间收回到当天上午
 *   - 月嫂带教官：第 3 步说话人是一句旁白「你打开纸尿裤与喂养记录表」→ 去掉说话人；「儿科医生与护士长」两个人合成一行 → 李医生（补画头像）
 * 第 1 章在 skill_tasks.sim 上的镜像一起改。
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { drawCastAsset, loadCast } = await import('../src/lib/lab-cast-server');
const { familyOf } = await import('../src/lib/career-family');

const { data: all } = await db.from('skill_tasks').select('id, profile, jd_snapshot, sim');
const space = (pre: string) => all!.find(x => x.id.startsWith(pre))!;
async function firstChapter(taskId: string) {
  const { data } = await db.from('lab_chapters').select('id, seq, sim').eq('task_id', taskId).order('seq').limit(1);
  return data![0];
}
async function save(taskId: string, ch: any) {
  await db.from('lab_chapters').update({ sim: ch.sim, updated_at: new Date().toISOString() }).eq('id', ch.id);
  if (ch.seq === 1) await db.from('skill_tasks').update({ sim: ch.sim }).eq('id', taskId);
}

for (const [pre, times] of [['155db8f9', ['09:00', '09:10', '09:25', '09:40', '09:55', '10:05', '10:15']], ['a7f8f2e7', ['09:00', '09:10', '09:40', '09:50', '10:00']]] as const) {
  const t = space(pre); const ch = await firstChapter(t.id);
  ch.sim.steps.forEach((s: any, i: number) => { if (s.scene && times[i]) s.scene.time = times[i]; });
  await save(t.id, ch);
  console.log(t.profile?.role, '场景时间 →', times.join(' / '));
}

const ys = space('19fd15d1'); const ch = await firstChapter(ys.id);
const cast = await loadCast(ys.id);
const bogus = cast.find(m => m.name === '你打开纸尿裤与喂养记录表');
const pair = cast.find(m => m.name === '儿科医生与护士长');
for (const s of ch.sim.steps) {
  if (s.scene?.who === '你打开纸尿裤与喂养记录表') s.scene.who = '';
  if (s.scene?.who === '儿科医生与护士长') s.scene.who = '李医生';
}
await save(ys.id, ch);
if (bogus) { await db.from('lab_cast').delete().eq('id', bogus.id); console.log('月嫂：删掉角色表里的旁白行', bogus.code); }
if (pair) {
  const { data: m } = await db.from('lab_cast').update({ name: '李医生', type_name: '儿科医生·中年男', look: '中年男医生，短发，戴眼镜，白大褂，胸前挂听诊器，手里拿着交班本，神情严肃但温和' })
    .eq('id', pair.id).select('*, asset:lab_art_assets(*)').single();
  const a = await drawCastAsset(ys.id, m as any, familyOf(ys.jd_snapshot?.career?.profession || ys.profile?.role || ''));
  console.log('月嫂：儿科医生与护士长 → 李医生，头像', a.code);
}
