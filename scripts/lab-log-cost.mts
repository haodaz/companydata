/**
 * 命令行记一笔账（迁移 021）：给不走 llm-client 的花费用——Veo 视频、外部工具。
 *   npx tsx scripts/lab-log-cost.mts --tool lab-3d --task "Veo 视频" --model veo-3.1-fast-generate-preview --units 8 [--space <id>] [--job <编号>] [--stage media]
 *   直接记金额（系统外的花费，如 Nebius 黑客松额度）：--tool external --task "Nebius 黑客松额度 · 结构化" --model nebius --usd 120
 * 单价看 model_pricing.unit_price（没有就用 token-logger 里的默认价）。
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { logTokenUsage } = await import('../src/lib/token-logger');
const a = process.argv.slice(2);
const f = (k: string) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : undefined; };
if (!f('model') || !f('task')) { console.error('用法：npx tsx scripts/lab-log-cost.mts --tool lab-3d --task "…" --model … --units 8'); process.exit(1); }
await logTokenUsage({ tool_name: (f('tool') || 'lab-3d') as any, task_name: f('task')!, model_id: f('model')!, units: Number(f('units') || 0), ...(f('usd') ? { cost_usd: Number(f('usd')) } : {}), space_id: f('space') || null, job_id: f('job') || null, stage: f('stage') || 'media', actor: 'script' });
