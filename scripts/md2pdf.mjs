import fs from 'fs'; import puppeteer from 'puppeteer-core';
const [src, out] = process.argv.slice(2);
const md = fs.readFileSync(src, 'utf8').replace(/\r/g, '');
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const inline = s => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/(https?:\/\/[^\s|）)]+)/g, '<a href="$1">$1</a>');
const lines = md.split('\n'); let html = ''; let i = 0; let list = null;
const flush = () => { if (list) { html += `</${list}>`; list = null; } };
while (i < lines.length) {
  const l = lines[i];
  if (/^\|/.test(l) && /^\|?\s*:?-{2,}/.test(lines[i + 1] || '')) { flush(); const cells = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()); const head = cells(l); i += 2; const rows = []; while (i < lines.length && /^\|/.test(lines[i])) { rows.push(cells(lines[i])); i++; } html += `<table><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`; continue; }
  const h = /^(#{1,3})\s+(.*)/.exec(l); const ul = /^\s*[-*]\s+(.*)/.exec(l); const ol = /^\s*\d+[.)]\s+(.*)/.exec(l);
  if (h) { flush(); html += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`; }
  else if (ul) { if (list !== 'ul') { flush(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(ul[1])}</li>`; }
  else if (ol) { if (list !== 'ol') { flush(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(ol[1])}</li>`; }
  else if (!l.trim()) { flush(); }
  else { flush(); html += `<p>${inline(l)}</p>`; }
  i++;
}
flush();
const page = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
body{font-family:-apple-system,"PingFang SC","Helvetica Neue",sans-serif;color:#1a1a2e;font-size:12.5px;line-height:1.7;margin:0;padding:36px 44px}
h1{font-size:22px;margin:0 0 4px}h1+p{color:#6b7280}h2{font-size:15px;margin:22px 0 8px;padding-left:10px;border-left:4px solid #6055f5}h3{font-size:13.5px;margin:14px 0 6px}
p{margin:6px 0}ul,ol{margin:4px 0 8px;padding-left:20px}li{margin:3px 0}code{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;background:#f3f2ff;padding:1px 5px;border-radius:4px}
table{border-collapse:collapse;width:100%;font-size:11px;margin:8px 0 12px}th,td{border:1px solid #e5e7eb;padding:5px 7px;text-align:left;vertical-align:top;word-break:break-all}th{background:#f6f7fb}
a{color:#4c43c9;text-decoration:none}.eyebrow{font-size:11px;color:#8c8fa6;letter-spacing:.14em;margin-bottom:10px}
</style></head><body><div class="eyebrow">百业AI｜真活 · 平方智能 · 内部</div>${html}</body></html>`;
const tmp = out + '.html'; fs.writeFileSync(tmp, page);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const p = await b.newPage(); await p.goto('file://' + tmp, { waitUntil: 'networkidle0' });
await p.pdf({ path: out, format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '14mm', left: '10mm', right: '10mm' } });
await b.close(); fs.unlinkSync(tmp); console.log('pdf ok');
