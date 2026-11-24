import { NextRequest, NextResponse } from 'next/server';
import { denyUnlessLabOwner } from '@/lib/lab-owner';
import { labError } from '@/lib/skill-lab-server';
import { startJob } from '@/lib/lab-jobs';
import { buildDay } from '@/lib/agents/lab-chapters';
import { parseDayPlan, isDepth, LAB_GEN_MODEL } from '@/lib/lab-spec';
import { supabaseAdmin as db } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

/** 排一天骨架（后台跑，返回任务编号）。11-19：plan = 人自己排的格子（每行「09:00｜标题｜要交代的事」）；slots = 这一天几格、depth = light | standard | deep，存进 jd_snapshot */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const denied = await denyUnlessLabOwner(req, id); if (denied) return denied;
    const b = await req.json().catch(() => ({}));
    const model = String(b.model || LAB_GEN_MODEL);
    // 格数 / 深度（11-19）：存进 jd_snapshot，之后排骨架、写每一章都按它；传 null / 'auto' = 回到按形态默认
    if ('slots' in b || 'depth' in b) {
      const { data: t } = await db.from('skill_tasks').select('jd_snapshot').eq('id', id).single();
      const jd: any = { ...((t as any)?.jd_snapshot || {}) };
      if ('slots' in b) { const n = Math.round(Number(b.slots)); if (n >= 2 && n <= 9) jd.slots = n; else delete jd.slots; }
      if ('depth' in b) { if (isDepth(b.depth)) jd.depth = b.depth; else delete jd.depth; }
      await db.from('skill_tasks').update({ jd_snapshot: jd }).eq('id', id);
    }
    const plan = parseDayPlan(String(b.plan || '').slice(0, 3000));
    const job = await startJob(id, null, 'build_day', async progress => {
      const r = await buildDay(id, model, String(b.hint || '').slice(0, 500), progress, plan);
      return `新增 ${r.added} 格 · 角色表新增 ${r.cast} 项${r.over ? `｜注意：这一天现在有 ${r.total} 格，比定的多 ${r.over} 格——已经写好内容的章不会自动删，要改成更少的段，请在左边章节列表里删掉多余的章（或新建一个空间）` : ''}`;
    });
    return NextResponse.json({ ok: true, job });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
