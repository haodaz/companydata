import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { getSessionUser } from '@/lib/session';
import { denyUnlessLabOwner } from '@/lib/lab-owner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 百业工厂 · 管理台数据（2026-11-06，照真活的管理端：生成 / 管理 / 回收 / 分析，不以预览为主轴）。
 * 普通用户只看自己生成的空间，管理员看全部（和工厂原来的口径一样）。
 * GET ?view=spaces            每个空间一行：状态、章节（已发布 / 总数）、作答人次、平均分、最近作答
 * GET ?view=plays[&space=]    作答记录（回收）：谁、哪个空间哪一章、分数、时间；带 space 只看这一个
 * GET ?view=chapters&space=   这个空间每一章的进入 / 平均分 / 人工改分（分析）
 * PATCH { id, listing }       上架 / 下架 / 退回草稿（迁移 065）
 */
type Me = { email: string; role: string };
async function mySpaceIds(me: Me): Promise<string[] | null> {   // null = 管理员看全部
  if (me.role === 'admin') return null;
  const { data } = await db.from('skill_tasks').select('id').eq('created_by', me.email).limit(1000);
  return (data || []).map((x: any) => x.id);
}
const n1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);

export async function GET(req: NextRequest) {
  const me = await getSessionUser(req);
  if (!me) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const view = sp.get('view') || 'spaces';
  try {
    if (view === 'spaces') {
      let q = db.from('skill_tasks').select('id, title, created_by, created_at, profile, jd_snapshot, listing, listed_at').order('created_at', { ascending: false }).limit(1000);
      if (me.role !== 'admin') q = q.eq('created_by', me.email);
      let { data: spaces, error } = await q;
      let migrated = true;
      if (error && /listing/.test(error.message)) {   // 迁移 065 没跑
        migrated = false;
        let q2 = db.from('skill_tasks').select('id, title, created_by, created_at, profile, jd_snapshot').order('created_at', { ascending: false }).limit(1000);
        if (me.role !== 'admin') q2 = q2.eq('created_by', me.email);
        ({ data: spaces, error } = await q2 as any);
      }
      if (error) throw error;
      const ids = (spaces || []).map((s: any) => s.id);
      const [chs, subs] = ids.length ? await Promise.all([
        db.from('lab_chapters').select('task_id, status').in('task_id', ids),
        db.from('skill_submissions').select('task_id, candidate_type, score, human_score, submitted_at, is_demo').in('task_id', ids),
      ]) : [{ data: [] }, { data: [] }] as any;
      const ch: Record<string, { total: number; published: number }> = {};
      for (const c of chs.data || []) { const x = (ch[c.task_id] ||= { total: 0, published: 0 }); x.total++; if (c.status === 'published') x.published++; }
      const st: Record<string, { plays: number; sum: number; scored: number; last: string | null }> = {};
      for (const s of subs.data || []) {
        if (s.candidate_type !== 'human' || s.is_demo) continue;   // 只算真人作答（AI / 专家示范不算）
        const x = (st[s.task_id] ||= { plays: 0, sum: 0, scored: 0, last: null });
        x.plays++; const sc = s.human_score ?? s.score; if (sc != null) { x.sum += Number(sc); x.scored++; }
        if (!x.last || s.submitted_at > x.last) x.last = s.submitted_at;
      }
      const rows = (spaces || []).map((s: any) => {
        const jd = s.jd_snapshot || {}, p = s.profile || {}, c = ch[s.id] || { total: 0, published: 0 }, x = st[s.id];
        return {
          id: s.id, title: s.title, name: p.name || null, role: p.role || jd.career?.profession || jd.title || '', avatar: p.avatar || null,
          kind: jd.kind || (jd.company ? 'jd' : 'career'), company: jd.company || null, anchor: jd.anchor || null, preset: jd.spec?.preset || null,
          listing: migrated ? (s.listing || 'listed') : (c.published ? 'listed' : 'draft'), listed_at: s.listed_at || null,
          chapters: c, plays: x?.plays || 0, avg: x?.scored ? n1(x.sum / x.scored) : null, last_play: x?.last || null,
          created_by: s.created_by, created_at: s.created_at,
        };
      });
      return NextResponse.json({ ok: true, migrated, role: me.role, spaces: rows });
    }

    if (view === 'plays') {
      const space = sp.get('space');
      if (space) { const denied = await denyUnlessLabOwner(req, space); if (denied) return denied; }
      const ids = space ? [space] : await mySpaceIds(me);
      if (ids && !ids.length) return NextResponse.json({ ok: true, plays: [] });
      let q = db.from('skill_submissions').select('id, task_id, chapter_id, candidate_name, candidate_type, candidate_note, score, human_score, match, submitted_at, is_demo').order('submitted_at', { ascending: false }).limit(400);
      if (ids) q = q.in('task_id', ids);
      if (sp.get('all') !== '1') q = q.eq('candidate_type', 'human');
      const { data, error } = await q;
      if (error) throw error;
      const tids = [...new Set((data || []).map((x: any) => x.task_id))], cids = [...new Set((data || []).map((x: any) => x.chapter_id).filter(Boolean))];
      const [ts, cs] = await Promise.all([
        tids.length ? db.from('skill_tasks').select('id, title, profile').in('id', tids) : Promise.resolve({ data: [] } as any),
        cids.length ? db.from('lab_chapters').select('id, title, slot').in('id', cids) : Promise.resolve({ data: [] } as any),
      ]);
      const tm = Object.fromEntries((ts.data || []).map((t: any) => [t.id, t])), cm = Object.fromEntries((cs.data || []).map((c: any) => [c.id, c]));
      return NextResponse.json({ ok: true, plays: (data || []).map((x: any) => ({
        id: x.id, space_id: x.task_id, space: tm[x.task_id]?.profile?.name ? `${tm[x.task_id].profile.name} · ${tm[x.task_id].profile.role || ''}` : tm[x.task_id]?.title || '',
        chapter: cm[x.chapter_id] ? `${cm[x.chapter_id].slot || ''} ${cm[x.chapter_id].title}`.trim() : null, chapter_id: x.chapter_id,
        who: x.candidate_name, type: x.candidate_type, note: x.candidate_note, score: x.human_score ?? x.score, ai_score: x.score, human_score: x.human_score, match: x.match, at: x.submitted_at, demo: !!x.is_demo,
      })) });
    }

    if (view === 'chapters') {
      const space = sp.get('space') || '';
      const denied = await denyUnlessLabOwner(req, space); if (denied) return denied;
      const [chs, subs] = await Promise.all([
        db.from('lab_chapters').select('id, seq, slot, title, kind, status, sim').eq('task_id', space),
        db.from('skill_submissions').select('chapter_id, candidate_type, score, human_score, match, is_demo').eq('task_id', space),
      ]);
      const by: Record<string, number[]> = {}, cnt: Record<string, number> = {};
      for (const s of subs.data || []) {
        if (s.candidate_type !== 'human' || s.is_demo) continue;
        const k = s.chapter_id || '_'; cnt[k] = (cnt[k] || 0) + 1;
        const sc = s.human_score ?? s.score; if (sc != null) (by[k] ||= []).push(Number(sc));
      }
      const rows = (chs.data || []).map((c: any) => {
        const sc = by[c.id] || [];
        return { id: c.id, seq: c.seq, slot: c.slot, title: c.title, kind: c.kind, status: c.status, steps: (c.sim?.steps || []).length, bench: (c.sim?.steps || []).some((s: any) => s.type === 'bench'),
          plays: cnt[c.id] || 0, avg: sc.length ? n1(sc.reduce((a, b) => a + b, 0) / sc.length) : null, pass: sc.length ? Math.round(sc.filter(v => v >= 60).length / sc.length * 100) : null };
      });
      return NextResponse.json({ ok: true, chapters: rows, unassigned: cnt._ || 0 });
    }
    return NextResponse.json({ ok: false, error: 'view?' }, { status: 400 });
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}

export async function PATCH(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const id = String(b.id || '');
  const denied = await denyUnlessLabOwner(req, id); if (denied) return denied;
  if (!['draft', 'listed', 'unlisted'].includes(b.listing)) return NextResponse.json({ ok: false, error: 'listing 只能是 draft / listed / unlisted' }, { status: 400 });
  if (b.listing === 'listed') {
    const { count } = await db.from('lab_chapters').select('id', { count: 'exact', head: true }).eq('task_id', id).eq('status', 'published');
    if (!count) return NextResponse.json({ ok: false, error: '还没有一章是「已发布」：先在「一天」里把至少一章发布，再上架' }, { status: 400 });
  }
  const { error } = await db.from('skill_tasks').update({ listing: b.listing, ...(b.listing === 'listed' ? { listed_at: new Date().toISOString() } : {}) }).eq('id', id);
  if (error) return NextResponse.json({ ok: false, error: /listing/.test(error.message) ? '上架状态还没开通（迁移 065 待跑）' : error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
