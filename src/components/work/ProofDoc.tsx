'use client';

/**
 * 作品存档 / 作品核验共用的一页（11-13 潜历 043）：候选人姓名、哪道任务、分数、任务书、交付原文、附件，底部核验码 + 二维码 + 交付原文指纹。
 * archive：候选人自己存的那份（可打印成 PDF）；verify：别人扫码打开的只读原件，多一个「粘贴原文核对」。数据都来自 /api/work/verify/<核验码>。
 */
import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { WorkLogo } from '@/components/work/WorkLogo';
import { MdView } from '@/components/work/WorkText';
import { pick, type Lang } from '@/lib/work/i18n';

export type Proof = { code: string; scale: string; task: { title: string; company: string; role: string; lang: Lang; brief: string; deliverables: { id: string; title: string; format: string }[] }; who: string; started_at: string; submitted_at: string; score: number | null; result_total: number | null; ai_use: number | null; deliverable: string; fingerprint: string; files: { name: string; url: string; size: number }[] };

const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const sha256 = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))).map(b => b.toString(16).padStart(2, '0')).join('');

export function ProofDoc({ p, mode, actions }: { p: Proof; mode: 'archive' | 'verify'; actions?: React.ReactNode }) {
  const lang = p.task.lang; const L = (zh: string, en: string) => pick(lang, zh, en);
  const url = typeof location !== 'undefined' ? `${location.origin}/work/verify/${p.code}` : '';
  const [qr, setQr] = useState('');
  useEffect(() => { if (url) QRCode.toDataURL(url, { margin: 1, width: 180 }).then(setQr).catch(() => {}); }, [url]);
  const [paste, setPaste] = useState(''); const [hit, setHit] = useState<boolean | null>(null);
  useEffect(() => { if (!paste) { setHit(null); return; } sha256(paste).then(h => setHit(h === p.fingerprint)); }, [paste, p.fingerprint]);
  const when = new Date(p.submitted_at || p.started_at);
  const date = when.toLocaleString(lang === 'en' ? 'en-US' : 'zh-CN', { hour12: false });
  const fp = p.fingerprint.match(/.{1,8}/g)?.join(' ') || '';
  // 交卷时平台把附件读成文字拼在后面（「## 交付文件」起）：一大张表打进 PDF 太长，折叠起来；指纹仍按整段原文算
  const cut = p.deliverable.search(/^#{2,3} (交付文件|Submitted files)/m);
  const own = cut >= 0 ? p.deliverable.slice(0, cut) : p.deliverable, read = cut >= 0 ? p.deliverable.slice(cut).trim() : '';
  return (
    <div className="pd-bg">
      <style>{CSS}</style>
      {actions && <div className="pd-actions">{actions}</div>}
      <div className="pd-doc">
        {mode === 'verify' && <div className="pd-ok">{L('这是百业AI｜真活平台存的原件，作答人改不了。拿到的作品存档和这里对不上，以这里为准。', 'This is the original kept by the platform; the candidate cannot change it. If a saved copy differs from this page, this page is authoritative.')}</div>}
        <div className="pd-top"><WorkLogo size="md" href={null} /><span className="pd-kind">{mode === 'verify' ? L('作品核验', 'WORK VERIFICATION') : L('真活作品存档', 'WORK SAMPLE ARCHIVE')}</span></div>
        <div className="pd-name">{p.who || L('作答人', 'Candidate')}</div>
        <div className="pd-task">{L('完成了一道真活：', 'Completed a work sample: ')}<b>{p.task.title}</b></div>
        <div className="pd-meta">{[p.task.company, p.task.role].filter(Boolean).join(' · ')} · {L('交卷于', 'Submitted')} {date}</div>
        {p.score != null && <div className="pd-score">{p.scale === 'ai_use' ? L('AI 使用与交互', 'AI use and interaction') : L('得分', 'Score')} <b>{p.score}</b> / 100{p.scale !== 'ai_use' && p.ai_use != null ? <span>　{L('AI 使用', 'AI use')} {p.ai_use} / 100</span> : null}</div>}

        <div className="pd-sec"><div className="pd-h">{L('任务书', 'The task')}</div><MdView text={p.task.brief} style={{ fontSize: 13.5, lineHeight: 1.75 }} />
          {!!p.task.deliverables.length && <ol className="pd-dl">{p.task.deliverables.map(d => <li key={d.id}><b>{d.title}</b> <span>{d.format}</span></li>)}</ol>}</div>
        <div className="pd-sec"><div className="pd-h">{L('交付原文', 'Submitted work')}</div>{own.trim() ? <MdView text={own} style={{ fontSize: 13.5, lineHeight: 1.75 }} /> : <div className="pd-mute">{L('（没有文字交付，见附件）', '(No text submitted; see files)')}</div>}
          {read && <details className="pd-read"><summary>{L('平台从附件里读出的文字（以原文件为准，指纹也算在内）', 'Text the platform read from the files (the original files prevail; included in the fingerprint)')}</summary><pre>{read}</pre></details>}</div>
        {!!p.files.length && <div className="pd-sec"><div className="pd-h">{L('附件（平台存的原件）', 'Files (originals kept by the platform)')}</div><ul className="pd-files">{p.files.map(f => <li key={f.url}><a href={f.url} target="_blank" rel="noreferrer">{f.name}</a> <span>{kb(f.size)}</span></li>)}</ul></div>}

        <div className="pd-proof">
          {qr && <img src={qr} alt="" width={110} height={110} />}
          <div style={{ minWidth: 0 }}>
            <div><span className="pd-k">{L('核验码', 'Verification code')}</span><b>{p.code}</b></div>
            <div className="pd-url">{url}</div>
            <div style={{ marginTop: 6 }}><span className="pd-k">{L('交付原文指纹（SHA-256）', 'Fingerprint of the submitted text (SHA-256)')}</span></div>
            <code className="pd-fp">{fp}</code>
            <div className="pd-mute" style={{ marginTop: 6 }}>{L('扫码或打开上面的地址，能看到平台存的原件。原文改一个字，指纹就对不上。', 'Scan or open the link to see the original kept by the platform. Change a single character and the fingerprint no longer matches.')}</div>
          </div>
        </div>

        {mode === 'verify' && <div className="pd-sec pd-check"><div className="pd-h">{L('核对手里的版本', 'Check a copy you were given')}</div>
          <textarea value={paste} onChange={e => setPaste(e.target.value)} rows={4} placeholder={L('把手里那份的交付原文整段原样粘贴进来（含附件读出的文字）', 'Paste the full submitted text from your copy, unchanged (including the text read from files)')} />
          {hit != null && <div style={{ marginTop: 6, fontWeight: 700, color: hit ? '#12a150' : '#c0392b' }}>{hit ? L('一致：和平台存的原件一字不差', 'Match: identical to the original') : L('不一致：和平台存的原件有出入（也可能是复制时多了空格或换行，可以直接对照上面的原文）', 'No match: differs from the original (extra spaces or line breaks from copying can also cause this; compare with the text above)')}</div>}
        </div>}
      </div>
    </div>
  );
}

const CSS = `
.pd-bg { min-height: 100vh; background: #f4f5fa; padding: 28px 16px 60px; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; color: #1a1a2e; }
.pd-actions { max-width: 820px; margin: 0 auto 14px; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.pd-actions button, .pd-actions a { border: 1px solid #d8d4ff; background: #fff; color: #4c43c9; border-radius: 10px; padding: 8px 14px; font: inherit; font-size: 14px; cursor: pointer; text-decoration: none; }
.pd-doc { max-width: 820px; margin: 0 auto; background: #fff; border-radius: 16px; padding: 32px 40px; border: 1px solid #e8e9f0; }
.pd-ok { background: #effaf3; border: 1px solid #c7ecd5; color: #17703f; border-radius: 10px; padding: 8px 12px; font-size: 13px; margin-bottom: 16px; }
.pd-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
.pd-kind { font-size: 13px; letter-spacing: .3em; color: #6055f5; font-weight: 800; }
.pd-name { font-size: 28px; font-weight: 900; }
.pd-task { margin-top: 4px; font-size: 15px; color: #3b405a; }
.pd-meta { margin-top: 2px; font-size: 13px; color: #8a8ea3; }
.pd-score { margin-top: 12px; font-size: 14px; color: #555; } .pd-score b { font-size: 26px; color: #4c43c9; margin: 0 2px 0 6px; } .pd-score span { color: #8a8ea3; }
.pd-sec { border-top: 1px solid #f0f0f6; margin-top: 18px; padding-top: 14px; }
.pd-h { font-size: 12px; letter-spacing: .2em; color: #8a8ea3; font-weight: 700; margin-bottom: 8px; }
.pd-dl { margin: 10px 0 0; padding-left: 20px; font-size: 13px; line-height: 1.8; } .pd-dl span { color: #888; }
.pd-files { margin: 0; padding-left: 18px; font-size: 13.5px; line-height: 1.9; } .pd-files a { color: #4c43c9; } .pd-files span { color: #999; margin-left: 6px; }
.pd-proof { display: flex; gap: 16px; align-items: flex-start; margin-top: 22px; padding: 14px 16px; border: 1px dashed #d8d4ff; border-radius: 12px; background: #fafaff; font-size: 13px; }
.pd-k { color: #8a8ea3; margin-right: 8px; }
.pd-url { color: #4c43c9; font-size: 12.5px; word-break: break-all; margin-top: 2px; }
.pd-fp { display: block; font-family: ui-monospace, Menlo, monospace; font-size: 12px; color: #333; word-break: break-all; margin-top: 2px; }
.pd-mute { color: #999; font-size: 12.5px; }
.pd-read { margin-top: 10px; font-size: 12.5px; color: #777; } .pd-read summary { cursor: pointer; }
.pd-read pre { white-space: pre-wrap; word-break: break-all; max-height: 360px; overflow: auto; background: #fafafa; border: 1px solid #eee; border-radius: 8px; padding: 8px 10px; font-size: 11.5px; }
.pd-check textarea { width: 100%; box-sizing: border-box; border: 1px solid #dcdcea; border-radius: 10px; padding: 8px 10px; font: inherit; font-size: 13px; }
@media (max-width: 620px) { .pd-doc { padding: 22px 18px; } .pd-proof { flex-direction: column; } }
@media print { .pd-bg { background: #fff; padding: 0; } .pd-actions { display: none; } .pd-doc { border: 0; padding: 0; } .pd-proof { break-inside: avoid; } }
`;
