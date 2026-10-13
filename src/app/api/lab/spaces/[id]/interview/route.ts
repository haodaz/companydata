import { NextRequest, NextResponse } from 'next/server';
import { withCost } from '@/lib/token-logger';
import { nextQuestion } from '@/lib/agents/skill-lab';
import { labError, loadSpace } from '@/lib/skill-lab-server';
import { labModel } from '@/lib/lab-guest';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** 专家蒸馏 · 追问：围绕专家刚走完的那一遍，问「为什么这么做」 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { turns, walkthrough, model: asked } = await req.json();
    const model = labModel(req, asked);
    const space = await loadSpace(id);
    const topic = `${space.jd_snapshot?.company || ''} ${space.jd_snapshot?.title || ''} —— ${space.title}`;
    const result = await withCost({ space_id: id, stage: 'learn' }, () => nextQuestion(topic, Array.isArray(turns) ? turns : [], model || undefined, String(walkthrough || '')));
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
