import { regionName } from '@/lib/region-codes';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 虚拟工厂入口页的「库里现在有多少」：都是正式库的实数（软删的不算） */
export async function GET() {
  const cnt = async (t: string, f?: (q: any) => any) => {
    let q: any = supabaseAdmin.from(t).select('id', { count: 'exact', head: true });
    if (f) q = f(q);
    const { count } = await q;
    return count || 0;
  };
  try {
    const [companies, jobs, occupations, tasks, items, standards, competitions] = await Promise.all([
      cnt('companies', q => q.not('if_delete', 'is', true)), cnt('jobs', q => q.not('if_delete', 'is', true)), cnt('occupations', q => q.eq('if_delete', false)),
      cnt('typical_tasks', q => q.eq('if_delete', false)), cnt('work_items', q => q.eq('if_delete', false)), cnt('industry_standards'), cnt('competitions'),
    ].map(p => p.catch(() => 0)));
    // 产线刚做完的几件事（都是库里的真实记录）：入口页 banner 用
    const one = async (q: any) => { try { const { data } = await q; return data?.[0] || null; } catch { return null; } };
    const [occ, std, co, job, comp] = await Promise.all([
      one(supabaseAdmin.from('occupations').select('name, career_map, career_map_at').eq('if_delete', false).not('career_map_at', 'is', null).order('career_map_at', { ascending: false }).limit(1)),
      one(supabaseAdmin.from('industry_standards').select('code, title, status, created_at').order('created_at', { ascending: false }).limit(1)),
      one(supabaseAdmin.from('companies').select('name, industry, created_at').not('if_delete', 'is', true).order('created_at', { ascending: false }).limit(1)),
      one(supabaseAdmin.from('jobs').select('name, institute_or_company_name, city, created_at').not('if_delete', 'is', true).order('created_at', { ascending: false }).limit(1)),
      one(supabaseAdmin.from('competitions').select('name, created_at').order('created_at', { ascending: false }).limit(1)),
    ]);
    const recent = [
      occ && { agent: 'occupation', verb: '画好发展图谱', what: occ.name, meta: `${occ.career_map?.skills?.length || 0} 个技能 · ${occ.career_map?.ladder?.length || 0} 级阶梯`, at: occ.career_map_at },
      std && { agent: 'standard', verb: '核对入库', what: [std.code, std.title].filter(Boolean).join(' '), meta: std.status === 'current' ? '现行' : std.status === 'abolished' ? '已废止' : '标准规程', at: std.created_at },
      job && { agent: 'structurer', verb: '提炼岗位', what: job.name, meta: [job.institute_or_company_name, regionName('city', job.city)].filter(Boolean).join(' · '), at: job.created_at },
      co && { agent: 'profiler', verb: '建档企业', what: co.name, meta: co.industry || '企业画像', at: co.created_at },
      comp && { agent: 'radar', verb: '找到比赛', what: comp.name, meta: '赛事库', at: comp.created_at },
    ].filter(Boolean);
    return NextResponse.json({ ok: true, counts: { companies, jobs, occupations, tasks, items, standards, competitions }, recent });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
