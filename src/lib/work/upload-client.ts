/**
 * 候选人传交付文件（11-10 潜历：「多个附件传不上去，也删不掉已经传了的」）：
 * 以前文件整个经过我们的接口转存，Vercel 函数请求体上限 4.5MB，大一点的 PDF / 设计稿直接 413，报一句看不懂的 JSON 错。
 * 现在：接口只发一个签名地址 → 浏览器直传存储（上限 200MB）→ 再告诉接口登记。删除 = 记一条 file_remove，交卷时不算。
 */
export type WorkFile = { name: string; size: number; url: string; part?: string };

const api = (token: string, sid: string) => `/api/work/${token}/sessions/${sid}/upload`;
async function post(url: string, body: any) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ ok: false, error: `服务器没接住（${r.status}）` }));
  if (!j.ok) throw new Error(j.error || '没传上去');
  return j;
}

export async function uploadWorkFile(token: string, sid: string, f: File, extra: { t: number; part?: string }): Promise<WorkFile> {
  if (f.size > 200 * 1024 * 1024) throw new Error('太大了（上限 200MB）');
  const sign = await post(api(token, sid), { step: 'sign', name: f.name, size: f.size });
  const fd = new FormData(); fd.append('cacheControl', '3600'); fd.append('', f);
  const r = await fetch(sign.signed_url, { method: 'PUT', body: fd, headers: { 'x-upsert': 'true' } });
  if (!r.ok) throw new Error(`存储没收下（${r.status}）`);
  const j = await post(api(token, sid), { step: 'done', path: sign.path, name: f.name, size: f.size, type: f.type, t: extra.t, part: extra.part || '' });
  return { name: j.name, size: j.size, url: j.url, part: extra.part || '' };
}

export async function removeWorkFile(token: string, sid: string, url: string, t: number) {
  await post(api(token, sid), { step: 'remove', url, t });
}
