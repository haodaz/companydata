'use client';

/**
 * 护照精灵「签签」的对话：右下角头像小圆窗 → 底部升起的对话抽屉。
 *  - 管理员的真实护照：问 /api/passport/sprite（带工具调用，流式）；会改数据的事先出确认卡，本人点「确认」才由前端调护照接口执行，再把结果接回去。
 *  - 演示护照：不调模型，四个快捷问题配预写的回答（照着韩梅梅现在「从业」这一段写）；自由输入时提示登录后才能问自己的。
 * 签签一直陪着护照的主人：盯着认证（哪张快到期、该复测）、按当前阶段推荐去处、从长处排到下一枚签——spriteNudge 是护照首页顶上那张主动提醒卡。
 * 对话状态放在 useSpriteChat 里（挂在本人版最外层），关掉抽屉、看盖戳动效时对话不丢、回复照常接着来。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Sheet } from './drawer';
import { Sprite, SPRITE_NAME, SPRITE_TITLE, type SpriteState } from './sprite';
import type { Store } from './store';
import type { Msg, Result } from '@/lib/ws/agent';
import type { Claim } from './data';

export interface Confirm { id: string; name: string; title: string; lines: string[]; action: Record<string, unknown> }
/** 执行完的结果：content 接回给模型；summary 写在结果卡上；view 是「点击查看」要去的地方 */
export type ResultView = { kind: 'claim'; id: string } | { kind: 'page'; key: string } | { kind: 'tab'; tab: 'get' | 'share' | 'me' } | { kind: 'cover' };
export interface ExecResult { content: string; summary: string; view?: ResultView }
export interface OptionItem { id: string; title: string; sub: string; gets?: string; time?: string; cost?: string; tag?: string; say: string }
export interface Options { kind: string; title: string; items: OptionItem[] }
type Card = Confirm & { status: 'ask' | 'busy' | 'done' | 'no'; note?: string };
export const QUICK = ['总结一下我现在的竞争力', '我现在这个阶段该准备什么认证', '这本护照怎么用', '帮我写一句分享给 HR 的话'];

/* 演示护照（韩梅梅）的预写回答：都照着她护照里的数据写。她现在在「从业」这一段：工作第三年，转做经营分析大半年，也想过转科研 */
const DEMO_ANSWERS: Record<string, string> = {
  [QUICK[0]]: '说三点：\n① ATA AI 能力认证 Level 4，五个分项里「找出异常」4.6 最高，「把问题拆清楚」4.5 也稳；\n② 做过一道企业确认采纳的真活——某连锁零售的门店毛利异常排查，企业原话是「能直接拿去开会」；\n③ 从高二到现在一路的章都在：ATA 考过三次，大学先修和营地、校招实习、入职和换方向都盖了章，6 条履历里 5 条已经核对上。\n短板也写在护照里：「核对 AI 的结论」3.4，五项里最低。初级会计证书还只是本人自述，没核验。',
  [QUICK[1]]: '你现在在「从业」这一段：工作第三年，转做经营分析大半年。我帮你盯着三件事：\n① ATA AI 能力签 2028.10 才到期，不急；但发展计划定了 2027.04 前复测，先把「核对 AI 的结论」从 3.4 补到 4.2，复测有望往上走一档；\n② 想在这一行站稳，再拿一枚企业认可的真活签，真活台的「供应商对账异常」正好对上你最强的「找出异常」；\n③ 你写过也在考虑转科研——那就先去实验室跟一个「会员消费行为」的课题，拿一枚科研章，两条路都不耽误。\n要我先帮你约 AI 能力认证复测吗？',
  [QUICK[2]]: '这本护照由 ATA 签发，升学、校招、企业、实验室这些场景平台来用、来盖章；它从高中一直跟你到职场。平常就三件事：\n① 自己做过的事，在「加一条」里写，会盖一枚本人章（本人自述，待核验）；\n② 别人签发的签——ATA 考试和认证、AI 百业体验、企业真活、实验室课题——去「去认证」里拿，拿到就贴进护照；\n③ 要给谁看，点「分享」，给谁、看哪几页、看几天都由你定，随时能撤回，对方每看一次都记在「查看记录」。\n哪张签快到期、到了新阶段该准备什么，我会先提醒你。',
  [QUICK[3]]: '可以这样写：\n「您好，这是我的 ATA 人才护照：ATA AI 能力认证 Level 4，做过某连锁零售的门店毛利异常排查并被企业采纳，履历经过核验。授权给您看身份、鉴真、ATA、真活和长处五页，14 天内有效。」\n要我按某个岗位再改一版吗？',
};
const GREET = `我是${SPRITE_NAME}，从高中到职场一直陪着你这本护照：哪张认证快到期、这个阶段该准备什么、下一枚签去哪儿拿，都可以问我。也可以直接让我帮你加一条、改简介、生成分享链接——要动护照的事，我会先给你一张确认卡。`;

/**
 * 签签的主动提醒（护照首页顶上一张小卡）：
 *  - 演示护照：AI 能力签 2028.10 到期，发展计划定了 2027.04 前复测；
 *  - 真实护照：ATA 页里最早到期的那张；一张 ATA 都没有，就问他现在在哪个阶段、帮他挑第一枚。
 */
