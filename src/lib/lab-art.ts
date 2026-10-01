/**
 * 技能空间的美术生成（服务端）：通义万相文生图 → 场景底图（jpg）/ NPC 立绘（绿幕抠成透明 png）。
 * 生成的文件上传到 Supabase Storage 公开桶 lab-art，页面用公开 URL 引用（开发环境无 Supabase 时回退 public/lab/gen/）。
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const KEY = () => process.env.DASHSCOPE_API_KEY || '';
// 医疗 / 生物类的提示词很容易路到标本、器官、标本瓶上去，一律堵掉
const NEG = '文字, 字母, 水印, logo, 低清, 噪点, 畸变, 杂乱, 真人照片, 人体器官, 解剖标本, 标本瓶, 福尔马林, 内脏, 血迹, 血腥, 尸体, 残肢, 断肢, 截肢, 泡在液体里的身体部位, 医学标本, 骨骼标本, 惊悚';

export const artAvailable = () => !!KEY();

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** 提交排队：通义万相对「提交」有速率限制（并发一起提交会被 Throttling.RateQuota 拒掉），所以提交串行、间隔 3 秒；生成本身照样并行 */
let submitChain: Promise<unknown> = Promise.resolve();
const SUBMIT_GAP = 3000;
async function submitImage(prompt: string, size: string, model: string): Promise<string> {
  const run = async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis', {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY()}`, 'Content-Type': 'application/json', 'X-DashScope-Async': 'enable' },
        body: JSON.stringify({ model, input: { prompt, negative_prompt: NEG }, parameters: { size, n: 1, prompt_extend: true, watermark: false } }),
      });
      const j = await res.json();
      if (res.ok && j.output?.task_id) { await sleep(SUBMIT_GAP); return j.output.task_id as string; }
      if (String(j.code || '').startsWith('Throttling')) { await sleep(6000 * (attempt + 1)); continue; }
      throw new Error(`文生图提交失败：${JSON.stringify(j).slice(0, 200)}`);
    }
    throw new Error('文生图提交失败：多次被限流');
  };
  const p = submitChain.then(run, run);
  submitChain = p.catch(() => {});
  return p;
}

/** 文生图：提交异步任务（排队）→ 轮询 → 下载 PNG */
export async function genImage(prompt: string, size = '1440*810', model = 'wan2.2-t2i-flash'): Promise<Buffer> {
  if (!KEY()) throw new Error('缺少 DASHSCOPE_API_KEY，无法生成美术');
  const taskId = await submitImage(prompt, size, model);
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const j = await (await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, { headers: { Authorization: `Bearer ${KEY()}` } })).json();
    const st = j.output?.task_status;
    if (st === 'SUCCEEDED') {
      const url = (j.output.results || []).map((x: any) => x.url).filter(Boolean)[0];
      if (!url) throw new Error('文生图无结果');
      return Buffer.from(await (await fetch(url)).arrayBuffer());
    }
    if (st === 'FAILED') throw new Error(`文生图失败：${JSON.stringify(j.output).slice(0, 200)}`);
  }
  throw new Error('文生图超时');
}

const sharp = async () => (await import('sharp')).default;

