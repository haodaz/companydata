import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { mergeSameReqId } from '@/lib/job-store';

export const maxDuration = 300;

/**
 * 岗位一键去重（数据部门 10-17）：同一企业里「岗位编号 + 城市」相同、或「名称 + 城市」相同且一条只有列表信息的在招岗位并成一条。
 * body.companyId 指定企业；不给就跑所有有岗位的企业。dryRun 只数不改（暂不支持：合并逻辑直接改库，需要时先在单个企业上试）。
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    let ids: number[] = [];
    if (Number(body.companyId)) ids = [Number(body.companyId)];
    else {
      const { data } = await supabaseAdmin.from('company_relation_counts').select('company_id').gt('jobs_open', 1);
      ids = (data || []).map(d => d.company_id);
    }
    let merged = 0; const by: { companyId: number; merged: number }[] = [];
    for (const id of ids) { const n = await mergeSameReqId(id); if (n) { merged += n; by.push({ companyId: id, merged: n }); } }
    return NextResponse.json({ ok: true, companies: ids.length, merged, by: by.slice(0, 50) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
