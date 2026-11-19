import { NextRequest, NextResponse } from 'next/server';
import { denyUnlessLabOwner } from '@/lib/lab-owner';
import { labError } from '@/lib/skill-lab-server';
import { startJob } from '@/lib/lab-jobs';
import { buildDay } from '@/lib/agents/lab-chapters';
import { parseDayPlan } from '@/lib/lab-spec';
import { supabaseAdmin as db } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

/** 排一天骨架（后台跑，返回任务编号）。11-19：plan = 人自己排的格子（每行「09:00｜标题｜要交代的事」）；depth = 'deep' | 'normal'，存进 jd_snapshot.depth，之后写每一章都按长段（起承转合）写 */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const denied = await denyUnlessLabOwner(req, id); if (denied) return denied;
    const b = await req.json().catch(() => ({}));
    const model = String(b.model || process.env.NEXT_PUBLIC_LAB_GEN_MODEL || 'gpt-5.6-luna');
    if (b.depth === 'deep' || b.depth === 'normal') {
      const { data: t } = await db.from('skill_tasks').select('jd_snapshot').eq('id', id).single();
      await db.from('skill_tasks').update({ jd_snapshot: { ...((t as any)?.jd_snapshot || {}), depth: b.depth } }).eq('id', id);
    }
    const plan = parseDayPlan(String(b.plan || '').slice(0, 3000));
    const job = await startJob(id, null, 'build_day', async progress => {
      const r = await buildDay(id, model, String(b.hint || '').slice(0, 500), progress, plan);
      return `新增 ${r.added} 格 · 角色表新增 ${r.cast} 项`;
    });
    return NextResponse.json({ ok: true, job });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
