import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';

/**
 * 同一道任务的 AI 驾驭量表对比（11-16 潜历：报告里写同任务的平均分和最高分、你排第几）。
 * 只给汇总数（人数、平均、最高、名次、各维度平均 / 最高），不给任何别人的作答。预览作答不算。
 */
export async function GET(req: NextRequest) {
  const sid = req.nextUrl.searchParams.get('sid') || '';
  if (!/^[0-9a-f-]{36}$/i.test(sid)) return NextResponse.json({ ok: false, error: 'bad sid' }, { status: 400 });
  const { data: me } = await db.from('work_sessions').select('task_id').eq('id', sid).maybeSingle();
  if (!me) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
  const { data: ss } = await db.from('work_sessions').select('id, participant, overall:report->fluency->overall, dims:report->fluency->dims').eq('task_id', me.task_id).not('submitted_at', 'is', null);
  const rows = ((ss || []) as any[]).filter(s => !s.participant?.preview && typeof s.overall === 'number');
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const avgMax = (vs: number[]) => (vs.length ? { avg: r2(vs.reduce((a, b) => a + b, 0) / vs.length), max: Math.max(...vs) } : { avg: null, max: null });
  const tot = rows.map(s => s.overall as number);
  const mine = rows.find(s => s.id === sid)?.overall as number | undefined;
  const dims: Record<string, { avg: number | null; max: number | null }> = {};
  for (const num of ['01', '02', '03', '04', '05', '06', '07']) dims[num] = avgMax(rows.map(s => (s.dims || []).find((d: any) => d.num === num)?.score).filter((v: any): v is number => typeof v === 'number'));
  return NextResponse.json({ ok: true, peers: { n: rows.length, ...avgMax(tot), rank: mine == null ? null : 1 + tot.filter(v => v > mine).length, dims } });
}
