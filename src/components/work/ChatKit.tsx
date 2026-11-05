'use client';

/**
 * 真活的对话部件（2026-11-05 从 /work/new/chat 抽出来）：输入框（拖文件 / 粘贴截图 / 📎）、历史还原、工具运行时的说明、整套样式。
 * 聊着出任务和真活工作台 /work/ws 共用。
 */
import React, { useRef, useState } from 'react';
import { MODEL_OPTIONS } from '@/lib/model-options';

export type Item =
  | { k: 'user'; text: string }
  | { k: 'text'; text: string }
  | { k: 'tool'; id: string; name: string; input: any; label?: string; ui?: any; error?: string; running: boolean }
  | { k: 'ask'; id: string; question: string; options: string[]; answered?: string }
  | { k: 'error'; text: string };

export const MODELS = MODEL_OPTIONS.filter(m => /^(claude-|gpt-|qwen)/.test(m.id));
export const RUNNING: Record<string, string> = { find_company: '在企业库里搜', company_brief: '看这家企业的材料', suggest_roles: '找岗位', my_references: '看参考资料', read_reference: '读参考资料（约 1 分钟）', create_task: '出任务中（约 2 分钟：拼材料、锚定问题、写任务书、做材料包、定标准）', task_summary: '看这道题', run_baseline: 'AI 先做一遍当基线（约 1 分钟）', revise_task: '按意见修订', update_task_settings: '改设置', publish_task: '发布', publish_verbatim: '原题直发', my_tasks: '看你出过的题', task_people: '看谁做了这道题', read_report: '读报告', compare_people: '并排比', task_insights: '看整道题的作答情况', set_task_status: '改上下架', open_panel: '在右边打开', search_library: '在任务库里找', kb_lookup: '查知识库', kb_save: '存进知识库' };

export type Cmd = { t: string; p: string };
/** 把一条指令放进输入框，选中第一个【空位】让人直接改 */
export function fillComposer(setText: (t: string) => void, p: string) {
  setText(p);
  setTimeout(() => {
    const ta = document.querySelector('.wc-composer textarea') as HTMLTextAreaElement | null; if (!ta) return;
    ta.focus(); const i = p.indexOf('【'), j = p.indexOf('】', i);
    if (i >= 0 && j > i) ta.setSelectionRange(i, j + 1); else ta.setSelectionRange(p.length, p.length);
  }, 0);
}
/** 输入框下面一排常用指令 */
export function CmdChips({ cmds, setText, small }: { cmds: Cmd[]; setText: (t: string) => void; small?: boolean }) {
  return <div className={`wc-cmds${small ? ' sm' : ''}`}>{cmds.map(c => <button key={c.t} title={c.p} onClick={() => fillComposer(setText, c.p)}>{c.t}</button>)}</div>;
}

/** 输入框下四张快捷提问卡（标题 + 一句说明） */
export function QuickCards({ items, setText }: { items: { t: string; d: string; p: string }[]; setText: (t: string) => void }) {
  return <div className="wc-quick">{items.map(c => <button key={c.t} onClick={() => fillComposer(setText, c.p)}><b>{c.t}</b><span>{c.d}</span></button>)}</div>;
}

const FMT = 'PDF / Word(docx) / Excel / CSV / TXT / 图片，单个 20MB 内';
const OK_EXT = /\.(pdf|docx|txt|md|csv|xlsx|xls|png|jpe?g|webp|gif)$/i;

