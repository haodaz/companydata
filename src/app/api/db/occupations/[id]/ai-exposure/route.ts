import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { occLayer, aiExposureTable } from '@/lib/lab-ai-change';
import { withCost } from '@/lib/token-logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

/** 重算这个职业的 AI 替代性（2026-11-02）：任务补全 / 改过之后，或觉得分得不对时，后台手动点；不管缓存重新分一遍、覆盖旧的 */
export async function POST(_req: Request, ctx: Ctx) {
  try {
    const id = parseInt((await ctx.params).id);
    const { data: o } = await supabaseAdmin.from('occupations').select('*').eq('id', id).eq('if_delete', false).single();
    if (!o) return NextResponse.json({ success: false, error: '职业不存在' }, { status: 404 });
    await withCost({ tool_name: 'lab', task_name: 'AI 替代性 · 后台重算', stage: 'rebuild' } as any, () => occLayer(o, { count: false, force: true }));
    const table = await aiExposureTable();
    const ai_exposure = table ? (await supabaseAdmin.from(table).select('*').eq('occupation_id', id).maybeSingle()).data : null;
    return NextResponse.json({ success: true, ai_exposure });
  } catch (e: any) {
    console.error('[Occupation] ai-exposure', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
