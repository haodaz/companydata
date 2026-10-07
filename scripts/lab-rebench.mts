/**
 * 只重建工位（人、编号、故事线、技能卡都不动）：npx tsx scripts/lab-rebench.mts 咖啡师 婚礼策划师 …
 * 每个职业可以带一句方向（HINTS），指明这一行的工位该练什么；不在表里的就按通用提示词重做。
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin } = await import('../src/lib/supabase');
const { rebuildBench } = await import('../src/lib/agents/skill-lab-build');

const HINTS: Record<string, string> = {
  咖啡师: '做成「调磨（dial-in）」工位：核心是读出液时间、出液量和口感反馈（偏酸 = 萃取不足、偏苦 = 萃取过度），反复调研磨度和粉量，几轮之内收敛到配方窗口。不要做成按顺序开关机器（开萃取、开蒸汽、擦蒸汽棒这类步骤开关）。',
  奶茶调饮师: '做成「配比出杯」工位：核心是照着三张单子把茶汤、奶、糖浆、冰的用量配准（少糖、去冰、加料要会换算），摇制到位，三杯在出杯时限内按顺序出、口感指标都在窗口里。不要做成操作萃茶机的开关流程。',
  室内装修工长: '做成「现场验收巡检」工位：工长拿着空鼓锤和靠尺沿房间巡检路线走一遍（用轨迹控件），在关键点位做判定——打压保压有没有掉压、墙地砖空鼓面积是否超标、阴阳角方正误差——发现问题当场派给对应工种整改。不要只做成操作一台试压机。',
  婚礼策划师: '做成「流程调度」型工位：婚礼策划的核心是统筹，不是手工。设备是一张婚礼当天的调度台：化妆、摄影跟拍、迎宾、音响灯光、仪式、宴席几条线并行推进，每条线一个进度或倒计时量；控件是派人、催办、调换顺序、启用备案（下雨、有人迟到、设备故障）；违规是「仪式开场时新娘未就位」「音响没试就开场」「主持人手里不是最新流程」这类；目标是准点开场、环节之间不冷场、突发情况在规定分钟内被消化。不要缝补、化妆、搬运这类手工操作。',
};

const want = process.argv.slice(2);
if (!want.length) { console.error('要重建哪几个职业的工位？'); process.exit(1); }
const { data } = await supabaseAdmin.from('skill_tasks').select('id, skill_id, title, brief, profile, jd_snapshot, sim');
const rows = ((data || []) as any[]).filter(t => want.includes(t.jd_snapshot?.career?.profession || ''));
console.log(`找到 ${rows.length} 个空间：${rows.map(r => `${r.profile?.name} · ${r.jd_snapshot.career.profession}`).join('、')}\n`);

await Promise.all(rows.map(async t => {
  const prof = t.jd_snapshot.career.profession, who = `${t.profile?.name} · ${prof}`;
  const old = t.sim?.steps?.find((s: any) => s.type === 'bench')?.bench?.name || '（无）';
  const t0 = Date.now();
  try {
    const r = await rebuildBench(t, undefined, HINTS[prof] || '');
    if (!r) throw new Error('新工位插不回故事线');
    await supabaseAdmin.from('skill_tasks').update({ sim: r.sim }).eq('id', t.id);
    if (t.skill_id && r.benchTrace) {
      const { data: sk } = await supabaseAdmin.from('skills').select('expert_trace').eq('id', t.skill_id).single();
      await supabaseAdmin.from('skills').update({ expert_trace: { ...(sk?.expert_trace || {}), bench: r.benchTrace } }).eq('id', t.skill_id);
    }
    console.log(`✅ ${who}（${Math.round((Date.now() - t0) / 1000)}s）\n   旧：${old}\n   新：${r.name}${r.note ? `\n   备注：${r.note}` : ''}`);
  } catch (e: any) {
    console.log(`❌ ${who}：${e.message}（旧工位原样保留）`);
  }
}));
console.log('\n══ 工位重建完成 ══');
