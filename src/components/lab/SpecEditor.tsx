'use client';

/**
 * 百业工厂 · 生成要求编辑（新建空间第二层、工作室「生成要求」共用）：预设 + 给谁看 / 要多深 / 考核多难 / 必须放进去 / 不要 + 参考资料（粘贴或传文件抽文字）。
 * 都是自然语言；存进空间 jd_snapshot.spec，后面每一步生成都读（src/lib/lab-spec.ts）。
 */
import React, { useState } from 'react';
import { App } from 'antd';
import { PRESETS, type GenSpec, type SpecRef } from '@/lib/lab-spec';

export function SpecEditor({ spec, setSpec }: { spec: GenSpec; setSpec: React.Dispatch<React.SetStateAction<GenSpec>> }) {
  const { message } = App.useApp();
  const [uploading, setUploading] = useState(false);
  const [refText, setRefText] = useState('');
  const addFile = async (f: File) => {
    setUploading(true);
    const b64 = await new Promise<string>(res => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.readAsDataURL(f); });
    const j = await (await fetch('/api/lab/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: f.name, file: b64 }) })).json().catch(() => ({ ok: false, error: '没传上' }));
    setUploading(false);
    if (!j.ok) { message.error(j.error); return; }
    setSpec(s => ({ ...s, refs: [...(s.refs || []), { name: j.name, text: j.text }].slice(0, 6) }));
    if (j.truncated) message.info('资料比较长，只取了前 12000 字');
  };
  const addRefText = () => { if (refText.trim().length < 20) return; setSpec(s => ({ ...s, refs: [...(s.refs || []), { name: `粘贴的资料 ${(s.refs?.length || 0) + 1}`, text: refText.trim() }].slice(0, 6) })); setRefText(''); };
  return <>
        <div className="sp-glabel">先点一个最接近的，再改</div>
        <div className="sp-presets">{PRESETS.map(p => <button key={p.key} className={spec.preset === p.label ? 'on' : ''} onClick={() => setSpec(s => ({ ...s, ...p.spec, preset: p.label }))}>{p.label}</button>)}</div>
        <Field label="给谁看" hint="年龄 / 阶段、对这一行了解多少、看完要得到什么" value={spec.audience} onChange={v => setSpec(s => ({ ...s, audience: v }))} placeholder="如：高中生，还没选专业，想知道这一行每天在干什么、适不适合自己" />
        <Field label="要多深" hint="职业讲到哪一级、日常任务要普遍还是细分、术语怎么处理" value={spec.depth} onChange={v => setSpec(s => ({ ...s, depth: v }))} placeholder="如：讲到「程序员」这一级，最多分前端 / 后端；任务挑最普遍的；术语一出现就解释" />
        <Field label="考核多难" hint="操作要不要精准、评分看什么、红线留多少" value={spec.difficulty} onChange={v => setSpec(s => ({ ...s, difficulty: v }))} placeholder="如：看懂、方向对、说得出理由就算过；工位大致在合理范围就给分，不要求每一步精准" />
        <Field label="必须放进去的" hint="某个场景、设备、流程、某段文案、某个人物" value={spec.must} onChange={v => setSpec(s => ({ ...s, must: v }))} placeholder="如：要有一次和产品经理对需求的场景；工位用真实的代码评审界面" />
        <Field label="不要的" value={spec.avoid} onChange={v => setSpec(s => ({ ...s, avoid: v }))} placeholder="如：不要加班熬夜的桥段；不要出现具体公司名" />
        <div className="sp-glabel" style={{ marginTop: 14 }}>参考资料<small>照着它的场景、流程、说法来（不会照抄成题目）</small></div>
        {(spec.refs || []).map((r: SpecRef, i) => <div key={i} className="sp-ref"><b>📎 {r.name}</b><span>{r.text.length} 字</span><button onClick={() => setSpec(s => ({ ...s, refs: (s.refs || []).filter((_, k) => k !== i) }))}>移除</button></div>)}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <textarea className="lab-input sp-in" rows={2} value={refText} onChange={e => setRefText(e.target.value)} placeholder="粘贴一段资料：课程大纲、岗位说明、操作规程、你们自己的生涯课讲义……" style={{ flex: '1 1 300px', resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="lab-btn ghost sm" disabled={refText.trim().length < 20} onClick={addRefText}>加进去</button>
            <label className="lab-btn ghost sm" style={{ cursor: 'pointer' }}>{uploading ? '读取中…' : '传文件'}<input type="file" accept=".pdf,.docx,.txt,.md" style={{ display: 'none' }} disabled={uploading} onChange={e => { const f = e.target.files?.[0]; if (f) addFile(f); e.target.value = ''; }} /></label>
          </div>
        </div>
  </>;
}

function Field({ label, hint, value, onChange, placeholder }: { label: string; hint?: string; value?: string; onChange: (v: string) => void; placeholder: string }) {
  return <label className="sp-field"><span>{label}{hint && <small>{hint}</small>}</span><textarea className="lab-input sp-in" rows={2} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} /></label>;
}

export const SPEC_CSS = `
.sp-glabel { font-size: 12.5px; color: var(--ink3); margin-bottom: 8px; font-weight: 600; } .sp-glabel small { font-weight: 500; margin-left: 8px; }
.sp-presets { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
.sp-presets button { border: 1px solid var(--line); background: rgba(255,255,255,.7); border-radius: 999px; padding: 6px 14px; font: inherit; font-size: 13.5px; color: var(--ink2); cursor: pointer; }
.sp-presets button.on { background: var(--v); border-color: var(--v); color: #fff; font-weight: 700; }
.sp-in { width: 100%; padding: 10px 13px; border-radius: 12px; border: 1px solid var(--line); font-size: 14px; line-height: 1.65; box-sizing: border-box; }
.sp-field { display: grid; gap: 5px; margin-bottom: 12px; }
.sp-field > span { font-size: 14px; font-weight: 700; } .sp-field small { font-size: 12px; color: var(--ink3); font-weight: 500; margin-left: 8px; }
.sp-field textarea { resize: vertical; }
.sp-ref { display: flex; gap: 10px; align-items: center; font-size: 13.5px; padding: 6px 0; } .sp-ref span { color: var(--ink3); font-size: 12px; }
.sp-ref button { margin-left: auto; border: 0; background: none; color: var(--ink3); cursor: pointer; font: inherit; font-size: 12.5px; }
`;
