import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { runDaily } from '@/lib/flywheel/detect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 六个联网探针 + 归一 + 排产，一轮要几分钟
export const maxDuration = 800;

const MODEL = () => process.env.FLYWHEEL_MODEL || 'gemini-3.8-flash';
const FALLBACK = () => process.env.FLYWHEEL_FALLBACK_MODEL || 'gpt-5.6-luna';

/** 看板上人工触发「立即检测」：{ model?, scanWeb?, plan? }（不做定时，数据部门按节奏手动点） */
export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  return run({ model: body.model || MODEL(), scanWeb: body.scanWeb, plan: body.plan });
}

async function run(o: { model: string; scanWeb?: boolean; plan?: boolean }) {
  const lines: string[] = [];
  try {
    const r = await runDaily({ ...o, fallbackModel: FALLBACK(), log: s => { lines.push(s); console.log(`[flywheel] ${s}`); } });
    return NextResponse.json({ ok: true, ...r, log: lines });
  } catch (e: any) {
    console.error('[flywheel] run', e);
    return NextResponse.json({ ok: false, error: e.message, log: lines }, { status: 500 });
  }
}
