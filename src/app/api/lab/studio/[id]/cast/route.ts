import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { labError } from '@/lib/skill-lab-server';
import { findReusable, loadCast, registerAsset } from '@/lib/lab-cast-server';
import { CAST_KINDS, castKind, nextCastCode } from '@/lib/lab-cast';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * 角色表加一个人 / 地点 / 道具。
 * 没指定素材时按规范类型名去库里找能复用的；道具找不到就当场建一张道具卡归库（先不画图）。
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const b = await req.json().catch(() => ({}));
    const kind = CAST_KINDS.some(k => k.k === b.kind) ? b.kind : 'person';
    const name = String(b.name || '').trim().slice(0, 40);
    if (!name) return NextResponse.json({ ok: false, error: '要有名字' }, { status: 400 });
    const cast = await loadCast(id);
    if (cast.some(c => c.kind === kind && c.name === name)) return NextResponse.json({ ok: false, error: `角色表里已经有「${name}」` }, { status: 400 });
    const type_name = String(b.type_name || '').trim().slice(0, 60);
    let asset_id: string | null = b.asset_id || null;
    let reused = false;
    if (!asset_id && type_name) {
      const hit = await findReusable(castKind(kind).asset, type_name, '', cast.map(m => m.asset_id));
      if (hit) { asset_id = hit.id; reused = true; await supabaseAdmin.from('lab_art_assets').update({ uses: (hit.uses || 1) + 1 }).eq('id', hit.id); }
    }
    if (!asset_id && kind === 'prop') {
      const a = await registerAsset({ kind: 'prop', title: name, type_name: type_name || name, note: String(b.note || ''), source_task_id: id });
      asset_id = a.id;
    }
    const { data, error } = await supabaseAdmin.from('lab_cast').insert({
      task_id: id, code: nextCastCode(cast, kind), kind, name, type_name,
      note: String(b.note || '').slice(0, 400), look: String(b.look || '').slice(0, 600), asset_id,
    }).select('id, code').single();
    if (error) throw error;
    return NextResponse.json({ ok: true, id: data.id, code: data.code, reused });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
