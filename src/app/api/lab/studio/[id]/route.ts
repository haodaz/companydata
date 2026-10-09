import { NextRequest, NextResponse } from 'next/server';
import { labError } from '@/lib/skill-lab-server';
import { loadStudio } from '@/lib/lab-studio-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** 工作室读空间：所有章节（含草稿、含还没有步骤的）+ 校验结果。LAB_PUBLIC 下也要登录（见 proxy） */
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    return NextResponse.json({ ok: true, ...(await loadStudio(id)) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
