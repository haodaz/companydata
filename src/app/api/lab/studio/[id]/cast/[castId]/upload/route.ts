import { NextRequest, NextResponse } from 'next/server';
import { denyUnlessLabOwner } from '@/lib/lab-owner';
import { supabaseAdmin } from '@/lib/supabase';
import { labError } from '@/lib/skill-lab-server';
import { registerAsset, refreshArtCache } from '@/lib/lab-cast-server';
import { uploadLabAsset, toJpeg } from '@/lib/lab-art';
import { familyOf } from '@/lib/career-family';
import { logRevision } from '@/lib/lab-revise';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string; castId: string }> };

/** 用自己的图（11-06）：{ filename, file（base64）} → 传进素材库、换到这个角色上。人物建议透明底 PNG；场景转成 JPG */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id, castId } = await params;
    const denied = await denyUnlessLabOwner(req, id); if (denied) return denied;
    const b = await req.json().catch(() => ({}));
    let buf: Buffer = Buffer.from(String(b.file || ''), 'base64');
    if (!buf.length) return NextResponse.json({ ok: false, error: '没收到图' }, { status: 400 });
    if (buf.length > 8 * 1024 * 1024) return NextResponse.json({ ok: false, error: '图别超过 8 MB' }, { status: 400 });
    const [{ data: m, error }, { data: t }] = await Promise.all([
      supabaseAdmin.from('lab_cast').select('*').eq('id', castId).eq('task_id', id).single(),
      supabaseAdmin.from('skill_tasks').select('jd_snapshot').eq('id', id).single(),
    ]);
    if (error) throw error;
    const person = m.kind === 'person', png = /\.png$/i.test(String(b.filename || ''));
    if (!person) buf = await toJpeg(buf);
    const name = `${id.slice(0, 8)}-${m.code}-up-${Date.now().toString(36)}.${person && png ? 'png' : 'jpg'}`;
    const url = await uploadLabAsset(buf, name, person && png ? 'image/png' : 'image/jpeg');
    const jd: any = (t as any)?.jd_snapshot || {};
    const a = await registerAsset({ kind: person ? 'npc' : m.kind === 'place' ? 'scene' : 'prop', url, title: m.type_name || m.name, type_name: m.type_name || m.name, family: familyOf(jd.career?.profession, jd.title), prompt: '用户上传', source_task_id: id } as any);
    await supabaseAdmin.from('lab_cast').update({ asset_id: a.id, updated_at: new Date().toISOString() }).eq('id', castId);
    await refreshArtCache([id]);
    await logRevision({ task_id: id, target: `cast:${castId}`, instruction: '换成自己上传的图', before: { asset_id: m.asset_id }, after: { asset_id: a.id, url }, status: 'adopted' });
    return NextResponse.json({ ok: true, asset: a });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
