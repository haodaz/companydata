/**
 * 示范图搬进 Storage（从 eng/simulator 搬来，2026-10-11）：素材库里还指着 public/lab/*.jpg|png 的，上传成 seed-<原名>，
 * 引用改成 Storage 网址，刷新用到它们的空间。迁移 019 跑完后执行；可重复跑（已经搬过的跳过）。
 *   npx tsx scripts/lab-localize-seed.mts
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { countLocalAssets, localizeLibrary } = await import('../src/lib/lab-seed-assets');
console.log('还指着 /lab/ 的素材：', await countLocalAssets());
const r = await localizeLibrary();
console.log(`搬了 ${r.moved} 张，刷新 ${r.refreshed} 个空间，改写引用 ${r.rewritten} 处，失败 ${r.failed.length}`);
for (const f of r.failed) console.log('  ✗', f.url, f.error);
console.log('剩下：', await countLocalAssets());
