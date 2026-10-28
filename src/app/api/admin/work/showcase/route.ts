import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { supabaseAdmin as db } from '@/lib/supabase';
import { deidentifyToShowcase, showcaseCandidates } from '@/lib/work/showcase';
import { withCost } from '@/lib/token-logger';

export const runtime = 'nodejs';
export const maxDuration = 120;

const admin = async (req: NextRequest) => { const u = await getSessionUser(req); return u && u.role === 'admin' ? u : null; };
const no = () => NextResponse.json({ ok: false, error: '只有管理员能管任务库' }, { status: 403 });

/** 任务库上架台：候选（题目资产库里的好题）+ 已去头待看的 + 已上架的 */
export async function GET(req: NextRequest) {
  if (!(await admin(req))) return no();
  try { return NextResponse.json({ ok: true, ...(await showcaseCandidates()) }); }
  catch (e: any) { return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 }); }
}

/** 去头：{ task_id } → AI 写展示题面，存成 draft */
export async function POST(req: NextRequest) {
  const u = await admin(req); if (!u) return no();
  const { task_id } = await req.json().catch(() => ({}));
  if (!task_id) return NextResponse.json({ ok: false, error: '缺 task_id' }, { status: 400 });
  try { return NextResponse.json({ ok: true, item: await withCost({ tool_name: 'work', task_name: 'Showcase · 去头上架', stage: 'create', actor: u.email }, () => deidentifyToShowcase(String(task_id), u.email)) }); }
  catch (e: any) { return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 }); }
}

/** 改字段 / 上架 / 不上：{ id, title?, scenario?, role?, industry?, direction?, status? } */
export async function PATCH(req: NextRequest) {
  if (!(await admin(req))) return no();
  const b = await req.json().catch(() => ({}));
  if (!b.id) return NextResponse.json({ ok: false, error: '缺 id' }, { status: 400 });
  const up: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const k of ['title', 'scenario', 'role', 'industry', 'direction']) if (typeof b[k] === 'string') up[k] = b[k].slice(0, k === 'scenario' ? 800 : 80);
  if (['draft', 'live', 'hidden'].includes(b.status)) up.status = b.status;
  const { error } = await db.from('work_showcase').update(up).eq('id', String(b.id));
  return error ? NextResponse.json({ ok: false, error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
}
