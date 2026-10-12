/**
 * 3D 场景一条龙（2026-10-12）：提示词模板 → Veo 视频 → COLMAP 估机位 → 质量门 → Brush 训练 → .splat → 自动挑初始机位 → 上传。
 * 失败自动换更保守的提示词重来，几次都不行就回退 2D（退出码 2），不用人盯着。每次尝试都记进 runs.jsonl（成败样本，以后喂给生成 agent）。
 *
 *   node scripts/beta3d/make-scene.mjs <key> --subject "<英文场景描述>" --anchor "<镜头围着的硬结构物件>"
 *        [--video 已有.mp4]   第一轮直接用这条视频（不花 Veo 额度）
 *        [--tries 3] [--steps 15000] [--work 目录] [--no-upload] [--force]（风险词也照跑）
 *
 * 质量门：最大模型注册帧 ≥ max(60, 60%)；初始机位近处点占比 > 5% 只警告（沥青那种满屏拉丝）。
 * 产出：<work>/<key>/result.json，打印 lab-3d-beta.ts 要填的 url / position / lookAt / up。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildPrompt, lintSubject, VARIANTS } from './prompt.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const PY = path.join(ROOT, '.venv/bin/python');
const BRUSH = path.join(os.homedir(), '.local/brush/brush-app-aarch64-apple-darwin/brush_app');
const RUNS = path.join(ROOT, 'scripts/beta3d/runs.jsonl');

const argv = process.argv.slice(2);
const flag = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const key = argv[0];
const subject = flag('subject'), anchor = flag('anchor', 'the main piece of equipment');
if (!key || key.startsWith('--') || !subject) { console.error('用法：node scripts/beta3d/make-scene.mjs <key> --subject "…" --anchor "…" [--video x.mp4]'); process.exit(1); }
const tries = Number(flag('tries', VARIANTS.length)), steps = Number(flag('steps', 15000));
const W = path.resolve(flag('work', path.join(os.tmpdir(), 'beta3d')), key);
fs.mkdirSync(W, { recursive: true });

const log = (...a) => console.log(`[${new Date().toTimeString().slice(0, 8)}]`, ...a);
const run = (cmd, args, opt = {}) => {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, ...opt });
  return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || '') };
};
const record = rec => fs.appendFileSync(RUNS, JSON.stringify({ at: new Date().toISOString(), key, subject, anchor, ...rec }) + '\n');

const risks = lintSubject(subject);
if (risks.length) {
  log('⚠ 场景描述里有已知风险：\n   - ' + risks.join('\n   - '));
  if (!flag('force')) { log('改描述再跑，或者加 --force 硬跑'); process.exit(1); }
}

const gate = r => !!r && r.registered >= Math.min(r.frames, Math.max(60, Math.ceil(r.frames * 0.6)));

for (let t = 0; t < tries; t++) {
  const variant = VARIANTS[Math.min(t, VARIANTS.length - 1)].key;
  const prompt = buildPrompt(subject, anchor, t);
  const vid = t === 0 && flag('video') ? path.resolve(flag('video')) : path.join(W, `try${t}.mp4`);
  log(`== 第 ${t + 1}/${tries} 次（${variant}）`);
  if (!(t === 0 && flag('video'))) {
    const v = run('node', ['scripts/beta3d/veo.mjs', vid, prompt]);
    if (!v.ok || !fs.existsSync(vid)) { log('Veo 失败', v.out.slice(-300)); record({ try: t, variant, prompt, stage: 'veo', ok: false }); continue; }
  }
  // 两档抽帧：先快（每 2 帧、1280 宽），不过门再用每帧、1600 宽
  let sfm = null, res = null;
  for (const [every, width] of [[2, 1280], [1, 1600]]) {
    sfm = path.join(W, `try${t}-sfm`);
    log(`   估机位 every=${every} width=${width}`);
    run(PY, ['scripts/beta3d/sfm.py', vid, sfm, '--every', String(every), '--width', String(width)]);
    try { res = JSON.parse(fs.readFileSync(path.join(sfm, 'result.json'), 'utf8')); } catch { res = null; }
    log(`   对上 ${res?.registered ?? 0}/${res?.frames ?? '?'} 帧`);
    if (gate(res)) break;
  }
  if (!gate(res)) { record({ try: t, variant, prompt, video: vid, stage: 'sfm', ok: false, sfm: res }); continue; }

  const out = path.join(W, `try${t}-out`); fs.mkdirSync(out, { recursive: true });
  log(`   训练 ${steps} 步（约 10 分钟）`);
  const b = run(BRUSH, [sfm, '--total-steps', String(steps), '--export-every', String(steps), '--export-path', out, '--export-name', `${key}.ply`, '--max-resolution', '1280'], { cwd: out });
  const ply = path.join(out, `${key}.ply`);
  if (!fs.existsSync(ply)) { log('训练没出 ply', b.out.slice(-300)); record({ try: t, variant, prompt, stage: 'brush', ok: false, sfm: res }); continue; }
  const splat = path.join(W, `beta3d-${key}.splat`);
  run(PY, ['scripts/beta3d/ply2splat.py', ply, splat]);
  const view = JSON.parse(run(PY, ['scripts/beta3d/view.py', sfm]).out.trim().split('\n').pop());
  if (view.nearRatio > 0.05) log(`   ⚠ 初始机位近处点占比 ${(view.nearRatio * 100).toFixed(1)}%，打开可能满屏糊`);
  let url = null;
  if (!flag('no-upload')) {
    const u = run('npx', ['tsx', 'scripts/beta3d/upload.mts', splat, path.basename(splat)]);
    url = u.out.match(/https:\/\/\S+\.splat/)?.[0] || null;
    if (!url) log('上传失败', u.out.slice(-300));
  }
  const gaussians = fs.statSync(splat).size / 32;
  const result = { ok: true, key, url, splat, position: view.position, lookAt: view.lookAt, up: view.up, depth: view.depth, nearRatio: view.nearRatio, gaussians, sfm: res, variant, prompt };
  fs.writeFileSync(path.join(W, 'result.json'), JSON.stringify(result, null, 1));
  record({ try: t, variant, prompt, stage: 'done', ok: true, sfm: res, nearRatio: view.nearRatio, gaussians, url });
  // 中间产物很大（抽帧 + ply 上百 MB），成功了就删，别再把硬盘塞满
  fs.rmSync(path.join(sfm, 'images'), { recursive: true, force: true }); fs.rmSync(path.join(sfm, 'database.db'), { force: true }); fs.rmSync(ply, { force: true });
  log('✅ 完成，lab-3d-beta.ts 里填：');
  console.log(`    url: '${url || splat}', position: ${JSON.stringify(view.position)}, lookAt: ${JSON.stringify(view.lookAt)}, up: ${JSON.stringify(view.up)}, span: ${view.depth < 10 ? 1.2 : 3.6},`);
  console.log(`    credit: 'Veo 3.1 生成环绕视频 · COLMAP + Brush 重建（${Math.round(gaussians / 1e4)} 万高斯，${(gaussians * 32 / 1e6).toFixed(1)} MB）',`);
  process.exit(0);
}
record({ stage: 'fallback-2d', ok: false });
log(`❌ ${tries} 次都没过质量门，这个场景先用 2D 底图`);
process.exit(2);
