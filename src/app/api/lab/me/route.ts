import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { band, certNo } from '@/lib/lab-cert';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 我的历史 + 证书库：按访客编号找回自己的真人作答，带上空间和章节，算每个空间这一天集齐了几段 */
export async function GET(req: NextRequest) {
  try {
    const v = (req.nextUrl.searchParams.get('v') || '').split(',').filter(x => /^[uv]:/.test(x)).slice(0, 4);
    if (!v.length) return NextResponse.json({ ok: true, history: [], spaces: [] });
    const { data: subs, error } = await supabaseAdmin.from('skill_submissions').select('id, task_id, chapter_id, candidate_name, score, match, submitted_at')
      .in('visitor_id', v).eq('candidate_type', 'human').order('submitted_at', { ascending: false }).limit(300);
    if (error) {
      if (/visitor_id/.test(error.message)) return NextResponse.json({ ok: true, history: [], spaces: [], needMigration: true });
      throw error;
    }
    const taskIds = [...new Set((subs || []).map(s => s.task_id))];
    const [{ data: tasks }, { data: chs }] = taskIds.length ? await Promise.all([
      supabaseAdmin.from('skill_tasks').select('id, title, profile, jd_snapshot').in('id', taskIds),
      supabaseAdmin.from('lab_chapters').select('id, task_id, seq, slot, title, kind, status').in('task_id', taskIds).eq('status', 'published'),
    ]) : [{ data: [] as any[] }, { data: [] as any[] }];
    const order = (a: any, b: any) => {
      const m = (s: string) => { const x = String(s || '').match(/(\d{1,2})[:：](\d{2})/); return x ? +x[1] * 60 + +x[2] : null; };
      const x = m(a.slot), y = m(b.slot);
      return x != null && y != null && x !== y ? x - y : a.seq - b.seq;
    };
    const spaces = (tasks || []).map((t: any) => {
      const chapters = (chs || []).filter((c: any) => c.task_id === t.id).sort(order);
      const mine = (subs || []).filter(s => s.task_id === t.id);
      const list = (chapters.length ? chapters : [{ id: null, seq: 1, slot: '', title: t.title, kind: 'daily' }]).map((c: any, i: number) => {
        // 每段取我最好的一次；第 1 段的老作答没记章节
        const tries = mine.filter(s => (c.id && s.chapter_id === c.id) || (i === 0 && !s.chapter_id));
        const best = tries.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
        return { id: c.id, n: i + 1, slot: c.slot, title: c.title, kind: c.kind, tries: tries.length, best: best ? { id: best.id, score: best.score, band: band(best.score), no: certNo(best.id), date: best.submitted_at } : null };
      });
      const jd = t.jd_snapshot || {};
      return {
        id: t.id, name: t.profile?.name || '', role: t.profile?.role || jd.career?.profession || jd.title, avatar: t.profile?.avatar || '',
        chapters: list, done: list.filter(c => c.best).length, total: list.length,
        last: mine[0]?.submitted_at,
      };
    }).sort((a, b) => (b.last || '').localeCompare(a.last || ''));
    const history = (subs || []).map(s => {
      const sp = spaces.find(x => x.id === s.task_id);
      const ch = sp?.chapters.find(c => c.id === s.chapter_id) || sp?.chapters[0];
      return { id: s.id, date: s.submitted_at, name: s.candidate_name, score: s.score, band: band(s.score), match: s.match, space: sp ? { id: sp.id, role: sp.role, name: sp.name, avatar: sp.avatar } : null, chapter: ch ? { id: ch.id, n: ch.n, total: sp!.total, slot: ch.slot, title: ch.title } : null };
    });
    return NextResponse.json({ ok: true, history, spaces });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