export function Composer({ text, setText, busy, send, stop, model, setModel, placeholder, autoFocus, commands }: { text: string; setText: (t: string) => void; busy: boolean; send: (t: string) => void; stop: () => void; model: string; setModel: (m: string) => void; placeholder?: string; autoFocus?: boolean; commands?: Cmd[] }) {
  // 上传文件：以【文件】行附进消息；是素材还是参考资料由出题助理按语境判断（默认素材）
  // 2026-11-03：文件先显示成输入框上方的小卡片（不再把一长串【文件】行塞进输入框）；还在上传 / 看图时锁住发送——以前图没处理完就发出去，图就没带上（潜历反馈）
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<{ key: string; name: string; line?: string; err?: string }[]>([]);
  const up = files.some(f => !f.line && !f.err);
  // 11-05 潜历：能拖进来、说清楚能传什么。拖拽 / 粘贴截图 / 📎 三个入口都走这里；不支持的格式和超大文件在这儿就挡下
  const [drag, setDrag] = useState(false);
  const attach = async (list: FileList | File[] | null) => {
    if (!list?.length) return;
    const all = Array.from(list as ArrayLike<File>);
    const bad = all.filter(f => !OK_EXT.test(f.name) || f.size > 20 * 1024 * 1024);
    if (bad.length) setFiles(x => [...x, ...bad.map(f => ({ key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: f.name, err: f.size > 20 * 1024 * 1024 ? '超过 20MB' : '传不了：只收 PDF / Word(docx) / Excel / CSV / TXT / 图片' }))]);
    const picked = all.filter(f => !bad.includes(f)).slice(0, 6).map(f => ({ f, key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }));
    setFiles(x => [...x, ...picked.map(({ f, key }) => ({ key, name: f.name }))]);
    await Promise.all(picked.map(async ({ f, key }) => {
      try {
        const fd = new FormData(); fd.append('file', f);
        const j = await (await fetch('/api/admin/work/attach', { method: 'POST', body: fd })).json();
        if (!j.ok) throw new Error(j.error || '没传上');
        const line = `【文件】${j.name}｜${j.url}｜${j.mime}${j.text ? `｜文字摘录：${String(j.text).slice(0, 1500).replace(/\s+/g, ' ')}` : j.image ? '｜图片' : ''}`;
        setFiles(x => x.map(y => y.key === key ? { ...y, name: j.name || y.name, line } : y));
      } catch (e: any) { setFiles(x => x.map(y => y.key === key ? { ...y, err: e.message || '没传上' } : y)); }
    }));
  };
  // 打「/」弹出常用指令（工作台用；聊着出任务不传 commands 就没有）
  const slash = commands && /^\/\S*$/.test(text) ? commands.filter(c => c.t.includes(text.slice(1)) || !text.slice(1)) : [];
  const [hi, setHi] = useState(0);
  const ready = files.filter(f => f.line);
  const canSend = !up && (!!text.trim() || ready.length > 0);
  const go = () => { if (!canSend) return; send([text.trim() || '（附上文件）', ...ready.map(f => f.line!)].join('\n')); setFiles([]); };
  return (
    <div className={`wc-composer${drag ? ' drag' : ''}`}
      onDragOver={e => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); if (!drag) setDrag(true); } }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false); }}
      onDrop={e => { if (!e.dataTransfer?.files?.length) return; e.preventDefault(); setDrag(false); if (!busy) attach(e.dataTransfer.files); }}>
      {drag && <div className="wc-drop">松手就上传<small>{FMT}</small></div>}
      {slash.length > 0 && <div className="wc-slash">{slash.map((c, i) => <button key={c.t} className={i === hi ? 'on' : ''} onMouseEnter={() => setHi(i)} onClick={() => fillComposer(setText, c.p)}><b>/{c.t}</b><span>{c.p}</span></button>)}</div>}
      {files.length > 0 && <div className="wc-files">{files.map(f => <span key={f.key} className={`wc-file${f.err ? ' err' : !f.line ? ' busy' : ''}`}>📎 {f.name}<em>{f.err ? f.err : !f.line ? '上传中，图片要先看一遍…' : '已就绪'}</em><button onClick={() => setFiles(x => x.filter(y => y.key !== f.key))} title="去掉">×</button></span>)}</div>}
      <textarea value={text} autoFocus={autoFocus} rows={2} placeholder={placeholder || '说一句最实际的要求，比如：我们缺一个能把销售数据理清楚的人'} onChange={e => setText(e.target.value)}
        onPaste={e => { const fs2 = Array.from(e.clipboardData?.files || []); if (fs2.length) { e.preventDefault(); attach(fs2.map((f, i) => f.name && f.name !== 'image.png' ? f : new File([f], `截图-${new Date().toTimeString().slice(0, 8).replace(/:/g, '')}${i ? '-' + i : ''}.png`, { type: f.type || 'image/png' }))); } }}
        onKeyDown={e => {
          if (slash.length) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setHi(h => (h + (e.key === 'ArrowDown' ? 1 : slash.length - 1)) % slash.length); return; }
            if ((e.key === 'Enter' || e.key === 'Tab') && !e.nativeEvent.isComposing) { e.preventDefault(); fillComposer(setText, slash[Math.min(hi, slash.length - 1)].p); setHi(0); return; }
            if (e.key === 'Escape') { setText(''); return; }
          }
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); go(); }
        }} />
      <div className="wc-bar">
        <select className="wc-model" value={model} onChange={e => setModel(e.target.value)}>{MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
        <span className="wc-clip-w"><button className="wc-clip" aria-label={`上传文件（${FMT}）`} disabled={busy} onClick={() => fileRef.current?.click()}>📎 文件</button><span className="wc-tip" role="tooltip">给候选人的素材，或让 AI 照着出的参考资料，传完说一句是哪种就行。<br />也可以拖进输入框、直接粘贴截图。<br />{FMT}<br />Word 请存成 .docx，PPT 请导出成 PDF。</span></span>
        <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.txt,.md,.csv,.xlsx,.xls,.png,.jpg,.jpeg,.webp,.gif" style={{ display: 'none' }} onChange={e => { attach(e.target.files); e.target.value = ''; }} />
        {busy ? <button className="wc-send stop" onClick={stop}>停</button> : <button className="wc-send" disabled={!canSend} title={up ? '文件还在处理，好了再发' : ''} onClick={go}>↑</button>}
      </div>
    </div>
  );
}

