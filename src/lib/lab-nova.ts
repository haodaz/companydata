import { supabaseAdmin } from '@/lib/supabase';

/**
 * 数字职人的编号与称呼。
 *
 * 编号是「NOVA-两位数」：01–20 留给手写的预置示范，AI 生成的从 21 起，先补空号。
 * 以前要靠 scripts/lab-assign-nova.mts 事后补，现场生成出来的人就没有编号——
 * 首页写着「他有编号」，当场演示却对不上。现在建好空间就分。
 */

/** 没有 role 的，从职业 / 岗位名里挑一个像称呼的词 */
export function roleFrom(s: string): string {
  // 只取第一个词（早期试的职业名里有「外科医生，动手术，腹腔手术」这种）
  const t = String(s || '').split(/[,，、\/]/)[0].replace(/（.*?）|\(.*?\)/g, '').trim();
  const m = t.match(/[一-龥]{1,4}(师傅|医师|工程师|护理师|设计师|分析师|治疗师|技师|教练|顾问|导游|律师|师|员)/);
  const r = (m ? m[0] : t) || '从业者';
  return r.length > 7 ? r.slice(-5) : r;
}

const novaNo = (name: unknown) => { const m = String(name || '').match(/^NOVA-(\d+)$/); return m ? Number(m[1]) : null; };

/** 给一个空间分编号（已有就原样返回）。两个空间同时建好撞了号，后写的那个让一位重来 */
export async function assignNova(id: string): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data } = await supabaseAdmin.from('skill_tasks').select('id, profile, jd_snapshot');
    const rows = (data || []) as any[];
    const me = rows.find(r => r.id === id);
    if (!me) return null;
    if (me.profile?.name) return me.profile.name;

    const used = new Set(rows.map(r => novaNo(r.profile?.name)).filter((n): n is number => n !== null));
    let n = 21;
    while (used.has(n)) n++;
    const name = `NOVA-${String(n).padStart(2, '0')}`;
    const prof = me.jd_snapshot?.career?.profession || me.jd_snapshot?.title || '';
    const role = me.profile?.role || roleFrom(prof);
    await supabaseAdmin.from('skill_tasks').update({ profile: { ...(me.profile || {}), name, role } }).eq('id', id);

    // 写完再看一眼：同号的不止我一个，且我不是最早建的那个，就清掉重分
    const { data: same } = await supabaseAdmin.from('skill_tasks').select('id, created_at').eq('profile->>name', name).order('created_at', { ascending: true });
    if (!same || same.length <= 1 || same[0].id === id) return name;
    await supabaseAdmin.from('skill_tasks').update({ profile: { ...(me.profile || {}), role } }).eq('id', id);
  }
  return null;
}