/** 绿幕抠图：背景色从四角采样，接近背景且偏绿的像素透明，边缘半透明并压掉绿色溢出 */
export async function chromaKey(input: Buffer, width = 720): Promise<Buffer> {
  const S = await sharp();
  const { data, info } = await S(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels } = info;
  const sample = (x0: number, y0: number) => { let r = 0, g = 0, b = 0, n = 0; for (let y = y0; y < y0 + 12; y++) for (let x = x0; x < x0 + 12; x++) { const o = (y * W + x) * channels; r += data[o]; g += data[o + 1]; b += data[o + 2]; n++; } return [r / n, g / n, b / n]; };
  const corners = [sample(4, 4), sample(W - 16, 4), sample(4, H - 16), sample(W - 16, H - 16)];
  const bg = corners.reduce((a, c) => [a[0] + c[0] / 4, a[1] + c[1] / 4, a[2] + c[2] / 4], [0, 0, 0]);
  const HARD = 48, SOFT = 90;
  for (let i = 0; i < W * H; i++) {
    const o = i * channels; const r = data[o], g = data[o + 1], b = data[o + 2];
    const d = Math.sqrt((r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2);
    const greenish = g > r + 10 && g > b + 10;
    if (d < HARD && greenish) { data[o + 3] = 0; continue; }
    if (d < SOFT && greenish) { data[o + 3] = Math.round(data[o + 3] * (d - HARD) / (SOFT - HARD)); data[o + 1] = Math.round((g + Math.max(r, b)) / 2); }
  }
  return S(data, { raw: { width: W, height: H, channels } }).png({ compressionLevel: 9 }).resize({ width }).toBuffer();
}

export async function toJpeg(input: Buffer, quality = 82): Promise<Buffer> { const S = await sharp(); return S(input).jpeg({ quality }).toBuffer(); }

/**
 * 生成的图片放 Supabase Storage 的公开桶 lab-art（线上是无状态部署，写 public/ 既不持久也不会进 git）；
 * 返回公开 URL。没有 Supabase 时回退到本地 public/lab/gen/（仅开发用）。
 */
export const LAB_ART_BUCKET = 'lab-art';
const GEN_DIR = path.join(process.cwd(), 'public', 'lab', 'gen');
let bucketReady: Promise<void> | null = null;
async function ensureBucket() {
  if (!bucketReady) bucketReady = (async () => {
    const { supabaseAdmin } = await import('@/lib/supabase');
    const { data } = await supabaseAdmin.storage.getBucket(LAB_ART_BUCKET);
    if (!data) { const { error } = await supabaseAdmin.storage.createBucket(LAB_ART_BUCKET, { public: true, fileSizeLimit: '20MB' }); if (error && !/already exists/i.test(error.message)) throw error; }
  })().catch(e => { bucketReady = null; throw e; });
  return bucketReady;
}
export async function uploadLabAsset(buf: Buffer, name: string, contentType: string): Promise<string> {
  const { supabaseAdmin } = await import('@/lib/supabase');
  await ensureBucket();
  const safe = name.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const { error } = await supabaseAdmin.storage.from(LAB_ART_BUCKET).upload(safe, buf, { contentType, upsert: true, cacheControl: '31536000' });
  if (error) throw new Error(`上传美术失败：${error.message}`);
  return supabaseAdmin.storage.from(LAB_ART_BUCKET).getPublicUrl(safe).data.publicUrl;
}
export async function saveLabAsset(buf: Buffer, name: string): Promise<string> {
  const safe = name.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const type = safe.endsWith('.png') ? 'image/png' : 'image/jpeg';
  try { return await uploadLabAsset(buf, safe, type); }
  catch (e) {
    if (process.env.NODE_ENV === 'production') throw e;
    console.warn('[lab-art] 上传 Storage 失败，回退本地：', (e as any)?.message);
    await fs.mkdir(GEN_DIR, { recursive: true });
    await fs.writeFile(path.join(GEN_DIR, safe), buf);
    return `/lab/gen/${safe}`;
  }
}

/** 场景底图（16:9 jpg） */
export async function makeSceneAsset(prompt: string, name: string): Promise<string> {
  return saveLabAsset(await toJpeg(await genImage(prompt, '1440*810')), `${name}.jpg`);
}
/** NPC 立绘：绿幕生成 → 抠图 → 透明 png */
export async function makeNpcAsset(prompt: string, name: string): Promise<string> {
  const full = `半写实插画风格的游戏NPC立绘，${prompt}，正面略侧的半身像，人物完整不裁切，纯正绿色平涂背景，背景没有任何阴影和渐变，没有文字，没有logo，竖构图`;
  return saveLabAsset(await chromaKey(await genImage(full, '900*1440')), `${name}.png`);
}

// ──────────────────────────────────────────────
// 美术图库：生成过的底图与立绘登记进 lab_art_assets，领域相近的下一个空间直接复用。
// 匹配 = kind + family（一级领域）+ slot（场景位 / 人物角色）。
// 同一组合攒够 POOL 张之后就只复用、不再新生成——既不浪费，也不至于所有空间长一张脸。
// ──────────────────────────────────────────────
export const ART_POOL = 3;

/** 一级领域：固定这几个，让「会计 ↔ 精算」「咖啡师 ↔ 调酒师」这种相近职业能落到同一桶里 */
export const ART_FAMILIES = ['制造与工程', '餐饮零售', '医疗健康', '教育培训', '金融财会', '互联网与科技', '建筑与土木', '交通与物流', '农业与食品', '文化创意', '公共服务', '其他'] as const;

export interface ArtAsset { kind: 'scene' | 'npc'; family: string; slot: string; domain?: string; profession?: string; prompt?: string; url: string }

/** 库里找一张能直接用的：同组合够 POOL 张就随机给一张，不够就返回 null（让调用方去生成新的） */
export async function findArtAsset(kind: 'scene' | 'npc', family: string, slot: string): Promise<string | null> {
  // 场景不复用。地点感太强了：同样归在「餐饮零售 / 门店」，酒吧吧台和宠物店完全是两回事——
  // 省下那几张图的钱，换来一个「给狗护理却坐在酒吧里」，不划算。
  // 人物立绘不一样：一位穿工装的带教师傅放在哪个厂里都成立，继续复用。
  if (kind === 'scene') return null;
  // 「其他」是个垃圾桶：中控室、备料间、交接台都会落进去，当成同一类复用就是答非所问，宁可重生
  if (!family || !slot || slot === '其他') return null;
  try {
    const { supabaseAdmin } = await import('@/lib/supabase');
    const { data } = await supabaseAdmin.from('lab_art_assets').select('id, url, uses').eq('kind', kind).eq('family', family).eq('slot', slot).limit(ART_POOL + 5);
    if (!data || data.length < ART_POOL) return null;
    const hit = data[Math.floor(Math.random() * data.length)];
    await supabaseAdmin.from('lab_art_assets').update({ uses: (hit.uses || 1) + 1 }).eq('id', hit.id);
    return hit.url;
  } catch (e) { console.warn('[lab-art] 查图库失败，改为新生成：', (e as any)?.message); return null; }
}

/** 新生成的登记进库（失败不影响构建） */
export async function registerArtAsset(a: ArtAsset): Promise<void> {
  if (!a.url || !a.family || !a.slot) return;
  try {
    const { supabaseAdmin } = await import('@/lib/supabase');
    await supabaseAdmin.from('lab_art_assets').upsert({ kind: a.kind, family: a.family, slot: a.slot, domain: a.domain || '', profession: a.profession || '', prompt: (a.prompt || '').slice(0, 2000), url: a.url }, { onConflict: 'url' });
  } catch (e) { console.warn('[lab-art] 登记图库失败：', (e as any)?.message); }
}

/** 先查库、没有再生成并登记 */
export async function sceneAssetReusing(prompt: string, name: string, meta: { family: string; slot: string; domain?: string; profession?: string }): Promise<{ url: string; reused: boolean }> {
  const hit = await findArtAsset('scene', meta.family, meta.slot);
  if (hit) return { url: hit, reused: true };
  const url = await makeSceneAsset(prompt, name);
  await registerArtAsset({ kind: 'scene', ...meta, prompt, url });
  return { url, reused: false };
}

export async function npcAssetReusing(prompt: string, name: string, meta: { family: string; slot: string; domain?: string; profession?: string }): Promise<{ url: string; reused: boolean }> {
  const hit = await findArtAsset('npc', meta.family, meta.slot);
  if (hit) return { url: hit, reused: true };
  const url = await makeNpcAsset(prompt, name);
  await registerArtAsset({ kind: 'npc', ...meta, prompt, url });
  return { url, reused: false };
}
