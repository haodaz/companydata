import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 企业深度尽调结果（按专题）：优先读 company_deep_research 表（迁移 008）；
 * 表还没建时回退到仓库里的快照 src/data/deep-research/<id>.json（scripts/deep-research.mts 的输出）。
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const companyId = parseInt(id);
  try {
    const { data, error } = await supabaseAdmin.from('company_deep_research').select('topic, data, queries, model_id, seconds, updated_at').eq('company_id', companyId);
    if (!error && data && data.length) {
      const topics: Record<string, any> = {};
      for (const r of data) topics[r.topic] = { data: r.data, queries: r.queries, seconds: r.seconds, updatedAt: r.updated_at };
      return NextResponse.json({ success: true, source: 'db', model: data[0].model_id, generatedAt: data.map(r => r.updated_at).sort().pop(), topics });
    }
  } catch { /* 表不存在或查询失败 → 回退快照 */ }
  const file = path.join(process.cwd(), 'src', 'data', 'deep-research', `${companyId}.json`);
  if (fs.existsSync(file)) {
    const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
    return NextResponse.json({ success: true, source: 'snapshot', model: snap.model, generatedAt: snap.generatedAt, topics: snap.topics });
  }
  return NextResponse.json({ success: true, source: 'none', topics: {} });
}
