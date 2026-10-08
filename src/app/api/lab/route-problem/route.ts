import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { generateContent } from '@/lib/llm-client';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { logTokenUsage } from '@/lib/token-logger';
import { familyOf } from '@/lib/career-family';
import { labError } from '@/lib/skill-lab-server';
import { trackDemand } from '@/lib/flywheel/signals';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * 「我有个问题」：把一句话的问题分给最合适的 1–3 位数字职人。
 *
 * 「平行解决别人的问题」以前只能先猜对该进哪个空间。这里让模型看一眼全部在岗的人
 * （称呼、职业、领域、是否有真人专家校正过），挑出能接这个活的，每人一句为什么。
 * 只做分派，不在这里答题——答题还是进那位数字职人自己的空间，按他学到的做法来。
 */
export async function POST(req: NextRequest) {
  try {
    const { problem, model } = await req.json();
    const q = String(problem || '').trim().slice(0, 600);
    if (q.length < 4) return NextResponse.json({ ok: false, error: '把问题说具体一点' }, { status: 400 });
    trackDemand(req, { source: 'lab_problem', query: q });

    const { data } = await supabaseAdmin.from('skill_tasks')
      .select('id, profile, jd_snapshot, skill:skills(name, domain, source, expert_name, expert_location)');
    const people = (data || []).map((t: any) => {
      const sk = Array.isArray(t.skill) ? t.skill[0] : t.skill;
      const jd = t.jd_snapshot || {};
      const prof = jd.career?.profession || jd.title || sk?.name || '';
      return { id: t.id, name: t.profile?.name || '', role: t.profile?.role || '', avatar: t.profile?.avatar || '', prof, family: familyOf(prof, sk?.domain, jd.title, jd.company), skill: sk?.name || '', expert: sk && sk.source !== 'jd-draft' };
    }).filter(p => p.name);
    if (!people.length) return NextResponse.json({ ok: true, picks: [] });

    // 名单用短编号给模型，省 token 也省得它抄错 uuid
    const roster = people.map((p, i) => `${i + 1}. ${p.role}｜${p.prof}｜${p.family}｜擅长：${p.skill}${p.expert ? '｜有真人专家校正' : ''}`).join('\n');
    const r = await generateContent(`下面是在岗的数字职人名单，每人一行：编号. 称呼｜职业｜领域｜擅长。
${roster}

有人带着一个问题来：
「${q}」

从名单里挑最能接住这个问题的 1–3 位，按合适程度排序。只挑真的对口的，宁缺毋滥：
问题明显不属于任何一位的行当，就返回空数组。
每位给一句 why（25 字内，说他凭什么能帮上忙，用「他」指代）。
返回 JSON：{ "picks": [{ "n": 编号, "why": "" }] }`, model || 'gemini-3.8-flash', { jsonMode: true });
    await logTokenUsage({ tool_name: 'skill-lab', task_name: 'Route · Problem', institution: '', model_id: model || 'gemini-3.8-flash', usageMetadata: r.usageMetadata, success: true }).catch(() => {});

    const out = parseJsonLoose(r.text);
    const seen = new Set<string>();
    const picks = (Array.isArray(out?.picks) ? out.picks : [])
      .map((x: any) => ({ p: people[Number(x?.n) - 1], why: String(x?.why || '').slice(0, 60) }))
      .filter((x: any) => x.p && !seen.has(x.p.id) && seen.add(x.p.id))
      .slice(0, 3)
      .map((x: any) => ({ id: x.p.id, name: x.p.name, role: x.p.role, avatar: x.p.avatar, profession: x.p.prof, expert: x.p.expert, why: x.why }));
    return NextResponse.json({ ok: true, picks });
  } catch (e: any) {
    console.error('[Lab/route-problem]', e);
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
