import { NextResponse } from 'next/server';
import { usageReport } from '@/lib/cost/usage-report';
import { toolsOf } from '@/lib/cost/products';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 数据工厂的用量（只算工厂自己的功能；百业的钱在百业后台 /lab/admin 看，2026-10-12 拆开） */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const r = await usageReport({
      tools: toolsOf('factory'),
      page: parseInt(searchParams.get('page') || '1'), pageSize: parseInt(searchParams.get('pageSize') || '50'),
      model: searchParams.get('model') || '', days: parseInt(searchParams.get('days') || '0'),
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (error: any) {
    console.error('[TokenUsage] GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
