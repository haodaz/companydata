/** 《填表出题》补录：预览做题台（直接跳到候选人页，带密钥）→ 回到空间点发布。OWNER_URL=<待发布那道题的空间链接> */
import fs from 'node:fs';
import { run, BASE, cover } from './_rec-helpers.mjs';
const TOKEN = fs.readFileSync(process.env.TOKEN_FILE, 'utf8').trim();
const OWNER = process.env.OWNER_URL; const PREVIEW = OWNER.replace('/owner', '');
export default [
  { cookie: { name: 'auth_token', value: TOKEN, url: BASE } },
  { pause: true }, { go: OWNER, wait: 7000 }, { eval: run(`await L.until(() => document.body.innerText.includes('参与链接'), 30000); scrollTo(0, 0); await L.sleep(500); return 1;`), timeout: 40 }, { resume: true },
  { note: 'space_preview' }, { eval: run(`const b = L.btn(/预览做题台/); await L.flash(b, 1200); await L.sleep(600); return 1;`), timeout: 20 },
  { go: PREVIEW, wait: 6000 }, { eval: run(`await L.until(() => document.body.innerText.includes('出题人预览'), 20000); await L.sleep(3500); await L.glide(520, 2000); await L.sleep(3000); return 1;`), timeout: 40 },
  { pause: true }, { go: OWNER, wait: 7000 }, { eval: run(`await L.until(() => L.btn(/^发布$/), 30000); scrollTo(0, 0); await L.sleep(500); return 1;`), timeout: 40 }, { resume: true },
  { note: 'space_publish' }, { eval: run(`const b = L.btn(/^发布$/); await L.flash(b, 900); b.click(); await L.until(() => L.btn(/复制参与链接/), 20000); await L.sleep(1200); await L.flash(L.btn(/复制参与链接/), 1200); await L.sleep(3500); return 1;`), timeout: 60 },
];
