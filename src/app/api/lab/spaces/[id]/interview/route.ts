import { NextRequest, NextResponse } from 'next/server';
import { withCost } from '@/lib/token-logger';
import { nextQuestion } from '@/lib/agents/skill-lab';
import { labError, loadSpace } from '@/lib/skill-lab-server';
import { labModel } from '@/lib/lab-guest';
import { deviationsFor } from '@/lib/lab-demo-review';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** 专家蒸馏 · 追问：围绕专家刚走完的那一遍追问；带上 traces 时先盯着偏差问（越过的红线、和老师傅经验不一致、AI 推断的规则、没达成的目标） */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { turns, walkthrough, model: asked, traces } = await req.json();
    const model = labModel(req, asked);
    const space = await loadSpace(id);
    const topic = `${space.jd_snapshot?.company || ''} ${space.jd_snapshot?.title || ''} —— ${space.title}`;
    // 偏差清单：老师傅示范的几段对照规则出处（标准 / 老师傅 / AI 推断），追问盯着这些问（专家数采第 2 步）
    const deviations = traces && typeof traces === 'object' ? await deviationsFor(id, traces).catch(() => []) : [];
    const result = await withCost({ space_id: id, stage: 'learn' }, () => nextQuestion(topic, Array.isArray(turns) ? turns : [], model || undefined, String(walkthrough || ''), deviations.map(d => d.question)));
    return NextResponse.json({ ok: true, ...result, deviations: deviations.map(d => ({ label: d.label, kind: d.kind, evidence: d.evidence })) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
