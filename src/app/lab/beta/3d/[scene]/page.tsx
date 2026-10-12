'use client';

/**
 * 3D beta 查看器：3D 高斯场景 + 「屏幕是一扇窗」——机位跟着鼠标，打开摄像头后跟着头。
 * 摄像头只在浏览器本地算头的位置（MediaPipe），画面不录、不传。
 * 场景有 pano（真实 360° 素材）：只有 pano 就直接看全景（只能转头，没有视差）；3D 和 pano 都有，先看 3D，右上角能切到 360°。
 */
import { use, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { BETA3D } from '@/lib/lab-3d-beta';
import { Splat3D } from '@/components/lab/Splat3D';
import { Pano360 } from '@/components/lab/Pano360';

export default function Beta3DPage({ params }: { params: Promise<{ scene: string }> }) {
  const { scene: key } = use(params);
  const s = BETA3D[key];
  const [cam, setCam] = useState(false);
  const [headSeen, setHeadSeen] = useState(false);
  // 挂到 body 上：/lab 的布局有顶栏，3D 场景要整屏
  const [mounted, setMounted] = useState(false);
  // ?edit=1：标注模式——点场景里的物件，坐标列在右上角（抄进 lab-3d-beta.ts 的 hotspots）
  const [edit, setEdit] = useState(false);
  const [picks, setPicks] = useState<[number, number, number][]>([]);
  // ?all=1：全景里低置信度（< 0.5）的识别结果也显示，给人工核对用
  const [allSpots, setAllSpots] = useState(false);
  useEffect(() => { setMounted(true); const q = new URLSearchParams(window.location.search); setEdit(q.get('edit') === '1'); setAllSpots(q.get('all') === '1'); }, []);
  // 360° 全景：没有 3D 重建时就是它；两个都有时由右上角按钮切
  const [panoOn, setPanoOn] = useState(!!s?.pano?.first);

  if (!s) return <div style={{ padding: 40, color: '#fff', background: '#0b0d1c', minHeight: '100vh' }}>没有这个 3D 场景。</div>;
  if (!mounted) return null;
  const showPano = !!s.pano && (!s.url || panoOn);
  return createPortal((
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#0b0d1c', color: '#fff', overflow: 'hidden' }}>
      {showPano ? <Pano360 key={s.pano!.url} src={s.pano!.url} kind={s.pano!.kind} yaw={s.pano!.yaw} head={cam} onHeadSeen={setHeadSeen} camCorner={{ right: 18, bottom: 150 }}
            spots={s.pano!.spots} nodes={s.pano!.nodes} walk={s.pano!.walk} showAll={allSpots} />
        : s.url ? <Splat3D scene={s} head={cam} onHeadSeen={setHeadSeen} camCorner={{ right: 18, bottom: 150 }} hotspots={s.hotspots} edit={edit} onPick={p => { setPicks(ps => [...ps, p]); (window as any).__picks = [...picks, p]; }} />
        : <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#c7cbe6' }}>这个场景还在重建中，稍后再来。</div>}

      <div style={{ position: 'absolute', left: 20, top: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href={`/lab/${s.spaceId}`} style={{ color: '#c7cbe6', fontSize: 13, textDecoration: 'none', padding: '6px 12px', borderRadius: 999, background: 'rgba(15,18,36,.6)', border: '1px solid rgba(255,255,255,.18)' }}>← {s.role}</Link>
        <span style={{ fontSize: 22, fontWeight: 800, textShadow: '0 2px 10px rgba(0,0,0,.6)' }}>{s.title}</span>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.12em', padding: '4px 9px', borderRadius: 6, background: 'linear-gradient(120deg,#ff5fa2,#6a5cff)' }}>{showPano ? '360° BETA' : '3D BETA'}</span>
      </div>

      {s.url && s.pano && (
        <div style={{ position: 'absolute', left: '50%', top: 18, transform: 'translateX(-50%)', display: 'flex', padding: 3, borderRadius: 999, background: 'rgba(15,18,36,.72)', border: '1px solid rgba(255,255,255,.2)', backdropFilter: 'blur(6px)' }}>
          {([[false, '3D 场景'], [true, '360° 实拍']] as const).map(([v, label]) => (
            <button key={label} onClick={() => setPanoOn(v)} style={{ padding: '6px 14px', borderRadius: 999, border: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: panoOn === v ? '#171a2e' : '#c7cbe6', background: panoOn === v ? '#ffd166' : 'transparent' }}>{label}</button>
          ))}
        </div>
      )}

      {edit && (
        <div className="lab-mono" style={{ position: 'absolute', right: 18, top: 18, width: 300, maxHeight: '50vh', overflow: 'auto', padding: 12, borderRadius: 12, background: 'rgba(15,18,36,.85)', border: '1px solid rgba(255,255,255,.2)', fontSize: 11, color: '#c7cbe6', whiteSpace: 'pre' }}>
          标注模式 · 点物件取坐标{'\n'}{picks.map((p, i) => `${i + 1}. [${p.join(', ')}]`).join('\n') || '（还没点）'}
        </div>
      )}
      {(s.hotspots?.length || 0) > 0 && !edit && !showPano && (
        <div style={{ position: 'absolute', left: 20, top: 64, fontSize: 12, color: '#c7cbe6', padding: '6px 12px', borderRadius: 999, background: 'rgba(15,18,36,.6)', border: '1px solid rgba(255,255,255,.18)' }}>点一下标签，看这件东西是干什么的</div>
      )}
      <div style={{ position: 'absolute', right: 18, bottom: 18, display: 'grid', gap: 10, justifyItems: 'end', maxWidth: 320 }}>
        <button onClick={() => setCam(v => !v)}
          style={{ padding: '10px 16px', borderRadius: 999, border: '1px solid rgba(255,255,255,.3)', cursor: 'pointer', fontWeight: 700, fontSize: 13, color: '#fff', background: cam ? 'linear-gradient(135deg,#3ddc97,#12b5cb)' : 'rgba(15,18,36,.72)', backdropFilter: 'blur(6px)' }}>
          {cam ? '📷 跟着头看中 · 关闭' : '📷 用头看（打开摄像头）'}
        </button>
        <div style={{ fontSize: 11, color: '#9aa0c8', textAlign: 'right', lineHeight: 1.6 }}>
          {showPano
            ? (cam ? (headSeen ? (s.pano?.nodes?.length ? '挪头转着看；往前凑 = 走近，对准地上的箭头再往前倾就走过去。' : '左右上下挪头转着看，往前凑 = 走近、往后靠 = 退远。') : '把脸放进画面里（先坐正，第一眼的距离当基准）…')
              : (s.pano?.nodes?.length ? '拖动转着看，点地上的箭头 / 按 W 往前走、S 往回走；滚轮拉近。' : '拖动转着看，滚轮 / 双指 / W S 走近走远；打开摄像头后跟着头转、往前凑就走近。'))
            : (cam ? (headSeen ? '左右上下挪头、往前凑近，场景跟着你的视角变。' : '把脸放进画面里…') : '移动鼠标看看；打开摄像头后，场景跟着你的头动。')}
          <br />摄像头只在本机算头的位置，不录、不传。<br />{showPano ? '真实 360° 素材' : s.credit}
        </div>
      </div>
    </div>
  ), document.body);
}
