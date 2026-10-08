import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { discoverRecruitEntry } from '@/lib/agents/recruit-entry';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * 画像流水线「招聘入口」工序：找校招 / 社招 / 实习入口，存进信息源库，返回要回填的两个字段。
 * body: { companyId, name, official_website, model }
 */
export async function POST(req: Request) {
  try {
    const { companyId, name, official_website, model } = await req.json();
    if (!name) return NextResponse.json({ success: false, error: 'Missing name' }, { status: 400 });
    const r = await discoverRecruitEntry(name, official_website, model);
    // 存信息源：校招 / 实习记为 campus，社招和总入口记为 careers
    const rows = [
      r.campus && { url: r.campus, type: 'campus', subtype: 'portal', title: '校园招聘' },
      r.intern && { url: r.intern, type: 'campus', subtype: 'intern', title: '实习生招聘' },
      r.social && { url: r.social, type: 'careers', subtype: 'portal', title: '社会招聘' },
      r.careers && r.careers !== r.social && { url: r.careers, type: 'careers', subtype: 'portal', title: '招聘总入口' },
    ].filter(Boolean) as { url: string; type: string; subtype: string; title: string }[];
    if (rows.length) {
      const via = r.via === 'homepage' ? '从官网导航找到' : '联网搜索找到';
      await supabaseAdmin.from('url_sources').upsert(rows.map(x => ({
        company: name, company_id: companyId || null, unit: null, title: x.title, url: x.url, type: x.type, subtype: x.subtype,
        reasoning: `画像流水线「招聘入口」工序${via}的「${x.title}」链接。`,
      })), { onConflict: 'company,url' });
    }
    return NextResponse.json({
      success: true, via: r.via,
      fields: { campus_url: r.campus || r.intern || null, careers_url: r.careers || r.social || null },
      found: { campus: r.campus, intern: r.intern, social: r.social, careers: r.careers },
      links: r.links.slice(0, 20),
    });
  } catch (e: any) {
    console.error('[recruit-entry]', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