export function fromHistory(ms: any[]): Item[] {
  const out: Item[] = [];
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i];
    if (m.role === 'user') out.push({ k: 'user', text: m.text });
    else if (m.role === 'assistant') {
      if (m.text) out.push({ k: 'text', text: m.text });
      const res = ms[i + 1]?.role === 'tool' ? ms[i + 1].results : [];
      for (const c of m.calls || []) {
        const r = res.find((x: any) => x.id === c.id);
        if (c.name === 'ask_user') { let a: string | undefined; try { a = r ? JSON.parse(r.content).answer : undefined; } catch { a = r ? '已回答' : undefined; } out.push({ k: 'ask', id: c.id, question: c.input?.question || '', options: c.input?.options || [], answered: a }); }
        else out.push({ k: 'tool', id: c.id, name: c.name, input: c.input, label: r?.label, ui: r?.ui, error: r?.is_error ? '出错了' : undefined, running: false });
      }
    }
  }
  return out;
}

export const CHAT_CSS = `
.wc-mode { margin-left: auto; display: flex; border: 1px solid #e0e0ee; border-radius: 999px; overflow: hidden; font-size: 13px; }
.wc-mode a, .wc-mode span { padding: 6px 14px; color: #666; text-decoration: none; } .wc-mode .on { background: #6055f5; color: #fff; font-weight: 700; }
.wc { flex: 1; display: grid; grid-template-columns: 210px minmax(0, 1fr); min-height: 0; height: calc(100vh - 60px); }
.wc.with-art { grid-template-columns: 210px minmax(0, 1fr) minmax(440px, 46%); }
.wc-recent { border-right: 1px solid #e8e9f0; padding: 14px 10px; overflow-y: auto; background: #fff; }
.wc-new { width: 100%; border: 1px solid #e0e0ee; background: #fff; border-radius: 10px; padding: 9px 12px; font: inherit; font-size: 14px; font-weight: 700; color: #1a1a2e; cursor: pointer; text-align: left; }
.wc-new:hover { border-color: #6055f5; }
.wc-sec { font-size: 11px; letter-spacing: .2em; color: #999; padding: 14px 10px 6px; font-weight: 700; }
.wc-eyebrow { font-size: 12px; letter-spacing: 2px; color: #6055f5; font-weight: 700; } .wc-eyebrow.sm { font-size: 11px; }
.wc-th { display: block; width: 100%; text-align: left; border: 0; background: transparent; padding: 7px 10px; border-radius: 8px; font: inherit; font-size: 13.5px; color: #3b405a; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wc-th:hover { background: #f0f1f6; } .wc-th.on { background: #ecebff; color: #2b2670; font-weight: 700; }
.wc-chat { display: flex; flex-direction: column; min-height: 0; }
.wc-hero { width: min(760px, 92%); margin: auto; padding: 40px 0 60px; }
.wc-hero h1 { font-size: 32px; font-weight: 900; margin: 8px 0 8px; }
.wc-hero p { color: #555; font-size: 15px; line-height: 1.8; margin: 0 0 22px; }
.wc-suggest { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.wc-card { text-align: left; background: #fff; border: 1px solid #e8e9f0; border-radius: 14px; padding: 14px 16px; cursor: pointer; color: #1a1a2e; font: inherit; }
.wc-card b { display: block; font-size: 14.5px; margin-bottom: 4px; } .wc-card span { display: block; font-size: 12.5px; color: #777; }
.wc-card:hover { border-color: #6055f5; }
.wc-thread { flex: 1; overflow-y: auto; padding: 28px 0 12px; } .wc-thread > * { width: min(780px, 92%); margin-left: auto; margin-right: auto; }
.wc-dock { padding: 8px 0 18px; } .wc-dock > * { width: min(780px, 92%); margin: 0 auto; }
.wc-user { display: flex; justify-content: flex-end; margin: 14px auto; }
.wc-atts { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; } .wc-att { font-size: 12px; background: rgba(255,255,255,.18); border: 1px solid rgba(255,255,255,.35); border-radius: 6px; padding: 2px 8px; }
.wc-bubble { background: #ecebff; border-radius: 16px; padding: 10px 14px; max-width: 80%; white-space: pre-wrap; line-height: 1.65; font-size: 14.5px; }
.wc-ai { margin: 12px auto 6px; line-height: 1.8; font-size: 15px; display: flex; gap: 12px; align-items: flex-start; }
.wc-ai-body { flex: 1; min-width: 0; } .wc-ai-body .ws-md p { margin: 0 0 10px; } .wc-ai-body .ws-md ul, .wc-ai-body .ws-md ol { margin: 0 0 10px; padding-left: 22px; }
.wc-ava { width: 26px; height: 26px; border-radius: 50%; background: #6055f5; color: #fff; display: grid; place-items: center; font-size: 12px; font-weight: 700; flex-shrink: 0; margin-top: 4px; }
.wc-tool { display: flex; align-items: center; gap: 9px; margin: 6px auto; border: 1px solid #e8e9f0; background: #fff; border-radius: 10px; padding: 7px 11px; color: #3b405a; font-size: 13.5px; }
.wc-tool-t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wc-dot { width: 8px; height: 8px; border-radius: 50%; background: #0d7a52; flex-shrink: 0; }
.wc-dot.run { background: #6055f5; animation: wcpulse 1.2s ease-in-out infinite; } .wc-dot.err { background: #b42318; }
@keyframes wcpulse { 0%,100% { box-shadow: 0 0 0 0 rgba(96,85,245,.4) } 50% { box-shadow: 0 0 0 5px rgba(96,85,245,0) } }
.wc-link { border: 0; background: transparent; color: #6055f5; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; text-decoration: none; }
.wc-err-t { color: #b42318; font-size: 12.5px; }
.wc-ask { border: 1px solid #e8e9f0; background: #fff; border-radius: 14px; padding: 14px 16px; margin: 10px auto; }
.wc-ask-q { font-weight: 700; margin-bottom: 10px; } .wc-opts { display: grid; gap: 6px; }
.wc-opt { display: flex; align-items: center; gap: 10px; border: 1px solid #e8e9f0; background: #fff; border-radius: 10px; padding: 9px 12px; text-align: left; cursor: pointer; color: #1a1a2e; font: inherit; font-size: 14px; }
.wc-opt i { width: 22px; height: 22px; border-radius: 6px; background: #f0f1f6; display: grid; place-items: center; font-size: 12px; font-style: normal; color: #666; }
.wc-opt:hover:not(:disabled) { border-color: #6055f5; } .wc-opt:disabled { opacity: .55; cursor: default; } .wc-opt.on { opacity: 1; border-color: #6055f5; background: #ecebff; }
.wc-error { color: #b42318; background: #fbeeea; border: 1px solid #f1d6cf; border-radius: 10px; padding: 9px 12px; margin: 10px auto; font-size: 13.5px; }
.wc-typing { display: flex; gap: 5px; padding: 10px 2px; } .wc-typing i { width: 6px; height: 6px; border-radius: 50%; background: #999; animation: wcdot 1.2s infinite; }
.wc-typing i:nth-child(2) { animation-delay: .15s } .wc-typing i:nth-child(3) { animation-delay: .3s } @keyframes wcdot { 0%,80%,100% { opacity: .25 } 40% { opacity: 1 } }
.wc-composer { background: #fff; border: 1px solid #e8e9f0; border-radius: 18px; padding: 12px 12px 8px 16px; box-shadow: 0 2px 10px rgba(20,24,60,.05); }
.wc-composer:focus-within { border-color: #6055f5; }
.wc-composer { position: relative; }
.wc-composer.drag { border-color: #6055f5; border-style: dashed; background: #f6f5ff; }
.wc-drop { position: absolute; inset: 0; display: grid; place-items: center; border-radius: 18px; background: rgba(246,245,255,.92); color: #4c43c9; font-weight: 700; font-size: 15px; pointer-events: none; z-index: 2; }
.wc-clip { white-space: nowrap; flex: none; }
/* 能传什么：不常驻在输入框里，鼠标放到 📎 上才弹（11-05 用户：这种话别堆在这里）；拖文件进来时、传错格式时也会说 */
.wc-clip-w { position: relative; display: inline-flex; }
.wc-tip { position: absolute; left: 0; bottom: calc(100% + 8px); width: 300px; background: #1b1d36; color: #fff; font-size: 12.5px; line-height: 1.7; border-radius: 10px; padding: 9px 12px; box-shadow: 0 10px 28px rgba(27,29,54,.2); opacity: 0; visibility: hidden; transform: translateY(4px); transition: opacity .15s, transform .15s; pointer-events: none; z-index: 8; }
.wc-clip-w:hover .wc-tip, .wc-clip:focus-visible + .wc-tip { opacity: 1; visibility: visible; transform: none; }
.wc-drop small { display: block; font-size: 12.5px; font-weight: 500; color: #6b6f86; margin-top: 4px; text-align: center; }
.wc-composer textarea { width: 100%; border: 0; outline: 0; resize: none; background: transparent; font: inherit; font-size: 15px; line-height: 1.6; color: #1a1a2e; }
.wc-bar { display: flex; align-items: center; margin-top: 4px; }
.wc-model { border: 0; background: transparent; color: #666; font: inherit; font-size: 12.5px; cursor: pointer; padding: 4px 2px; outline: 0; }
.wc-files { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 12px 0; }
.wc-file { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; background: #f1f0ff; color: #3f35c4; border: 1px solid #dcd8ff; border-radius: 8px; padding: 3px 4px 3px 9px; }
.wc-file em { font-style: normal; color: #0d7a52; font-size: 11.5px; }
.wc-file.busy em { color: #8a5a00; } .wc-file.err { background: #fff1f0; border-color: #ffccc7; color: #a8071a; } .wc-file.err em { color: #a8071a; }
.wc-file button { border: 0; background: transparent; color: #888; cursor: pointer; font-size: 14px; line-height: 1; padding: 0 4px; }
.wc-clip { border: 1px solid #e0e0ee; background: #fff; color: #555; font: inherit; font-size: 12.5px; border-radius: 8px; padding: 3px 10px; margin-left: 8px; cursor: pointer; } .wc-clip:disabled { opacity: .5; }
.wc-send { margin-left: auto; width: 32px; height: 32px; border-radius: 10px; border: 0; background: #6055f5; color: #fff; font-size: 16px; cursor: pointer; }
.wc-send:disabled { opacity: .25; cursor: default; } .wc-send.stop { background: #7a756a; font-size: 12px; }
.wc-art { border-left: 1px solid #e8e9f0; background: #fff; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.wc-art-h { display: flex; align-items: center; gap: 10px; padding: 12px 14px 12px 18px; border-bottom: 1px solid #e8e9f0; }
.wc-art-t { font-weight: 800; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wc-art-b { flex: 1; min-height: 0; } .wc-art-b iframe { width: 100%; height: 100%; border: 0; }
.wc-mute { color: #777; font-size: 13px; }
.wc-quick { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 22px; }
.wc-quick button { text-align: left; background: rgba(255,255,255,.86); border: 1px solid #e8e9f0; border-radius: 14px; padding: 15px 18px; cursor: pointer; font: inherit; color: #1a1a2e; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.wc-quick b { display: block; font-size: 15px; margin-bottom: 5px; } .wc-quick span { display: block; font-size: 13px; color: #777; }
.wc-quick button:hover { border-color: #6055f5; }
@media (max-width: 640px) { .wc-quick { grid-template-columns: 1fr; } }
.wc-cmds { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; } .wc-cmds.sm { margin: 0 0 8px; }
.wc-cmds button { border: 1px solid #e0e0ee; background: #fff; border-radius: 999px; padding: 5px 12px; font: inherit; font-size: 13px; color: #3b405a; cursor: pointer; } .wc-cmds.sm button { padding: 3px 10px; font-size: 12.5px; }
.wc-cmds button:hover { border-color: #6055f5; color: #2b2670; }
.wc-slash { position: absolute; left: 10px; right: 10px; bottom: calc(100% + 6px); background: #fff; border: 1px solid #e8e9f0; border-radius: 12px; box-shadow: 0 8px 24px rgba(20,24,60,.12); padding: 6px; display: grid; gap: 2px; max-height: 340px; overflow-y: auto; z-index: 6; }
.wc-slash button { display: flex; gap: 10px; align-items: baseline; text-align: left; border: 0; background: transparent; border-radius: 8px; padding: 7px 10px; font: inherit; cursor: pointer; color: #1a1a2e; }
.wc-slash button.on { background: #f1efff; } .wc-slash b { font-size: 13.5px; white-space: nowrap; color: #2b2670; } .wc-slash span { font-size: 12.5px; color: #8c8fa6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
@media (max-width: 1100px) { .wc, .wc.with-art { grid-template-columns: minmax(0, 1fr); } .wc-recent { display: none; } .wc-art { position: fixed; inset: 0; z-index: 30; } }
`;
