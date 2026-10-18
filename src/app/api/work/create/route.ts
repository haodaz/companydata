import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { supabaseAdmin as db } from '@/lib/supabase';
import { gatherContext, generateTask, runBaseline, WORK_MODEL } from '@/lib/work/generator';
import { withCost } from '@/lib/token-logger';

export const runtime = 'nodejs';
export const maxDuration = 300;

const DAILY_LIMIT = Number(process.env.WORK_PUBLIC_DAILY_LIMIT || 3);

/**
 * C 端自助出题（不用登录）：{ company, role, env?, focus?, name, contact }
 * → 出题 + AI 基线 → 返回参与链接 token 和管理链接 owner_key。每个 IP 每天最多 DAILY_LIMIT 道（一道约 $0.5）。
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const company = String(body.company || '').trim(), role = String(body.role || '').trim();
    const name = String(body.name || '').trim().slice(0, 40), contact = String(body.contact || '').trim().slice(0, 80);
    if (!company || !role) return NextResponse.json({ ok: false, error: '企业和岗位都要填' }, { status: 400 });
    if (!name || !contact) return NextResponse.json({ ok: false, error: '留个称呼和联系方式，管理链接只发给你' }, { status: 400 });
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'local';
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count } = await db.from('work_tasks').select('id', { count: 'exact', head: true }).gte('created_at', since).contains('owner', { ip });
    if ((count || 0) >= DAILY_LIMIT) return NextResponse.json({ ok: false, error: `今天已经出了 ${DAILY_LIMIT} 道，明天再来；要批量用请联系我们` }, { status: 429 });

    const ctx = await gatherContext(body.company_id ? String(body.company_id) : company, role);
    const actor = `public:${contact}`;
    const { task, model } = await withCost({ tool_name: 'work', task_name: 'Generate · 出题', stage: 'create', actor }, () =>
      generateTask(ctx, role, { model: body.model || WORK_MODEL, focus: String(body.focus || '').slice(0, 600) || undefined, env: ['doc', 'code', 'sheet', 'design'].includes(body.env) ? body.env : undefined }));
    const share_token = randomBytes(8).toString('base64url'), owner_key = randomBytes(12).toString('base64url');
    const row = { share_token, owner_key, owner: { name, contact, ip }, status: 'published', company_id: ctx.company?.id ?? null, company_name: ctx.company?.name || company, role, context: ctx, problem: task.problem, task: { ...task.task, env: task.env }, materials: task.materials, rubric: task.rubric, model, created_by: actor };
    const { data, error } = await db.from('work_tasks').insert(row).select('id').single();
    if (error) throw new Error(error.message);
    // AI 基线：跑不成也不挡发题（管理页可重跑）
    let baseline: any = null;
    try {
      baseline = await withCost({ tool_name: 'work', task_name: 'Baseline · AI 先做一遍', stage: 'create', actor }, () => runBaseline(task, { institution: ctx.company?.name || company }));
      await db.from('work_tasks').update({ baseline }).eq('id', data.id);
    } catch (e) { console.warn('[work] 自助出题基线失败：', String((e as any)?.message).slice(0, 120)); }
    return NextResponse.json({ ok: true, share_token, owner_key, title: task.task.title, env: task.env.type, baseline: baseline ? baseline.result.total : null, notes: ctx.notes });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
