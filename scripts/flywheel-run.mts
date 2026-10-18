/**
 * 本地跑一轮需求飞轮检测 + 排产（和看板「立即检测」同一套），模型不写死：
 *   npx tsx scripts/flywheel-run.mts --model qwen-plus [--fallback qwen3.6-plus] [--force-all] [--no-web] [--no-plan]
 */
process.loadEnvFile('.env.local');
const { runDaily } = await import('@/lib/flywheel/detect');
const { isKnownModel } = await import('@/lib/model-options');
const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const model = opt('model', process.env.FLYWHEEL_MODEL || '');
if (!model || !isKnownModel(model)) { console.error(`--model 要用模型选单里的（现在：${model || '空'}）`); process.exit(1); }
const fallback = opt('fallback', process.env.FLYWHEEL_FALLBACK_MODEL || '') || undefined;
await runDaily({ model, fallbackModel: fallback, scanWeb: !process.argv.includes('--no-web'), forceAll: process.argv.includes('--force-all'), plan: !process.argv.includes('--no-plan') });
