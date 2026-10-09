import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { labError } from '@/lib/skill-lab-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** 这个空间最近的生成任务（工作室轮询进度用） */
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const { data, error } = await supabaseAdmin.from('lab_jobs').select('*').eq('task_id', id).order('created_at', { ascending: false }).limit(20);
    if (error) throw error;
    // 超过 15 分钟没动静的「进行中」当作已中断（服务重启 / 超时）
    const jobs = (data || []).map((j: any) => j.status === 'running' && Date.now() - new Date(j.updated_at).getTime() > 15 * 60_000 ? { ...j, status: 'failed', error: '超时或服务重启，已中断' } : j);
    return NextResponse.json({ ok: true, jobs });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
