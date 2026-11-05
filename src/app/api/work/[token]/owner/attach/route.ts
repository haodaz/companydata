import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { handleAttach } from '@/lib/work/attach';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** 任务空间补传素材（11-05 潜历：出好任务后还想加文件）：凭管理密钥 ?k=，不用登录；处理同出任务时上传 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; const k = req.nextUrl.searchParams.get('k') || '';
  const { data: t } = await db.from('work_tasks').select('id').eq('share_token', token).eq('owner_key', k).maybeSingle();
  if (!k || !t) return NextResponse.json({ ok: false, error: '管理链接不对' }, { status: 404 });
  return handleAttach(req, `owner_${token}`);
}
