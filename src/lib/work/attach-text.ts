/**
 * 素材文字存服务端（11-13 潜历：一次传 8 张图，看图说明要靠聊天里的出题助理原样抄进 create_task，它没抄，材料包里只剩「附图：xx.png」，
 * 基线、评卷、候选人端 AI 都看不到图）。上传时把抽出的文字 / 看图说明另存一份 <存储路径>.txt；出任务、补素材时按地址读回来，不靠模型转述。
 */
import { supabaseAdmin as db } from '@/lib/supabase';
import type { Attachment } from '@/lib/work/generator';

const BUCKET = 'lab-media';

/** 素材地址 → 存储路径（只认 work-attach/ 下的） */
export function attachPath(url: string) {
  const m = decodeURIComponent(String(url || '')).match(/(work-attach\/[^?#]+)/);
  return m ? m[1] : null;
}

export async function saveAttachText(path: string, text: string) {
  if (!text) return;
  await db.storage.from(BUCKET).upload(`${path}.txt`, Buffer.from(text, 'utf8'), { contentType: 'text/plain; charset=utf-8', upsert: true }).catch(() => {});
}

async function readAttachText(path: string) {
  const { data } = await db.storage.from(BUCKET).download(`${path}.txt`).catch(() => ({ data: null }));
  return data ? (await data.text()).trim() : '';
}

/** 看一张图写说明，并存下来 */
export async function describeAttachment(url: string, name: string, mime?: string) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) return '';
    const buf = Buffer.from(await r.arrayBuffer());
    const { describeImage } = await import('@/lib/work/vision');
    const text = await describeImage(buf, mime || r.headers.get('content-type') || 'image/png', name);
    const p = attachPath(url); if (p && text) await saveAttachText(p, text);
    return text;
  } catch (e) { console.warn('[attach-text] 看图失败', name, String((e as any)?.message).slice(0, 100)); return ''; }
}

const isImage = (a: { mime?: string; name?: string; image?: boolean }) => !!a.image || /^image\//.test(String(a.mime || '')) || /\.(png|jpe?g|webp|gif)$/i.test(String(a.name || ''));

/** 补全素材文字：存下来的全文比模型转来的长就用存的；图片还是没有说明就当场再看一次（两路并发，库和模型都别压太狠） */
export async function fillAttachText(atts: Attachment[]): Promise<Attachment[]> {
  const out = [...atts];
  let i = 0;
  const work = async () => {
    while (i < out.length) {
      const k = i++; const a = out[k]; const p = attachPath(a.url);
      let text = a.text || '';
      if (p) { const saved = await readAttachText(p); if (saved.length > text.length) text = saved; }
      if (!text && isImage(a)) text = await describeAttachment(a.url, a.name, a.mime);
      out[k] = { ...a, text, image: a.image || isImage(a) };
    }
  };
  await Promise.all([work(), work()]);
  return out;
}

/** 已有任务里没看成的图（内容只剩「附图：…」）重新看一遍；返回新材料和补上的文件名 */
export async function refreshImageMaterials(materials: any[]) {
  const fixed: string[] = [];
  const next = [];
  for (const m of materials || []) {
    if (m?.kind === 'file' && m.url && isImage(m) && /^附图[:：]/.test(String(m.content || ''))) {
      const [a] = await fillAttachText([{ url: m.url, name: m.name || m.title, mime: m.mime, text: '', image: true }]);
      if (a.text) { next.push({ ...m, content: `图片说明（AI 看图整理，以原图为准）：\n${a.text.slice(0, 4000)}`, basis: '出题人上传的素材图 + AI 看图说明' }); fixed.push(m.title); continue; }
    }
    next.push(m);
  }
  return { materials: next, fixed };
}
