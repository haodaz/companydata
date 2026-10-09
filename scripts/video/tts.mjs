// 旁白配音：qwen-tts（DashScope），音色 Serena（用户定的；一答演示片那套脚本默认是 Cherry），照 zhiji-yida/docs/video/tts.mjs。
// 用法：node scripts/video/tts.mjs <旁白.json> <输出目录>   （已有的段不重出；改了文字就删掉对应 wav 再跑）
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const ROOT = path.resolve(import.meta.dirname, '../..');
const KEY = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n').find(l => l.startsWith('DASHSCOPE_API_KEY=')).split('=')[1].trim().replace(/^"|"$/g, '');
const F = path.join(ROOT, 'node_modules', 'ffmpeg-static', 'ffmpeg');
const [NARR, OUT] = process.argv.slice(2);
const segs = JSON.parse(fs.readFileSync(NARR, 'utf8'));
fs.mkdirSync(OUT, { recursive: true });
const dur = (f) => { try { execFileSync(F, ['-i', f], { stdio: 'pipe' }); } catch (e) { const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(e.stderr.toString()); return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : 0; } return 0; };
const out = [];
for (const s of segs) {
  const f = path.join(OUT, `${s.id}.wav`);
  if (!fs.existsSync(f)) {
    const r = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation', {
      method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'qwen-tts', input: { text: s.text, voice: process.env.VOICE || 'Serena' } }),
    });
    const j = await r.json();
    const url = j.output?.audio?.url;
    if (!url) { console.log('fail', s.id, JSON.stringify(j).slice(0, 200)); continue; }
    fs.writeFileSync(f, Buffer.from(await (await fetch(url)).arrayBuffer()));
    await new Promise(r => setTimeout(r, Number(process.env.TTS_GAP || 1500)));   // 一分钟限流，别连着打；被限流就调大 TTS_GAP 再跑一遍（已生成的会跳过）
  }
  const d = dur(f); out.push({ id: s.id, dur: d });
  console.log(s.id, d.toFixed(2) + 's', s.text.length + '字');
}
fs.writeFileSync(path.join(OUT, 'durations.json'), JSON.stringify(out));
console.log('合计', out.reduce((a, b) => a + b.dur, 0).toFixed(1) + 's');
