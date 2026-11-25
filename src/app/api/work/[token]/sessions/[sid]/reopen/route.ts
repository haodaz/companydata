import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { extendSession } from '@/lib/work/extend';
import { errL } from '@/lib/work/errors-en';

export const runtime = 'nodejs';

/** 候选人自己重新打开、改了再提交（11-24，像 Kaggle 可以多次提交）：任务开了 resubmit 才行；凭个人作答链接（作答 id） */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string; sid: string }> }) {
  const { token, sid } = await params;
  const { data: t } = await db.from('work_tasks').select('id, status, task').eq('share_token', token).maybeSingle();
  if (!t || t.status !== 'published') return NextResponse.json({ ok: false, error: errL(t, '这个链接不可用') }, { status: 404 });
  const r = await extendSession(t, sid, Number(t.task?.time_minutes) || 60, { by: 'self' });
  if (!r.ok) return NextResponse.json({ ok: false, error: errL(t, r.error) }, { status: 400 });
  return NextResponse.json(r);
}
