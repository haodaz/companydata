/**
 * 技能空间的美术生成（服务端）：通义万相文生图 → 场景底图（jpg）/ NPC 立绘（绿幕抠成透明 png）。
 * 生成的文件落在 public/lab/gen/（已 gitignore），页面用 /lab/gen/<name> 引用。
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const KEY = () => process.env.DASHSCOPE_API_KEY || '';
const NEG = '文字, 字母, 水印, logo, 低清, 噪点, 畸变, 杂乱, 真人照片';

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

const GEN_DIR = path.join(process.cwd(), 'public', 'lab', 'gen');
export async function saveLabAsset(buf: Buffer, name: string): Promise<string> {
  await fs.mkdir(GEN_DIR, { recursive: true });
  const safe = name.replace(/[^a-zA-Z0-9_.-]/g, '_');
  await fs.writeFile(path.join(GEN_DIR, safe), buf);
  return `/lab/gen/${safe}`;
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
