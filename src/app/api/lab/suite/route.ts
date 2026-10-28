import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { fixWork, getSuite, makeWork, markFixed, openCourse, planWork, reviewSuite, suiteLog } from '@/lib/suite';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * 一个 JD 生成整套（只给管理员，花钱）：页面按步骤调这里，空间 / 章节 / 教案走各自已有的接口。
 * GET ?space_id= 读整套记录；POST { action, space_id, ... }：
 *   plan_work → 真活分工；make_work { focus } → 出一道；review → 交叉审稿；fix_work { task_id, fix } → 按审稿改；
 *   mark_fixed { target, id, fix } → 记一笔（章节重写走工作室接口）；open_course → 开学籍；log { step, note }
 */
async function admin(req: NextRequest) {
  const me = await getSessionUser(req).catch(() => null);
  return me && me.role === 'admin' ? me : null;
}

export async function GET(req: NextRequest) {
  if (!(await admin(req))) return NextResponse.json({ ok: false, error: '只对管理员开放' }, { status: 403 });
  const id = req.nextUrl.searchParams.get('space_id');
  if (!id) return NextResponse.json({ ok: false, error: '缺 space_id' }, { status: 400 });
  try { return NextResponse.json({ ok: true, suite: await getSuite(id) }); } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  const me = await admin(req);
  if (!me) return NextResponse.json({ ok: false, error: '只对管理员开放' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const id = String(b.space_id || ''); if (!id) return NextResponse.json({ ok: false, error: '缺 space_id' }, { status: 400 });
  const user = { email: me.email || '', role: me.role };
  try {
    switch (b.action) {
      case 'plan_work': return NextResponse.json({ ok: true, plan: await planWork(id, Math.min(3, Math.max(1, Number(b.n) || 2))) });
      case 'make_work': return NextResponse.json({ ok: true, work: await makeWork(id, String(b.focus || ''), user) });
      case 'review': return NextResponse.json({ ok: true, review: await reviewSuite(id) });
      case 'fix_work': return NextResponse.json({ ok: true, ...(await fixWork(id, String(b.task_id), String(b.fix || ''))) });
      case 'mark_fixed': await markFixed(id, String(b.target), String(b.id), String(b.fix || '')); return NextResponse.json({ ok: true });
      case 'open_course': return NextResponse.json({ ok: true, enrollments: await openCourse(id, user.email) });
      case 'log': await suiteLog(id, String(b.step || ''), String(b.note || ''), user.email); return NextResponse.json({ ok: true });
      default: return NextResponse.json({ ok: false, error: `没有 ${b.action} 这一步` }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 500) }, { status: 500 });
  }
}
