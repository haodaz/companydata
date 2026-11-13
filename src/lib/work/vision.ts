/**
 * 图片附件解析（2026-10-25，王刚：起码给 AI 形容这是个什么图）：上传题目素材里的图片时，用视觉模型写一段说明——
 * 是什么图（报表 / 图纸 / 截图 / 流程图）、里面有什么数据和结构、关键数字、可能的坑。说明随附件进材料包，出题、评卷、候选人端 AI 都能读；候选人看图也看说明。
 * 先 Claude Sonnet（视觉），不可用退 OpenAI；都不行就返回空串（只剩文件名）。
 */
import Anthropic from '@anthropic-ai/sdk';
import { logTokenUsage } from '@/lib/token-logger';

const PROMPT = '这是一道考核题要发给候选人的素材图。请用中文写一段 150–400 字的说明，让没看到图的人也能用它做题：1）这是什么图（报表 / 图纸 / 截图 / 流程图 / 照片…）；2）里面有哪些区块、表头、字段、单位；3）关键数字逐条列出（看得清的都列，带单位和所属项）；4）图上的备注、脚注、口径说明；5）看起来可疑或口径不一致的地方。只描述，不下结论，不编造看不清的数字。';

type Media = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
/** 长截图切段（11-13 潜历：手机长图 780×10090 超过 Claude 单图 8000 像素上限，整张失败；就算不超，长边也会被压到 1568，字看不清）。
 * 高宽比 > 2 的从上到下切成若干段（每段约 1.4 倍宽，最多 10 段），转 JPEG；其余原样 */
async function tiles(buf: Buffer, mime: string): Promise<{ b64: string; media: Media }[]> {
  const media = (/^image\/(png|jpeg|gif|webp)$/.test(mime) ? mime : 'image/png') as Media;
  try {
    const sharp = (await import('sharp')).default;
    const { width: w = 0, height: h = 0 } = await sharp(buf).metadata();
    if (w && h && (h / w > 2 || h > 7800 || buf.length > 4_500_000)) {
      const tw = Math.min(w, 1280), scale = tw / w, H = Math.round(h * scale);
      const img = await sharp(buf).resize({ width: tw }).toBuffer();
      const step = Math.max(Math.round(tw * 1.4), Math.ceil(H / 10));
      const out: { b64: string; media: Media }[] = [];
      for (let top = 0; top < H; top += step) out.push({ b64: (await sharp(img).extract({ left: 0, top, width: tw, height: Math.min(step, H - top) }).jpeg({ quality: 85 }).toBuffer()).toString('base64'), media: 'image/jpeg' });
      return out;
    }
  } catch (e) { console.warn('[vision] 切图失败，按原图：', String((e as any)?.message).slice(0, 100)); }
  return [{ b64: buf.toString('base64'), media }];
}

export async function describeImage(buf: Buffer, mime: string, name = '', prompt = PROMPT): Promise<string> {
  const parts = await tiles(buf, mime);
  const note = parts.length > 1 ? `\n（这是一张长图，按从上到下切成了 ${parts.length} 段，请当成一张图来写）` : '';
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const res = await client.messages.create({ model: 'claude-sonnet-5-5', max_tokens: parts.length > 1 ? 1600 : 900, messages: [{ role: 'user', content: [...parts.map(p => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: p.media, data: p.b64 } })), { type: 'text', text: `${prompt}${note}${name ? `\n文件名：${name}` : ''}` }] }] });
      const text = res.content.map(c => (c.type === 'text' ? c.text : '')).join('').trim();
      await logTokenUsage({ tool_name: 'work', task_name: 'Attach · 看图写说明', model_id: 'claude-sonnet-5-5', usageMetadata: { promptTokenCount: res.usage?.input_tokens, candidatesTokenCount: res.usage?.output_tokens } } as any).catch(() => {});
      if (text) return text;
    } catch (e) { console.warn('[vision] claude 失败：', String((e as any)?.message).slice(0, 120)); }
  }
  if (process.env.OPENAI_API_KEY) {
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60000),
        body: JSON.stringify({ model: process.env.VISION_MODEL_OPENAI || 'gpt-5.6-luna', messages: [{ role: 'user', content: [...parts.map(p => ({ type: 'image_url', image_url: { url: `data:${p.media};base64,${p.b64}` } })), { type: 'text', text: prompt + note }] }], max_completion_tokens: parts.length > 1 ? 1600 : 900 }) });
      const j = await r.json(); const text = j.choices?.[0]?.message?.content?.trim();
      if (text) return text;
      console.warn('[vision] openai 空回复：', JSON.stringify(j).slice(0, 160));
    } catch (e) { console.warn('[vision] openai 失败：', String((e as any)?.message).slice(0, 120)); }
  }
  return '';
}

/** 读 PDF 原件（11-10 潜历：WorkBuddy 导出的 PDF 是图片型，抽不出文字，报告说「没读到上传的文件」）：
 * 抽不出文字的 PDF 整份交给 Claude 看（它按页看图），转写成 Markdown——标题、要点、表格、图里的文字和数字。最多 100 页 / 30MB。 */
export async function readPdfVisually(buf: Buffer, name = '', maxChars = 12000): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY || buf.length > 30_000_000) return '';
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({ model: 'claude-sonnet-5-5', max_tokens: 8000, messages: [{ role: 'user', content: [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } } as any,
      { type: 'text', text: `这是候选人做一道考核任务交上来的文件${name ? `《${name}》` : ''}。请把它的内容转写成 Markdown，给评卷的人读：按页 / 按章节保留标题、要点、结论、表格（用 Markdown 表，数字照抄）、图和画布里的文字与连线关系（用一两句话说清画的是什么）。只转写看到的，不评价、不补充；看不清的写「看不清」。超过 ${Math.round(maxChars / 1000)}k 字就压缩次要段落，结论和数字保留。` },
    ] }] });
    await logTokenUsage({ tool_name: 'work', task_name: 'Grade · 读 PDF 原件', model_id: 'claude-sonnet-5-5', usageMetadata: { promptTokenCount: res.usage?.input_tokens, candidatesTokenCount: res.usage?.output_tokens } } as any).catch(() => {});
    return res.content.map(c => (c.type === 'text' ? c.text : '')).join('').trim().slice(0, maxChars);
  } catch (e) { console.warn('[vision] PDF 没读出来：', String((e as any)?.message).slice(0, 160)); return ''; }
}
