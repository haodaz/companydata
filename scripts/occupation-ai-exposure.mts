/**
 * 职业 AI 替代性 · 全库批量（2026-11-01）：给职业库每个职业算一遍「AI 替代性」（任务三分、新增任务、基准分、通用强项风险），
 * 存进职业子实体 occupation_ai_exposure。搜过就存：已经算过、任务清单没变的直接跳过，所以随时中断、随时接着跑。
 * 并发 3（库是线上共用的）；模型 Claude 优先、千问兜底。
 *   npx tsx --env-file=.env.local scripts/occupation-ai-exposure.mts [--limit=N]
 */
import { supabaseAdmin as db } from '../src/lib/supabase';
import { occLayer, aiExposureTable } from '../src/lib/lab-ai-change';
import { withCost } from '../src/lib/token-logger';

const limit = Number((process.argv.find(a => a.startsWith('--limit=')) || '').split('=')[1]) || Infinity;
const table = await aiExposureTable();
if (!table) { console.error('还没有 occupation_ai_exposure / lab_ai_change_cache 表，先跑迁移 056 / 057'); process.exit(1); }
const { data: occs } = await db.from('occupations').select('*').eq('if_delete', false).order('id');
const list = (occs || []).slice(0, limit);
let done = 0, cached = 0, built = 0, failed = 0;
const t0 = Date.now();
const queue = [...list];
async function worker() {
  while (queue.length) {
    const o = queue.shift()!;
    try {
      const r = await withCost({ tool_name: 'lab', task_name: 'AI 替代性 · 全库批量', stage: 'batch' } as any, () => occLayer(o, { count: false }));
      if (r.cached) cached++; else built++;
      if (!r.cached) console.log(`  ✓ ${o.name}：基准 ${r.baseline}（AI 接手 ${r.tasks.filter(t => t.kind === 'ai').length} / 协作 ${r.tasks.filter(t => t.kind === 'hybrid').length} / 人来做 ${r.tasks.filter(t => t.kind === 'human').length}）`);
    } catch (e: any) { failed++; console.log(`  ✗ ${o.name}：${String(e?.message).slice(0, 80)}`); }
    done++;
    if (done % 20 === 0) console.log(`[${done}/${list.length}] 新算 ${built} · 已有 ${cached} · 失败 ${failed} · ${Math.round((Date.now() - t0) / 60000)} 分钟`);
  }
}
await Promise.all([worker(), worker(), worker()]);
console.log(`完成：${list.length} 个职业，新算 ${built}，已有 ${cached}，失败 ${failed}，用时 ${Math.round((Date.now() - t0) / 60000)} 分钟`);
