import { NextResponse, after } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { runDaily, runningDetection } from '@/lib/flywheel/detect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 联网探针（按各自间隔，三个一组并行）+ 归一 + 排产，一轮要几分钟
export const maxDuration = 800;

const MODEL = () => process.env.FLYWHEEL_MODEL || 'gemini-3.8-flash';
const FALLBACK = () => process.env.FLYWHEEL_FALLBACK_MODEL || 'gpt-5.6-luna';

/**
 * 看板上人工触发「立即检测」：{ model?, scanWeb?, forceAll?, plan? }（不做定时，数据部门按节奏手动点）
 * 点了立刻返回，检测在响应之后跑；进度写进当天 flywheel_days.stats.run，看板每几秒刷新一次。
 */
export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  const running = await runningDetection();
  if (running) return NextResponse.json({ ok: false, error: `已经在检测了（${running.startedAt.slice(11, 16)} UTC 开始），等它跑完`, running: true }, { status: 409 });
  const body = await req.json().catch(() => ({}));
  const opts = { model: body.model || MODEL(), fallbackModel: FALLBACK(), scanWeb: body.scanWeb, forceAll: !!body.forceAll, plan: body.plan };
  after(async () => {
    try { await runDaily(opts); } catch (e: any) { console.error('[flywheel] run', e?.message); }
  });
  return NextResponse.json({ ok: true, started: true });
}
