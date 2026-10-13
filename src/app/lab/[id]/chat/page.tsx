'use client';

/**
 * 和我聊 · 独立对话页（浅色）：左边是数字职人的立绘站在他的工作场景里，右边是对话。
 * 知识来自平方知识图谱，回答带来源、绝不编造（见 src/lib/kg/persona-chat.ts）。
 * 只读 /lab 的数据；百业空间页右下角「和我聊」点进来。
 */
import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChatBody, usePersonaChat, type ChatSource } from '@/components/kg/PersonaChat';
import { EntityPanel } from '@/components/kg/EntityPanel';
import { useNicknames } from '@/components/kg/useNicknames';
import { NicknameEditor } from '@/components/kg/NicknameEditor';

export default function PersonaChatPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { map: nicks, setNickname } = useNicknames();
  const nickname = nicks[id] || '';
  const chat = usePersonaChat(`/api/lab/spaces/${id}/chat`, { surface: 'lab', nickname });
  const [top, setTop] = useState(64);
  const [narrow, setNarrow] = useState(false);
  const [wide, setWide] = useState(true);
  const [active, setActive] = useState<ChatSource | null>(null);
  useEffect(() => {
    const fit = () => {
      setTop(Math.round(document.querySelector('.lab-head')?.getBoundingClientRect().bottom || 64));
      setNarrow(window.innerWidth < 860);
      setWide(window.innerWidth >= 1280);
    };
    fit(); window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  const m = chat.meta;
  const p = m?.persona;

  const stage = (
    <div style={{ position: 'relative', overflow: 'hidden', background: '#eef0f7', minHeight: narrow ? 260 : undefined, flex: narrow ? undefined : 1,
      // 打开资料时立绘区收窄（屏幕不够宽就收起），对话往左让，资料面板从右边出来
      ...(!narrow && active ? { flex: wide ? '0 0 22%' : '0 0 0%' } : {}), transition: 'flex .35s ease' }}>
      {m?.scene && <img src={m.scene} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(.9) brightness(1.05)' }} />}
      {/* 浅色调：场景蒙一层白，立绘站在前面 */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(248,249,253,.88) 0%, rgba(248,249,253,.55) 45%, rgba(248,249,253,.15) 100%)' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, rgba(248,249,253,.95) 0%, rgba(248,249,253,0) 38%)' }} />
      {/* 立绘站在场景右侧，左侧留给名字和介绍，不压字 */}
      {/* 打开资料时立绘区收窄：人物放大、居中、只露上半身（不然比咖啡机还小） */}
      {p?.avatar && <img src={p.avatar} alt={p.name} style={active && !narrow
        ? { position: 'absolute', top: '6%', left: '50%', transform: 'translateX(-50%)', height: '150%', maxWidth: 'none', objectFit: 'contain', objectPosition: 'top center', filter: 'drop-shadow(0 18px 36px rgba(40,40,90,.22))', transition: 'all .35s ease' }
        : { position: 'absolute', bottom: 0, right: narrow ? 12 : '4%', height: narrow ? '96%' : '90%', maxWidth: narrow ? '55%' : '56%', objectFit: 'contain', objectPosition: 'bottom right', filter: 'drop-shadow(0 18px 36px rgba(40,40,90,.22))', transition: 'all .35s ease' }} />}
      <button onClick={() => router.push(`/lab/${id}`)} style={{ position: 'absolute', top: 18, left: 18, border: '1px solid #e3e5ef', background: 'rgba(255,255,255,.85)', color: '#4b5064', borderRadius: 999, padding: '7px 14px', fontSize: 13, cursor: 'pointer', backdropFilter: 'blur(8px)' }}>← 回到空间</button>
      <div style={{ position: 'absolute', left: narrow ? 18 : 32, bottom: narrow ? 18 : 36, maxWidth: narrow ? '45%' : 'min(360px, 38%)', opacity: active ? 0 : 1, transition: 'opacity .25s' }}>
        <div style={{ fontSize: 12, letterSpacing: 2, color: '#6055f5', fontWeight: 700 }}>和我聊 · 聊聊这一行</div>
        <div style={{ fontSize: narrow ? 26 : 40, fontWeight: 900, color: '#1f2233', lineHeight: 1.15, marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          {nickname || p?.name || '…'}
          {p && <NicknameEditor value={nickname} original={p.name} onSave={n => setNickname(id, n)} />}
        </div>
        {nickname && p?.name && <div style={{ fontSize: 12, color: '#8a8fa3', letterSpacing: 1 }}>{p.name} · 只有你看得到这个名字</div>}
        <div style={{ fontSize: narrow ? 13 : 15, color: '#4b5064', marginTop: 6 }}>{p?.role}{m?.occupation?.name && p?.role !== m.occupation.name ? ` · ${m.occupation.name}` : ''}</div>
        {p?.tagline && !narrow && <div style={{ fontSize: 15, color: '#1f2233', marginTop: 12, padding: '8px 12px', background: 'rgba(255,255,255,.8)', borderRadius: 10, borderLeft: '3px solid #6055f5', backdropFilter: 'blur(6px)' }}>「{p.tagline}」</div>}
        {!narrow && <div style={{ fontSize: 12, color: '#8a8fa3', marginTop: 12, lineHeight: 1.6 }}>我说的每一条事实都来自平方的职业、岗位、标准和企业数据，后面标着来源，点开就能核对；资料里没有的，我不乱说。</div>}
      </div>
    </div>
  );

  return (
    <div style={{ position: 'fixed', top, left: 0, right: 0, bottom: 0, zIndex: 5, display: 'flex', flexDirection: narrow ? 'column' : 'row', background: '#f6f7fb', color: '#1f2233' }}>
      {!(narrow && active) && stage}
      <div style={{ width: narrow ? '100%' : active ? (wide ? '36%' : '44%') : 'min(520px, 44vw)', flex: narrow ? 1 : undefined, transition: 'width .35s ease', minHeight: 0, display: narrow && active ? 'none' : 'flex', flexDirection: 'column', background: '#fff', borderLeft: narrow ? 0 : '1px solid #e8eaf2', boxShadow: '-12px 0 40px rgba(31,34,51,.05)' }}>
        <div style={{ flex: 1, minHeight: 0 }}><ChatBody chat={chat} theme="light" onOpen={setActive} activeId={active?.id} displayName={nickname || undefined} /></div>
      </div>
      {active && <div style={{ flex: 1, minWidth: 0, minHeight: 0, borderLeft: '1px solid #e8eaf2', boxShadow: '-12px 0 40px rgba(31,34,51,.06)', animation: 'kgSlideIn .35s ease' }}>
        <style>{`@keyframes kgSlideIn { from { transform: translateX(40px); opacity: 0 } to { transform: none; opacity: 1 } }`}</style>
        <EntityPanel endpoint={`/api/lab/spaces/${id}/chat`} source={active} onClose={() => setActive(null)} />
      </div>}
    </div>
  );
}
