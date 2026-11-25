import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { untilOf } from '@/lib/work/deadline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 名字打码：留第一个字（英文留首字母），其余换成 *；不给联系方式 */
const mask = (n: string) => { const s = String(n || '').trim(); if (!s) return '匿名'; const c = [...s]; return c[0] + '*'.repeat(Math.min(3, Math.max(1, c.length - 1))); };

/** 公开排行榜（11-24，任务开了 public_board 才有）：按同题对比的顺序，只给名次、打码的名字、提交时间 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: t } = await db.from('work_tasks').select('id, status, company_name, task').eq('share_token', token).maybeSingle();
  if (!t || t.status !== 'published' || !t.task?.public_board) return NextResponse.json({ ok: false, error: '这个任务没有公开排行榜' }, { status: 404 });
  const order: string[] = Array.isArray(t.task?.peer_order) ? t.task.peer_order : [];
  const { data: ss } = order.length ? await db.from('work_sessions').select('id, participant, submitted_at').in('id', order) : { data: [] as any[] };
  const by = new Map((ss || []).filter((s: any) => s.submitted_at && !s.participant?.preview).map((s: any) => [s.id, s]));
  const rows = order.filter(id => by.has(id)).map((id, i) => ({ rank: i + 1, name: mask(by.get(id)!.participant?.name), submitted_at: by.get(id)!.submitted_at }));
  const u = untilOf(t.task);
  return NextResponse.json({ ok: true, title: t.task?.title || '', company: t.company_name || '', lang: t.task?.lang || 'zh', open_until: u ? new Date(u).toISOString() : null, rows });
}
