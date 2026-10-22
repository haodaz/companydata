/**
 * 科研产品破图（数据部门 10-22 #25：有的产品是破图，要换成正确的；没有产品图就留空）。
 * 每张图：存进桶的检查能不能打开；只有原图链的重新下载（带 / 不带来源页两种都试）存进桶；都不行就去掉。
 * 太小的（< 1.5KB，多半是占位图 / 透明像素）、不是图片的也去掉。
 *   npx tsx scripts/fix-product-images.mts [--apply]
 */
process.loadEnvFile('.env.local');
import crypto from 'node:crypto';
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const APPLY = process.argv.includes('--apply');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36';
const MIN = 1500;

async function grab(url: string, referer?: string): Promise<{ buf: Buffer; ct: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { 'User-Agent': UA, ...(referer ? { Referer: referer } : {}) } });
    const ct = res.headers.get('content-type') || '';
    if (!res.ok || !/^image\//.test(ct) || /svg/.test(ct)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length >= MIN && buf.length < 8 * 1024 * 1024 ? { buf, ct } : null;
  } catch { return null; }
}

const { data } = await selectAll(() => db.from('research_products').select('id, name, supplier_id, external_id, source_url, images').not('if_delete', 'is', true).order('id'));
const stat = { products: 0, images: 0, ok: 0, restored: 0, dropped: 0, emptied: 0 };
for (const p of data as any[]) {
  const imgs = (p.images || []) as any[];
  if (!imgs.length) continue;
  stat.products++;
  const keep: any[] = [];
  for (const g of imgs) {
    stat.images++;
    if (g.storage_path) {
      const pub = db.storage.from('research-images').getPublicUrl(g.storage_path).data.publicUrl;
      if (await grab(pub)) { keep.push(g); stat.ok++; continue; }
    }
    // 没存下来 / 存的打不开：原图链重新下（先带来源页，防盗链；再不带）
    const got = (await grab(g.url, p.source_url)) || (await grab(g.url));
    if (got) {
      const ext = (got.ct.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '');
      const key = `${p.supplier_id}/${p.external_id}/${crypto.createHash('md5').update(g.url).digest('hex').slice(0, 12)}.${ext}`;
      if (APPLY) {
        const { error } = await db.storage.from('research-images').upload(key, got.buf, { contentType: got.ct, upsert: true });
        if (error) { stat.dropped++; continue; }
      }
      keep.push({ ...g, storage_path: key });
      stat.restored++;
    } else stat.dropped++;
  }
  if (!keep.length) stat.emptied++;
  if (APPLY && JSON.stringify(keep) !== JSON.stringify(imgs)) await db.from('research_products').update({ images: keep }).eq('id', p.id);
}
console.log(`有图的产品 ${stat.products}、图 ${stat.images} 张：好的 ${stat.ok}，重新存档 ${stat.restored}，打不开去掉 ${stat.dropped}；去掉后一张都不剩、图片留空的产品 ${stat.emptied}${APPLY ? '' : '（试跑不写库）'}`);
process.exit(0);