export interface Nudge { text: string; ask: string }
export function spriteNudge(demo: boolean, claims: Claim[]): Nudge | null {
  if (demo) return { text: '你的 ATA AI 能力签 2028.10 到期，计划 2027.04 前复测，可以开始准备了。', ask: QUICK[1] };
  const ata = claims.filter(c => c.page === 'ata');
  const dated = ata.map(c => ({ c, m: /^(\d{4})\.(\d{2})/.exec(c.validUntil) })).filter(x => x.m).sort((a, b) => a.m![0].localeCompare(b.m![0]));
  if (dated.length) { const { c, m } = dated[0]; return { text: `你的「${c.title}」${c.demo ? '（演示）' : ''}${m![1]}.${m![2]} 到期，可以提前准备复测。`, ask: QUICK[1] }; }
  if (!ata.length) return { text: '护照里还没有 ATA 认证。告诉我你现在在哪个阶段，我帮你挑第一枚。', ask: QUICK[1] };
  return null;
}

/** 模型偶尔还是会带 Markdown：气泡是纯文字，去掉加粗和标题符号 */
const plain = (t: string) => t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,4}\s*/gm, '');
type View = { kind: 'me' | 'ai' | 'tool'; text: string; key: string } | { kind: 'card'; card: Card; key: string } | { kind: 'result'; summary: string; view?: ResultView; key: string } | { kind: 'options'; options: Options; key: string };

export function useSpriteChat({ store, exec, onDone }: { store: Store; exec: (c: Confirm) => Promise<ExecResult>; onDone?: (c: Confirm, ok: boolean) => void }) {
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
          else if (e.t === 'options') { flush(); push({ kind: 'options', options: e.options as Options, key: key() }); }
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
    try { const r = await exec(c); content = r.content; setCard(c.id, { status: 'done', note: '办好了' }); push({ kind: 'result', summary: r.summary, view: r.view, key: key() }); happy(); } catch (e) { ok = false; content = JSON.stringify({ error: (e as Error).message }); setCard(c.id, { status: 'no', note: `没办成：${(e as Error).message}` }); }
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

export function SpriteSheet({ chat, demo, onClose, onView }: { chat: SpriteChat; demo: boolean; onClose: () => void; onView: (v: ResultView) => void }) {
  const [text, setText] = useState('');
  const [res, setRes] = useState<Options | null>(null);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = log.current; if (el) el.scrollTop = el.scrollHeight; }, [chat.views, chat.live]);
  return (
    <>
    <Sheet onClose={onClose} label={SPRITE_TITLE} variant="side">
      {() => (
        <div className="tp-chat">
          <div className="tp-chat-head">
            <Sprite state={chat.busy && !chat.live ? 'think' : chat.live ? 'talk' : chat.state} />
            <div><b>{SPRITE_TITLE}</b><span>{demo ? '演示护照：先回答四个常见问题' : '一直陪着你这本护照，要改什么先给你确认'}</span></div>
          </div>
          <div className="tp-chat-log" ref={log} aria-live="polite">
            <div className="tp-msg ai">{GREET}</div>
            {chat.views.map(v => v.kind === 'card'
              ? <ConfirmCard key={v.key} c={v.card} onAnswer={yes => chat.answer(v.card, yes)} />
              : v.kind === 'result'
                ? <div key={v.key} className="tp-result"><i aria-hidden>✓</i><div><b>{v.summary}</b>{v.view && <button type="button" className="tp-link-btn" onClick={() => onView(v.view!)}>点击查看 ›</button>}</div></div>
                : v.kind === 'options'
                  ? <div key={v.key} className="tp-optcard"><div><b>{v.options.title}</b><span>{SPRITE_NAME}挑了 {v.options.items.length} 样，选一个</span></div><button type="button" className="tp-btn v sm" onClick={() => setRes(v.options)}>打开看看</button></div>
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
    {res && <ResourceSheet options={res} onClose={() => setRes(null)} onPick={it => { setRes(null); chat.send(it.say); }} />}
    </>
  );
}

/** 资源抽屉：一张张可选的资源卡片，点选后把选择告诉签签，再走确认卡 → 执行 → 结果卡 */
function ResourceSheet({ options, onClose, onPick }: { options: Options; onClose: () => void; onPick: (it: OptionItem) => void }) {
  return (
    <Sheet onClose={onClose} label={options.title} variant="side">
      {close => (
        <div className="tp-res">
          <div className="tp-dr-title" style={{ marginTop: 6 }}>{options.title}</div>
          <p className="tp-card-p" style={{ margin: '2px 0 12px' }}>点一张，{SPRITE_NAME}帮你办；要动护照的事还会先给你确认。</p>
          <div className="tp-res-list">
            {options.items.map(it => (
              <div key={it.id} className="tp-res-card">
                <div className="tp-res-h"><b>{it.title}</b>{it.tag && <span className="tp-dtag">{it.tag}</span>}</div>
                <span className="tp-res-sub">{it.sub}</span>
                {(it.gets || it.time || it.cost) && <div className="tp-res-meta">{it.gets && <span>拿到：{it.gets}</span>}{it.time && <span>用时：{it.time}</span>}{it.cost && <span>费用：{it.cost}</span>}</div>}
                <button type="button" className="tp-btn v sm" onClick={() => { onPick(it); close(); }}>就这个</button>
              </div>
            ))}
            {!options.items.length && <p className="tp-card-p">这一类都已经在你的护照里了。</p>}
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
