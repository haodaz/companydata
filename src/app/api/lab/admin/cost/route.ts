import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/session';
import { usageReport } from '@/lib/cost/usage-report';
import { toolsOf } from '@/lib/cost/products';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 百业的成本（百业后台 /lab/admin 用）：只算百业的记账（大模型调用 / 出图 / 视频与 3D），按环节、按空间分解。仅管理员 */
export async function GET(req: Request) {
  const denied = await requireAdminUser(req); if (denied) return denied;
  try {
    const { searchParams } = new URL(req.url);
    const r = await usageReport({
      tools: toolsOf('lab'),
      page: parseInt(searchParams.get('page') || '1'), pageSize: parseInt(searchParams.get('pageSize') || '50'),
      model: searchParams.get('model') || '', days: parseInt(searchParams.get('days') || '0'),
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
