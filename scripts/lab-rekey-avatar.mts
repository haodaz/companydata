/**
 * 立绘重新去背：npx tsx scripts/lab-rekey-avatar.mts NOVA-49 NOVA-52 … [--apply]
 *
 * 生图时模型给的不一定是纯绿幕（有的是灰绿、带噪点），原来的 chromaKey 只认「偏绿」，就漏了。
 * 这里不认颜色，认「从边缘连着的、和边缘颜色相近的那一片」：从四周往里泛洪，
 * 人物身上恰好同色的地方因为不连着边缘，不会被吃掉；再清一遍背景里残留的噪点，边缘羽化 1px。
 * 默认只把结果写到 /tmp 看一眼；加 --apply 才上传并换掉 profile.avatar（旧图不删）。
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin } = await import('../src/lib/supabase');
const { uploadLabAsset } = await import('../src/lib/lab-art');
const sharp = (await import('sharp')).default;

const args = process.argv.slice(2), apply = args.includes('--apply');
const want = args.filter(a => a.startsWith('NOVA-'));

async function rekey(buf: Buffer): Promise<Buffer> {
  const { data: px, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, N = W * H;
  const at = (i: number) => [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]];
  // 背景色 = 边缘一圈像素的中位数
  const border: number[][] = [];
  for (let x = 0; x < W; x += 2) { border.push(at(x), at((H - 1) * W + x)); }
  for (let y = 0; y < H; y += 2) { border.push(at(y * W), at(y * W + W - 1)); }
  const med = [0, 1, 2].map(c => border.map(p => p[c]).sort((a, b) => a - b)[border.length >> 1]);
  const dist = (i: number) => { const [r, g, b] = at(i); return Math.hypot(r - med[0], g - med[1], b - med[2]); };
  const T = 70;
  const bg = new Uint8Array(N), q: number[] = [];
  const push = (i: number) => { if (!bg[i] && dist(i) < T) { bg[i] = 1; q.push(i); } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (q.length) {
    const i = q.pop()!, x = i % W, y = (i / W) | 0;
    if (x > 0) push(i - 1); if (x < W - 1) push(i + 1); if (y > 0) push(i - W); if (y < H - 1) push(i + W);
  }
  // 清噪点：一个非背景像素周围 5×5 里大半是背景，就当它是背景里的噪点
  for (let pass = 0; pass < 2; pass++) {
    const nb = bg.slice();
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
      const i = y * W + x; if (bg[i]) continue;
      let c = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) c += bg[i + dy * W + dx];
      if (c >= 17) nb[i] = 1;
    }
    bg.set(nb);
  }
  for (let i = 0; i < N; i++) if (bg[i]) px[i * 4 + 3] = 0;
  // 羽化：挨着背景的那一圈半透明
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x; if (bg[i]) continue;
    const n = bg[i - 1] + bg[i + 1] + bg[i - W] + bg[i + W];
    if (n) px[i * 4 + 3] = Math.round(px[i * 4 + 3] * (n >= 3 ? 0.35 : 0.7));
  }
  return sharp(px, { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
}

const { data } = await supabaseAdmin.from('skill_tasks').select('id, profile');
for (const t of (data || []) as any[]) {
  if (!want.includes(t.profile?.name)) continue;
  const u: string = t.profile.avatar;
  const src = Buffer.from(await (await fetch(u.startsWith('/') ? `http://localhost:3003${u}` : u)).arrayBuffer());
  const out = await rekey(src);
  const preview = `/tmp/rekey-${t.profile.name}.png`;
  // 预览图垫一块深色底，看得出边缘干不干净
  await sharp({ create: { width: 400, height: 640, channels: 4, background: '#1b1f3a' } })
    .composite([{ input: await sharp(out).resize(400, 640, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer() }]).png().toFile(preview);
  if (!apply) { console.log(`· ${t.profile.name} 预览 → ${preview}`); continue; }
  const url = await uploadLabAsset(out, `rekey-${t.id.slice(0, 8)}-${Date.now().toString(36)}.png`, 'image/png');
  await supabaseAdmin.from('skill_tasks').update({ profile: { ...t.profile, avatar: url } }).eq('id', t.id);
  console.log(`✅ ${t.profile.name} 换成去背后的立绘（旧图保留：${u.split('/').pop()}）`);
}
