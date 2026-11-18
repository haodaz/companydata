'use client';

/**
 * 护照精灵「签签」的对话：右下角头像小圆窗 → 底部升起的对话抽屉。
 *  - 管理员的真实护照：问 /api/passport/sprite（带工具调用，流式）；会改数据的事先出确认卡，本人点「确认」才由前端调护照接口执行，再把结果接回去。
 *  - 演示护照：不调模型，四个快捷问题配预写的回答；自由输入时提示登录后才能问自己的。
 * 对话状态放在 useSpriteChat 里（挂在本人版最外层），关掉抽屉、看盖戳动效时对话不丢、回复照常接着来。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Sheet } from './drawer';
import { Sprite, SPRITE_NAME, SPRITE_TITLE, type SpriteState } from './sprite';
import type { Store } from './store';
import type { Msg, Result } from '@/lib/ws/agent';

export interface Confirm { id: string; name: string; title: string; lines: string[]; action: Record<string, unknown> }
type Card = Confirm & { status: 'ask' | 'busy' | 'done' | 'no'; note?: string };
export const QUICK = ['总结一下我现在的竞争力', '下一枚签去哪儿拿最划算', '这本护照怎么用', '帮我写一句分享给 HR 的话'];

/* 演示护照（郝大壮）的预写回答：都照着他护照里的数据写 */
const DEMO_ANSWERS: Record<string, string> = {
  [QUICK[0]]: '说三点：\n① ATA AI 能力认证 Level 4，五个分项里「找出异常」4.6 最高，「把问题拆清楚」4.5 也稳；\n② 做过一道企业确认采纳的真活——北辰连锁的门店毛利异常排查，企业原话是「能直接拿去开会」；\n③ 6 条履历里 5 条平方已经核对上了。\n短板也写在护照里：「核对 AI 的结论」3.4，五项里最低。初级会计证书还只是本人自述，没核验。',
  [QUICK[1]]: '最划算的是 ATA 的 AI 能力认证复测。你现在是 Level 4，短板「核对 AI 的结论」3.4，发展计划里本来就是先补这一项再复测，补上来能力签能往上走一档。在线任务式，大约 2 小时。\n想再要一枚企业认可的，可以去真活台接「供应商对账异常」，正好对上你最强的「找出异常」。',
  [QUICK[2]]: '三件事：\n① 自己做过的事，在「加一条」里写，会盖一枚本人章（本人自述，待核验）；\n② 别人签发的签——ATA 考试、AI 百业体验、企业真活——去「去认证」里拿，拿到就贴进护照；\n③ 要给谁看，点「分享」，给谁、看哪几页、看几天都由你定，随时能撤回，对方每看一次都记在「查看记录」。\n另外「我的」里能定制我的人才护照：封面、纸张、封面上的一句话。',
  [QUICK[3]]: '可以这样写：\n「您好，这是我的人才护照：ATA AI 能力认证 Level 4，做过北辰连锁的门店毛利异常排查并被企业采纳，履历经平方核验。授权给您看身份、鉴真、ATA、真活和长处五页，14 天内有效。」\n要我按某个岗位再改一版吗？',
};
const GREET = `我是${SPRITE_NAME}，你这本护照里的事都可以问我。也可以直接让我帮你加一条、改简介、生成分享链接——要动护照的事，我会先给你一张确认卡。`;

/** 模型偶尔还是会带 Markdown：气泡是纯文字，去掉加粗和标题符号 */
const plain = (t: string) => t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,4}\s*/gm, '');
type View = { kind: 'me' | 'ai' | 'tool'; text: string; key: string } | { kind: 'card'; card: Card; key: string };

