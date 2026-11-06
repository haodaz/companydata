import { NextRequest, NextResponse } from 'next/server';
import { denyUnlessLabOwner } from '@/lib/lab-owner';
import { supabaseAdmin } from '@/lib/supabase';
import { labError } from '@/lib/skill-lab-server';
import { drawCastAsset } from '@/lib/lab-cast-server';
import { artAvailable } from '@/lib/lab-art';
import { familyOf } from '@/lib/career-family';
import type { CastMember } from '@/lib/lab-cast';
import { generateContent } from '@/lib/llm-client';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { specTextOf } from '@/lib/lab-spec';
import { logRevision } from '@/lib/lab-revise';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

type Ctx = { params: Promise<{ id: string; castId: string }> };

/** 给角色现画一张（按外形 / 陈设描述），画完立刻归库并换上；约 20–60 秒 */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id, castId } = await params;
    const denied = await denyUnlessLabOwner(req, id); if (denied) return denied;
    if (!artAvailable()) return NextResponse.json({ ok: false, error: '没有配置画图（DASHSCOPE_API_KEY）' }, { status: 400 });
    const [{ data: m, error }, { data: t }] = await Promise.all([
      supabaseAdmin.from('lab_cast').select('*').eq('id', castId).eq('task_id', id).single(),
      supabaseAdmin.from('skill_tasks').select('jd_snapshot').eq('id', id).single(),
    ]);
    if (error) throw error;
    if (m.is_self) return NextResponse.json({ ok: false, error: '数字职人本人的形象不在这里画' }, { status: 400 });
    const jd: any = (t as any)?.jd_snapshot || {};
    // 说一句怎么改（11-06）：先让 AI 按这句话 + 生成要求改外形 / 陈设描述，再照新描述画
    const b = await req.json().catch(() => ({}));
    const instruction = String(b.instruction || '').trim().slice(0, 300);
    let note = '';
    if (instruction) {
      const before = m.look || '';
      const r = await generateContent(`下面是职业体验空间里一个${m.kind === 'person' ? '人物（立绘）' : '地点（场景图）'}的外形 / 陈设描述，用来文生图。按修改要求改写它。
名字：${m.name}（${m.type_name || ''}）
现在的描述：${before || '（空）'}
${specTextOf(jd)}
修改要求：${instruction}
${m.kind === 'person' ? '人物只写外形：性别、年龄、发型、装束、手里拿着什么、神情；不要写背景。' : '地点只写陈设和光线，不要写人。'}≤ 120 字。
只返回 JSON：{ "look": "", "note": "<一句话说改了什么>" }`, 'claude-sonnet-5-5', { jsonMode: true });
      const p = parseJsonLoose(r.text) || {};
      const look = String(p.look || '').trim().slice(0, 400);
      if (look) { await supabaseAdmin.from('lab_cast').update({ look, updated_at: new Date().toISOString() }).eq('id', castId); (m as any).look = look; }
      note = String(p.note || '').slice(0, 80);
      await logRevision({ task_id: id, target: `cast:${castId}`, instruction, before: { look: before, asset_id: m.asset_id }, after: { look }, note, status: 'adopted' });
    }
    const a = await drawCastAsset(id, m as CastMember, familyOf(jd.career?.profession, jd.title));
    return NextResponse.json({ ok: true, asset: a, look: (m as any).look, note });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
