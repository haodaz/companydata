/**
 * 3D beta 探索：用 Veo（Gemini API）生成「镜头绕场一圈」的视频，后面拿去重建 3D 高斯。
 *   node scripts/beta3d/veo.mjs <输出.mp4> "<提示词>" [--model=veo-3.1-fast-generate-preview]
 * 重建要求场景完全静止、镜头平稳环绕：提示词里写死这些，负面提示词去掉人走动、转场、晃动。
 */
import fs from 'node:fs';

const env = Object.fromEntries(fs.readFileSync(new URL('../../.env.local', import.meta.url), 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const KEY = env.GEMINI_API_KEY;
const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const [k, v = '1'] = a.slice(2).split('='); return [k, v]; }));
const [out, prompt] = args.filter(a => !a.startsWith('--'));
if (!KEY || !out || !prompt) { console.error('用法：node scripts/beta3d/veo.mjs <输出.mp4> "<提示词>"'); process.exit(1); }
const MODEL = flags.model || 'veo-3.1-fast-generate-preview';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const H = { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' };

const start = await fetch(`${BASE}/models/${MODEL}:predictLongRunning`, {
  method: 'POST', headers: H,
  body: JSON.stringify({
    instances: [{ prompt }],
    parameters: { aspectRatio: '16:9', negativePrompt: 'people walking, moving objects, cuts, scene transitions, camera shake, motion blur, text, watermark, fisheye distortion' },
  }),
}).then(r => r.json());
if (!start.name) { console.error('提交失败', JSON.stringify(start).slice(0, 400)); process.exit(1); }
console.log('已提交', MODEL, start.name);

let op = start;
for (let i = 0; i < 120 && !op.done; i++) {
  await new Promise(r => setTimeout(r, 10000));
  op = await fetch(`${BASE}/${start.name}`, { headers: H }).then(r => r.json());
  if (i % 3 === 0) console.log('  …生成中', (i + 1) * 10, 's');
}
if (!op.done) { console.error('超时'); process.exit(1); }
if (op.error) { console.error('失败', JSON.stringify(op.error).slice(0, 400)); process.exit(1); }
const sample = op.response?.generateVideoResponse?.generatedSamples?.[0] || op.response?.generatedVideos?.[0];
const uri = sample?.video?.uri;
if (!uri) { console.error('没有视频', JSON.stringify(op.response).slice(0, 600)); process.exit(1); }
const vid = await fetch(uri, { headers: { 'x-goog-api-key': KEY }, redirect: 'follow' });
fs.writeFileSync(out, Buffer.from(await vid.arrayBuffer()));
console.log('✅', out, (fs.statSync(out).size / 1e6).toFixed(1), 'MB');
// 记账（迁移 021）：Veo 按视频秒数计价，一条 8 秒；--space / --job 可以把它记到某个空间 / 批次上
const { spawnSync } = await import('node:child_process');
spawnSync('npx', ['tsx', 'scripts/lab-log-cost.mts', '--tool', 'lab-3d', '--task', 'Veo 环绕视频', '--model', MODEL, '--units', String(flags.seconds || 8), ...(flags.space ? ['--space', flags.space] : []), ...(flags.job ? ['--job', flags.job] : [])], { stdio: 'ignore', cwd: new URL('../..', import.meta.url).pathname });