export function useSpriteChat({ store, exec, onDone }: { store: Store; exec: (c: Confirm) => Promise<string>; onDone?: (c: Confirm, ok: boolean) => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [views, setViews] = useState<View[]>([]);
  const [live, setLive] = useState('');
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<SpriteState>('idle');
  const [unread, setUnread] = useState(false);
  const msgsRef = useRef<Msg[]>([]);
  const n = useRef(0);
  const key = () => `v${++n.current}`;
  const push = (v: View) => setViews(cur => [...cur, v]);
  const setCard = (id: string, patch: Partial<Card>) => setViews(cur => cur.map(v => (v.kind === 'card' && v.card.id === id ? { ...v, card: { ...v.card, ...patch } } : v)));
  const happy = () => { setState('happy'); window.setTimeout(() => setState(s => (s === 'happy' ? 'idle' : s)), 2200); };

  const demoReply = useCallback((text: string) => {
    const ans = DEMO_ANSWERS[text] || `这是演示护照，${SPRITE_NAME}只会回答上面四个问题。登录后，${SPRITE_NAME}才能回答你自己的问题。`;
    setBusy(true); setState('talk');
    let i = 0; const chars = Array.from(ans);
    const t = window.setInterval(() => {
      i = Math.min(chars.length, i + 3); setLive(chars.slice(0, i).join(''));
      if (i >= chars.length) { window.clearInterval(t); setLive(''); push({ kind: 'ai', text: ans, key: key() }); setBusy(false); setState('idle'); setUnread(true); }
    }, 28);
  }, []);

  const call = useCallback(async (payload: { text?: string; results?: Result[] }) => {
    setBusy(true); setState('think'); setLive('');
    let text = '';
    const flush = () => { if (text.trim()) push({ kind: 'ai', text: plain(text.trim()), key: key() }); text = ''; setLive(''); };
    try {
      const res = await fetch('/api/passport/sprite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ messages: msgsRef.current, ...payload }) });
      if (!res.ok || !res.body) { const j = await res.json().catch(() => ({})); throw new Error(j.error || `出错了（${res.status}）`); }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          let e: Record<string, unknown>; try { e = JSON.parse(line); } catch { continue; }
          if (e.t === 'text') { text += String(e.delta || ''); setLive(text); setState('talk'); }
          else if (e.t === 'tool_start') { flush(); setState('think'); }
          else if (e.t === 'tool_end') { push({ kind: 'tool', text: `${SPRITE_NAME}${String(e.label || '查了一下')}`, key: key() }); }
          else if (e.t === 'confirm') { flush(); const c = e.confirm as Confirm; push({ kind: 'card', card: { ...c, status: 'ask' }, key: key() }); }
          else if (e.t === 'added') { msgsRef.current = e.messages as Msg[]; setMsgs(msgsRef.current); }
          else if (e.t === 'error') { flush(); push({ kind: 'ai', text: String(e.message || '出错了'), key: key() }); }
        }
      }
      flush();
    } catch (err) {
      flush(); push({ kind: 'ai', text: (err as Error).message || `${SPRITE_NAME}暂时连不上，稍后再试一次。`, key: key() });
    } finally { setBusy(false); setState(s => (s === 'happy' ? s : 'idle')); setUnread(true); }
  }, []);

  const send = (raw: string) => {
    const text = raw.trim(); if (!text || busy) return;
    push({ kind: 'me', text, key: key() });
    setViews(cur => cur.map(v => (v.kind === 'card' && v.card.status === 'ask' ? { ...v, card: { ...v.card, status: 'no', note: '没点确认，改说别的了' } } : v)));
    if (store.kind === 'demo') demoReply(text); else call({ text });
  };
  const answer = async (c: Card, yes: boolean) => {
    if (c.status !== 'ask') return;
    if (!yes) { setCard(c.id, { status: 'no', note: '算了' }); onDone?.(c, false); call({ results: [{ id: c.id, name: c.name, content: JSON.stringify({ declined: true }) }] }); return; }
    setCard(c.id, { status: 'busy' });
    let content: string, ok = true;
    try { content = await exec(c); setCard(c.id, { status: 'done', note: '办好了' }); happy(); } catch (e) { ok = false; content = JSON.stringify({ error: (e as Error).message }); setCard(c.id, { status: 'no', note: `没办成：${(e as Error).message}` }); }
    onDone?.(c, ok);
    call({ results: [{ id: c.id, name: c.name, content }] });
  };
  return { msgs, views, live, busy, state, unread, setUnread, send, answer };
}
export type SpriteChat = ReturnType<typeof useSpriteChat>;

export function SpriteFab({ chat, onOpen }: { chat: SpriteChat; onOpen: () => void }) {
  return (
    <button type="button" className="tp-sp-fab" aria-label={`打开${SPRITE_TITLE}`} onClick={() => { chat.setUnread(false); onOpen(); }}>
      <Sprite crop="head" state={chat.busy ? 'think' : chat.state === 'happy' ? 'happy' : 'idle'} />
      {chat.unread && <i />}
    </button>
  );
}

export function SpriteSheet({ chat, demo, onClose }: { chat: SpriteChat; demo: boolean; onClose: () => void }) {
  const [text, setText] = useState('');
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = log.current; if (el) el.scrollTop = el.scrollHeight; }, [chat.views, chat.live]);
  return (
    <Sheet onClose={onClose} label={SPRITE_TITLE} variant="side">
      {() => (
        <div className="tp-chat">
          <div className="tp-chat-head">
            <Sprite state={chat.busy && !chat.live ? 'think' : chat.live ? 'talk' : chat.state} />
            <div><b>{SPRITE_TITLE}</b><span>{demo ? '演示护照：先回答四个常见问题' : '只看你这本护照，要改什么先给你确认'}</span></div>
          </div>
          <div className="tp-chat-log" ref={log} aria-live="polite">
            <div className="tp-msg ai">{GREET}</div>
            {chat.views.map(v => v.kind === 'card'
              ? <ConfirmCard key={v.key} c={v.card} onAnswer={yes => chat.answer(v.card, yes)} />
              : <div key={v.key} className={`tp-msg ${v.kind}`}>{v.text}</div>)}
            {chat.live && <div className="tp-msg ai">{plain(chat.live)}</div>}
            {chat.busy && !chat.live && <div className="tp-msg tool">{SPRITE_NAME}正在翻你的护照…</div>}
          </div>
          <div className="tp-quick">{QUICK.map(q => <button type="button" key={q} disabled={chat.busy} onClick={() => chat.send(q)}>{q}</button>)}</div>
          <div className="tp-chat-in">
            <textarea className="tp-input" rows={1} value={text} maxLength={800} placeholder={demo ? `登录后${SPRITE_NAME}才能回答你自己的问题` : `问${SPRITE_NAME}，或者让她帮你办点事`}
              onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); chat.send(text); setText(''); } }} />
            <button type="button" className="tp-btn v sm" disabled={chat.busy || !text.trim()} onClick={() => { chat.send(text); setText(''); }}>发送</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function ConfirmCard({ c, onAnswer }: { c: Card; onAnswer: (yes: boolean) => void }) {
  return (
    <div className={`tp-confirm${c.status === 'done' ? ' done' : c.status === 'no' ? ' no' : ''}`}>
      <b>{c.title}</b>
      <ul>{c.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
      {c.status === 'ask' && <div className="tp-row"><button type="button" className="tp-btn v sm" onClick={() => onAnswer(true)}>确认</button><button type="button" className="tp-btn ghost sm" onClick={() => onAnswer(false)}>算了</button></div>}
      {c.status === 'busy' && <small style={{ color: '#6B7290' }}>正在办…</small>}
      {(c.status === 'done' || c.status === 'no') && <small style={{ color: '#6B7290' }}>{c.note}</small>}
    </div>
  );
}
