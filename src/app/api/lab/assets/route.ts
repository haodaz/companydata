import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { selectAll } from '@/lib/supabase-all';
import { labError } from '@/lib/skill-lab-server';
import { assetAppearances } from '@/lib/lab-cast-server';
import type { LabAsset } from '@/lib/lab-cast';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 素材库总表：每一件带上「被几个空间、几章用到」和角色名，详情另取。LAB_PUBLIC 下也要登录（见 proxy） */
export async function GET() {
  try {
    const { data, error } = await selectAll<LabAsset>(() => supabaseAdmin.from('lab_art_assets').select('*').order('created_at', { ascending: false }));
    if (error) throw error;
    const apps = await assetAppearances(data.map(a => a.id));
    const assets = data.map(a => {
      const list = apps.get(a.id) || [];
      return {
        ...a,
        usage: {
          spaces: new Set(list.map(x => x.space.id)).size,
          chapters: list.reduce((n, x) => n + x.chapters.length, 0),
          names: [...new Set(list.map(x => x.cast.name))].slice(0, 4),
          self: list.some(x => x.cast.is_self),
        },
      };
    });
    return NextResponse.json({ ok: true, assets });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
