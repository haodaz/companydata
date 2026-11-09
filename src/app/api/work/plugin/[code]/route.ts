import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { sessionByCode, normCode } from '@/lib/work/plugin';

export const runtime = 'nodejs';

/** 真活插件：凭真活码查这次作答（插件侧边栏、作答页都轮询它）——题目摘要、截止时间、记了多少、交付说明 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const x = await sessionByCode(code);
  if (!x) return NextResponse.json({ ok: false, error: '真活码不对，回到答题页再复制一次' }, { status: 404 });
  const { s, t } = x;
  const minutes = Number(t.task?.time_minutes) || 60;
  const ev = (s.events || []) as any[];
  const plugin = ev.filter(e => e.src === 'plugin');
  return NextResponse.json({
    ok: true, code: normCode(code), share_token: t.share_token, sid: s.id, name: s.participant?.name || '',
    task: { title: t.task?.title, company: t.company_name, role: t.role, time_minutes: minutes, brief: String(t.task?.brief || '').slice(0, 600), deliverables: t.task?.deliverables || [], materials: (t.materials || []).map((m: any) => ({ id: m.id, title: m.title })) },
    started_at: s.started_at, deadline: t.task?.soft_limit ? null : new Date(new Date(s.started_at).getTime() + minutes * 60_000).toISOString(),
    submitted: !!s.submitted_at, auditing: !!s.report?.auditing, deliverable: s.deliverable || '', next_step: s.participant?.next_step || '',
    recorded: { events: plugin.length, pages: plugin.filter(e => e.type === 'visit').length, ai: (s.ai_chat || []).filter((c: any) => c.src === 'plugin').length, last_t: plugin.length ? plugin[plugin.length - 1].t : null },
  });
}

/** 存交付说明（侧边栏和作答页都能写；交卷后不再收）；next_step：最后一问（选填）「如果再给一天，先改哪里」，存在 participant 里，交卷时转成事件 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const x = await sessionByCode(code);
  if (!x) return NextResponse.json({ ok: false, error: '真活码不对' }, { status: 404 });
  if (x.s.submitted_at) return NextResponse.json({ ok: false, error: '已经交卷了' }, { status: 409 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.deliverable !== 'string' && typeof body.next_step !== 'string') return NextResponse.json({ ok: false, error: '没有内容' }, { status: 400 });
  const patch: Record<string, any> = {};
  if (typeof body.deliverable === 'string') patch.deliverable = body.deliverable.slice(0, 60000);
  if (typeof body.next_step === 'string') patch.participant = { ...(x.s.participant || {}), next_step: body.next_step.slice(0, 1000) };
  const { error } = await db.from('work_sessions').update(patch).eq('id', x.s.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** 插件整屏截图（11-05，潜历：插件只能记浏览器，PS / 本地 AI 记不到）：侧边栏每 10 秒传一张 JPEG，存 lab-media/work/<sid>/shots/<秒>.jpg，
 *  和开放模式同一个位置；交卷时挑 30 张看图，进答题历程和报告 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const x = await sessionByCode(code);
  if (!x) return NextResponse.json({ ok: false, error: '真活码不对' }, { status: 404 });
  if (x.s.submitted_at) return NextResponse.json({ ok: false, error: '已经交卷了' }, { status: 409 });
  const file = (await req.formData().catch(() => null))?.get('file') as File | null;
  if (!file || file.size > 3 * 1024 * 1024) return NextResponse.json({ ok: false, error: '截图不对' }, { status: 400 });
  const t = Math.max(0, Math.round((Date.now() - new Date(x.s.started_at).getTime()) / 1000));
  const { error } = await db.storage.from('lab-media').upload(`work/${x.s.id}/shots/${String(t).padStart(6, '0')}.jpg`, Buffer.from(await file.arrayBuffer()), { contentType: 'image/jpeg', upsert: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, t });
}
