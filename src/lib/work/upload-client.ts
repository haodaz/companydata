/**
 * 候选人传交付文件（11-10 潜历：「多个附件传不上去，也删不掉已经传了的」）：
 * 以前文件整个经过我们的接口转存，Vercel 函数请求体上限 4.5MB，大一点的 PDF / 设计稿直接 413，报一句看不懂的 JSON 错。
 * 现在：接口只发一个签名地址 → 浏览器直传存储（上限 200MB）→ 再告诉接口登记。删除 = 记一条 file_remove，交卷时不算。
 */
export type WorkFile = { name: string; size: number; url: string; part?: string; /** 11-26：AI 读不了 / 打不开时的提示（传完马上给） */ warn?: string };

const api = (token: string, sid: string) => `/api/work/${token}/sessions/${sid}/upload`;
// 11-19 潜历反馈「trace_jd_b.txt 没传上去：服务器没接住（403）」：同一场里另外 6 个文件都传上了，403 不是我们接口回的（接口的错都带 JSON），
// 多半是线路 / 防火墙偶发拦了一下。接口和存储都自动再试两次（隔 1.5 / 4 秒）；真不行再报一句人话。
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
async function post(url: string, body: any) {
  let last = '';
  for (let k = 0; k < 3; k++) {
    if (k) await wait(k === 1 ? 1500 : 4000);
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(e => { last = `网络断了（${String(e?.message || e).slice(0, 60)}）`; return null; });
    if (!r) continue;
    const j = await r.json().catch(() => null);
    if (j) { if (!j.ok) throw new Error(j.error || '没传上去'); return j; }
    last = `服务器没接住（${r.status}）`;
    if (r.status < 500 && r.status !== 403 && r.status !== 429) break;
  }
  throw new Error(`${last}，已自动重试 2 次。刷新页面再传一次；还不行请截图告诉发链接的人`);
}

export async function uploadWorkFile(token: string, sid: string, f: File, extra: { t: number; part?: string }): Promise<WorkFile> {
  if (f.size > 200 * 1024 * 1024) throw new Error('太大了（上限 200MB）');
  const sign = await post(api(token, sid), { step: 'sign', name: f.name, size: f.size });
  const fd = new FormData(); fd.append('cacheControl', '3600'); fd.append('', f);
  let r: Response | null = null;
  for (let k = 0; k < 3 && !r?.ok; k++) { if (k) await wait(k === 1 ? 1500 : 4000); r = await fetch(sign.signed_url, { method: 'PUT', body: fd, headers: { 'x-upsert': 'true' } }).catch(() => null); }
  if (!r?.ok) throw new Error(`存储没收下（${r?.status ?? '网络断了'}），已自动重试 2 次。刷新页面再传一次`);
  const j = await post(api(token, sid), { step: 'done', path: sign.path, name: f.name, size: f.size, type: f.type, t: extra.t, part: extra.part || '' });
  return { name: j.name, size: j.size, url: j.url, part: extra.part || '', ...(j.warn ? { warn: j.warn } : {}) };
}

export async function removeWorkFile(token: string, sid: string, url: string, t: number) {
  await post(api(token, sid), { step: 'remove', url, t });
}
