import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { analyzeChange, matchOccupations } from '@/lib/lab-ai-change';
import { withCost } from '@/lib/token-logger';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * 百业 · AI 会怎么改变我的工作（2026-11-01）。要登录（每次都调模型）。
 * POST { step: 'match', text } → 职业库里的候选职业；POST { step: 'analyze', occupation_id, text } → 任务拆解 + 暴露分 + 强项风险 + 接下来
 */
export async function POST(req: NextRequest) {
  const me = await getSessionUser(req).catch(() => null);
  if (!me) return NextResponse.json({ ok: false, error: '登录后才能用' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const text = String(b.text || '').trim().slice(0, 4000);
  try {
    if (b.step === 'match') {
      if (text.length < 2) return NextResponse.json({ ok: false, error: '写一下你的职位，或者贴一段 JD / 简历' }, { status: 400 });
      return NextResponse.json({ ok: true, ...(await withCost({ tool_name: 'lab', task_name: 'AI 改变 · 对职业', stage: 'use', actor: me.email }, () => matchOccupations(text))) });
    }
    if (b.step === 'analyze') {
      const id = Number(b.occupation_id); if (!id) return NextResponse.json({ ok: false, error: '先选一个职业' }, { status: 400 });
      return NextResponse.json({ ok: true, result: await withCost({ tool_name: 'lab', task_name: 'AI 改变 · 拆任务', stage: 'use', actor: me.email }, () => analyzeChange(id, text)) });
    }
    return NextResponse.json({ ok: false, error: '没有这一步' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 300) }, { status: 500 });
  }
}
