'use client';

/**
 * 3D beta 查看器：3D 高斯场景 + 「屏幕是一扇窗」——机位跟着鼠标，打开摄像头后跟着头。
 * 摄像头只在浏览器本地算头的位置（MediaPipe），画面不录、不传。
 */
import { use, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { BETA3D } from '@/lib/lab-3d-beta';
import { Splat3D } from '@/components/lab/Splat3D';

export default function Beta3DPage({ params }: { params: Promise<{ scene: string }> }) {
  const { scene: key } = use(params);
  const s = BETA3D[key];
  const [cam, setCam] = useState(false);
  const [headSeen, setHeadSeen] = useState(false);
  // 挂到 body 上：/lab 的布局有顶栏，3D 场景要整屏
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!s) return <div style={{ padding: 40, color: '#fff', background: '#0b0d1c', minHeight: '100vh' }}>没有这个 3D 场景。</div>;
  if (!mounted) return null;
  return createPortal((
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#0b0d1c', color: '#fff', overflow: 'hidden' }}>
      {s.url ? <Splat3D scene={s} head={cam} onHeadSeen={setHeadSeen} camCorner={{ right: 18, bottom: 150 }} />
        : <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#c7cbe6' }}>这个场景还在重建中，稍后再来。</div>}

      <div style={{ position: 'absolute', left: 20, top: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href={`/lab/${s.spaceId}`} style={{ color: '#c7cbe6', fontSize: 13, textDecoration: 'none', padding: '6px 12px', borderRadius: 999, background: 'rgba(15,18,36,.6)', border: '1px solid rgba(255,255,255,.18)' }}>← {s.role}</Link>
        <span style={{ fontSize: 22, fontWeight: 800, textShadow: '0 2px 10px rgba(0,0,0,.6)' }}>{s.title}</span>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.12em', padding: '4px 9px', borderRadius: 6, background: 'linear-gradient(120deg,#ff5fa2,#6a5cff)' }}>3D BETA</span>
      </div>

      <div style={{ position: 'absolute', right: 18, bottom: 18, display: 'grid', gap: 10, justifyItems: 'end', maxWidth: 320 }}>
        <button onClick={() => setCam(v => !v)}
          style={{ padding: '10px 16px', borderRadius: 999, border: '1px solid rgba(255,255,255,.3)', cursor: 'pointer', fontWeight: 700, fontSize: 13, color: '#fff', background: cam ? 'linear-gradient(135deg,#3ddc97,#12b5cb)' : 'rgba(15,18,36,.72)', backdropFilter: 'blur(6px)' }}>
          {cam ? '📷 跟着头看中 · 关闭' : '📷 用头看（打开摄像头）'}
        </button>
        <div style={{ fontSize: 11, color: '#9aa0c8', textAlign: 'right', lineHeight: 1.6 }}>
          {cam ? (headSeen ? '左右上下挪头、往前凑近，场景跟着你的视角变。' : '把脸放进画面里…') : '移动鼠标看看；打开摄像头后，场景跟着你的头动。'}
          <br />摄像头只在本机算头的位置，不录、不传。<br />{s.credit}
        </div>
      </div>
    </div>
  ), document.body);
}
