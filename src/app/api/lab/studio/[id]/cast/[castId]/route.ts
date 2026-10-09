import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { labError } from '@/lib/skill-lab-server';
import { stepsUsing, type CastMember } from '@/lib/lab-cast';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; castId: string }> };

/** 改角色：名字、类型、说明、外形、换素材。人物改名时各章台词里的称呼一起改（步骤是按名字指向人物的） */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id, castId } = await params;
    const b = await req.json().catch(() => ({}));
    const { data: cur, error: e0 } = await supabaseAdmin.from('lab_cast').select('*').eq('id', castId).eq('task_id', id).single();
    if (e0) throw e0;
    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const k of ['type_name', 'note', 'look'] as const) if (k in b) patch[k] = String(b[k] ?? '').slice(0, 600);
    if ('asset_id' in b) patch.asset_id = b.asset_id || null;
    const name = 'name' in b ? String(b.name || '').trim().slice(0, 40) : cur.name;
    if (!name) return NextResponse.json({ ok: false, error: '名字不能空' }, { status: 400 });
    if (name !== cur.name) {
      const { data: dup } = await supabaseAdmin.from('lab_cast').select('id').eq('task_id', id).eq('kind', cur.kind).eq('name', name);
      if (dup?.length) return NextResponse.json({ ok: false, error: `角色表里已经有「${name}」` }, { status: 400 });
      patch.name = name;
    }
    const { error } = await supabaseAdmin.from('lab_cast').update(patch).eq('id', castId);
    if (error) throw error;

    let renamed = 0;
    if (patch.name && cur.kind === 'person' && !cur.is_self) {
      const { data: chs } = await supabaseAdmin.from('lab_chapters').select('id, seq, sim').eq('task_id', id);
      for (const c of chs || []) {
        const sim = c.sim || {};
        let hit = false;
        for (const s of sim.steps || []) if (s.scene?.who === cur.name) { s.scene.who = name; hit = true; }
        if (sim.art?.npcs?.[cur.name]) { sim.art.npcs[name] = sim.art.npcs[cur.name]; delete sim.art.npcs[cur.name]; hit = true; }
        if (!hit) continue;
        renamed++;
        await supabaseAdmin.from('lab_chapters').update({ sim, updated_at: new Date().toISOString() }).eq('id', c.id);
        if (c.seq === 1) await supabaseAdmin.from('skill_tasks').update({ sim }).eq('id', id);
      }
    }
    return NextResponse.json({ ok: true, renamed });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}

/** 删角色：还有章节在用就不让删（先在章节里换掉）；数字职人本人不能删。素材留在库里 */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id, castId } = await params;
    const { data: cur, error: e0 } = await supabaseAdmin.from('lab_cast').select('*, asset:lab_art_assets(id, url)').eq('id', castId).eq('task_id', id).single();
    if (e0) throw e0;
    if (cur.is_self) return NextResponse.json({ ok: false, error: '数字职人本人不能删' }, { status: 400 });
    const { data: chs } = await supabaseAdmin.from('lab_chapters').select('title, sim').eq('task_id', id);
    const used = (chs || []).filter((c: any) => stepsUsing(c.sim, cur as CastMember).length);
    if (used.length) return NextResponse.json({ ok: false, error: `还有 ${used.length} 章在用（${used.map((c: any) => `「${c.title}」`).join('')}），先在章节里换掉` }, { status: 400 });
    const { error } = await supabaseAdmin.from('lab_cast').delete().eq('id', castId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
