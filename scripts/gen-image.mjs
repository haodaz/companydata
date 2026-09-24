/**
 * 阿里云 DashScope 文生图（通义万相）：为技能空间的虚拟工位生成场景底图（密钥从本仓库或同级 programcrawler 的 .env.local 读取）。
 *   node scripts/gen-image.mjs <输出文件> "<提示词>" [--size=1664*928] [--model=wan2.2-t2i-flash] [--n=1]
 * 异步提交 → 轮询 → 下载 PNG。
 */
import fs from 'fs';
import path from 'path';

const env = Object.fromEntries(
  [new URL('../.env.local', import.meta.url), new URL('../../programcrawler/.env.local', import.meta.url)].filter(u => fs.existsSync(u)).map(u => fs.readFileSync(u, 'utf8')).join('\n')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const KEY = env.DASHSCOPE_API_KEY;
if (!KEY) { console.error('缺少 DASHSCOPE_API_KEY'); process.exit(1); }

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const [k, v = '1'] = a.slice(2).split('='); return [k, v]; }));
const rest = args.filter(a => !a.startsWith('--'));
const [out, prompt] = rest;
if (!out || !prompt) { console.error('用法：node scripts/gen-image.mjs <输出文件> "<提示词>"'); process.exit(1); }

const MODEL = flags.model || 'wan2.2-t2i-flash';
const SIZE = flags.size || '1664*928';
const N = Number(flags.n || 1);
const NEG = flags.negative || '文字, 字母, 水印, logo, 低清, 噪点, 畸变, 杂乱, 暗色背景, 真人照片';

const submit = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis', {
  method: 'POST',
  headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'X-DashScope-Async': 'enable' },
  body: JSON.stringify({
    model: MODEL,
    input: { prompt, negative_prompt: NEG },
    parameters: { size: SIZE, n: N, prompt_extend: true, watermark: false },
  }),
});
const sub = await submit.json();
if (!submit.ok || !sub.output?.task_id) { console.error('提交失败：', JSON.stringify(sub).slice(0, 500)); process.exit(1); }
const taskId = sub.output.task_id;
console.log(`已提交 ${MODEL} · task ${taskId}`);

const sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 90; i++) {
  await sleep(3000);
  const r = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, { headers: { Authorization: `Bearer ${KEY}` } });
  const j = await r.json();
  const st = j.output?.task_status;
  if (st === 'SUCCEEDED') {
    const urls = (j.output.results || []).map(x => x.url).filter(Boolean);
    if (!urls.length) { console.error('无结果：', JSON.stringify(j).slice(0, 400)); process.exit(1); }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    for (let k = 0; k < urls.length; k++) {
      const file = urls.length > 1 ? out.replace(/(\.\w+)$/, `_${k + 1}$1`) : out;
      const buf = Buffer.from(await (await fetch(urls[k])).arrayBuffer());
      fs.writeFileSync(file, buf);
      console.log(`✅ ${file}  ${(buf.length / 1024).toFixed(0)}KB`);
    }
    process.exit(0);
  }
  if (st === 'FAILED') { console.error('生成失败：', JSON.stringify(j.output).slice(0, 400)); process.exit(1); }
  if (i % 4 === 0) console.log(`  …${st}`);
}
console.error('超时');
process.exit(1);
