/**
 * 图片附件解析（2026-10-25，王刚：起码给 AI 形容这是个什么图）：上传题目素材里的图片时，用视觉模型写一段说明——
 * 是什么图（报表 / 图纸 / 截图 / 流程图）、里面有什么数据和结构、关键数字、可能的坑。说明随附件进材料包，出题、评卷、候选人端 AI 都能读；候选人看图也看说明。
 * 先 Claude Sonnet（视觉），不可用退 OpenAI；都不行就返回空串（只剩文件名）。
 */
import Anthropic from '@anthropic-ai/sdk';
import { logTokenUsage } from '@/lib/token-logger';

const PROMPT = '这是一道考核题要发给候选人的素材图。请用中文写一段 150–400 字的说明，让没看到图的人也能用它做题：1）这是什么图（报表 / 图纸 / 截图 / 流程图 / 照片…）；2）里面有哪些区块、表头、字段、单位；3）关键数字逐条列出（看得清的都列，带单位和所属项）；4）图上的备注、脚注、口径说明；5）看起来可疑或口径不一致的地方。只描述，不下结论，不编造看不清的数字。';

export async function describeImage(buf: Buffer, mime: string, name = ''): Promise<string> {
  const b64 = buf.toString('base64');
  const media = (/^image\/(png|jpeg|gif|webp)$/.test(mime) ? mime : 'image/png') as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const res = await client.messages.create({ model: 'claude-sonnet-5-5', max_tokens: 900, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: media, data: b64 } }, { type: 'text', text: `${PROMPT}${name ? `\n文件名：${name}` : ''}` }] }] });
      const text = res.content.map(c => (c.type === 'text' ? c.text : '')).join('').trim();
      await logTokenUsage({ tool_name: 'work', task_name: 'Attach · 看图写说明', model_id: 'claude-sonnet-5-5', usageMetadata: { promptTokenCount: res.usage?.input_tokens, candidatesTokenCount: res.usage?.output_tokens } } as any).catch(() => {});
      if (text) return text;
    } catch (e) { console.warn('[vision] claude 失败：', String((e as any)?.message).slice(0, 120)); }
  }
  if (process.env.OPENAI_API_KEY) {
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60000),
        body: JSON.stringify({ model: process.env.VISION_MODEL_OPENAI || 'gpt-5.6-luna', messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: `data:${media};base64,${b64}` } }, { type: 'text', text: PROMPT }] }], max_completion_tokens: 900 }) });
      const j = await r.json(); const text = j.choices?.[0]?.message?.content?.trim();
      if (text) return text;
      console.warn('[vision] openai 空回复：', JSON.stringify(j).slice(0, 160));
    } catch (e) { console.warn('[vision] openai 失败：', String((e as any)?.message).slice(0, 120)); }
  }
  return '';
}
