import { NextResponse } from 'next/server';
import { getWorkScale } from '@/lib/work/scale-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 平台现在的打分方式：候选人页、成绩单、自建前端都读这个，不用登录 */
export async function GET() { return NextResponse.json({ ok: true, scale: await getWorkScale() }); }
