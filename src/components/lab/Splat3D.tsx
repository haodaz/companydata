'use client';

/**
 * 3D 高斯场景（3D beta）：机位跟着鼠标，打开 head 后跟着头（摄像头本机推理，不录不传）——屏幕像一扇窗。
 * 独立查看器 /lab/beta/3d/<key> 和操作台背景共用。
 *   pan：-1…1，在重建出来的机位轨迹上整体往左 / 右挪（操作台每往下走一步挪一点，像在房间里走动）
 *   still：定住视角（答题蒙版打开时），不跟鼠标 / 头，慢慢回正中
 *   hotspots：场景里可以点的物件——鼠标悬停出线框（像游戏里的空间建模），点一下弹说明
 *   edit：标注模式——点场景任意一处，把击中的 3D 坐标交给 onPick（用来写 hotspots 的 pos）
 */
import { useEffect, useRef, useState } from 'react';
import type { Beta3DScene, Beta3DHotspot } from '@/lib/lab-3d-beta';
import { HeadCam, type HeadPose } from '@/components/lab/HeadCam';

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export function Splat3D({ scene: s, head = false, pan = 0, still = false, camCorner, onReady, onHeadSeen, hotspots, edit = false, onPick }: {
  scene: Beta3DScene; head?: boolean; pan?: number;
  still?: boolean;
  /** 摄像头小窗放在哪个角（不传就不显示小窗，但照样追踪） */
  camCorner?: React.CSSProperties;
  onReady?: () => void; onHeadSeen?: (seen: boolean) => void;
  hotspots?: Beta3DHotspot[]; edit?: boolean; onPick?: (p: V3) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const input = useRef({ x: 0, y: 0, z: 0 });
  const panRef = useRef(pan);
  panRef.current = pan;
  const stillRef = useRef(still);
  stillRef.current = still;
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');
  // 物件：鼠标在画布上的位置、悬停的是谁、标签投影到屏幕的位置、点开的是谁
  const tagRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [open, setOpen] = useState<string | null>(null);
  const pickRef = useRef<((px: number, py: number) => void) | null>(null);
  const hs = hotspots || [];

  useEffect(() => {
    if (!s.url || !host.current) return;
    let viewer: any = null, raf = 0, dead = false, loading: Promise<unknown> = Promise.resolve();
    // 查看器要一个归它管的容器：它 dispose 时会把画布从容器里删掉、再把容器从 document.body 删掉（按它自己建容器的假设写的）
    const el = Object.assign(document.createElement('div'), { style: 'position:absolute;inset:0' });
    host.current.appendChild(el);
    (async () => {
      try {
        const [GS, THREE]: any[] = await Promise.all([import('@mkkellogg/gaussian-splats-3d'), import('three')]);
        if (dead) return;
        viewer = new GS.Viewer({
          rootElement: el, cameraUp: s.up, initialCameraPosition: s.position, initialCameraLookAt: s.lookAt,
          useBuiltInControls: false, sharedMemoryForWorkers: false, selfDrivenMode: false, dynamicScene: false, sphericalHarmonicsDegree: 1,   // 不让库自己跑循环：挪机位 → 出画面 → 投影标签在同一帧里做完，标签才不会拖着画面飘
        });
        // 加载中途被卸载（换页）时，库内部的下载 promise 会以「Could not load file」拒绝；收尾等它结束再 dispose，别让它变成 uncaught
        loading = viewer.addSplatScene(s.url, { showLoadingUI: false, progressiveLoad: false, splatAlphaRemovalThreshold: 5, onProgress: (p: number) => setProgress(Math.round(p)) });
        await loading.catch(e => { if (!dead) throw e; });
        if (dead) return;
        // 不调 viewer.start()（自驱模式才用）：下面 tick 里手动 update / render
        setReady(true); onReady?.();

        // ── 物件标签：只记 3D 位置，每帧投影到屏幕，直接改 DOM（不走 React 状态，不加渲染负担） ──
        pickRef.current = (px: number, py: number) => {
          const r = el.getBoundingClientRect();
          const hits: any[] = [];
          viewer.raycaster.setFromCameraAndScreenPosition(viewer.camera, new THREE.Vector2(px - r.left, py - r.top), new THREE.Vector2(r.width, r.height));
          viewer.raycaster.intersectSplatMesh(viewer.splatMesh, hits);
          if (hits[0]) onPick?.([hits[0].origin.x, hits[0].origin.y, hits[0].origin.z].map(v => Math.round(v * 1000) / 1000) as V3);
        };
        const v3 = new THREE.Vector3();

        // 窗户效果：机位在「中间那一帧」附近按输入平移（左右、上下、前后），一直看着场景中心
        const fwd = norm(sub(s.lookAt, s.position)), up = norm(s.up), right = norm(cross(fwd, up));
        const cur = { x: 0, y: 0, z: 0, pan: panRef.current };
        const tick = () => {
          raf = requestAnimationFrame(tick);
          for (const k of ['x', 'y', 'z'] as const) cur[k] += (input.current[k] - cur[k]) * 0.12;
          cur.pan += (panRef.current - cur.pan) * 0.03;
          const A = s.span;
          const p = [0, 1, 2].map(i => s.position[i] + right[i] * (cur.x + cur.pan) * A + up[i] * -cur.y * A * 0.5 + fwd[i] * cur.z * A * 0.8);
          const c = viewer.camera;
          c.position.set(p[0], p[1], p[2]);
          c.up.set(up[0], up[1], up[2]);
          // 跟着平移一起转一点点视线，镜头是在「走」，不是死盯一个点
          c.lookAt(s.lookAt[0] + right[0] * cur.pan * A * 2, s.lookAt[1] + right[1] * cur.pan * A * 2, s.lookAt[2] + right[2] * cur.pan * A * 2);
          c.updateMatrixWorld();   // 先把这一帧的相机矩阵算好，出画面和标签投影用的是同一个相机
          viewer.update();
          if (viewer.shouldRender()) viewer.render();
          if (!hs.length) return;
          const r = el.getBoundingClientRect();
          for (const h of hs) {
            const node = tagRefs.current[h.id]; if (!node) continue;
            v3.set(h.pos[0], h.pos[1], h.pos[2]).project(c);
            const behind = v3.z > 1;
            node.style.visibility = behind ? 'hidden' : 'visible';
            node.dataset.flip = (1 - v3.y) / 2 * r.height < 300 ? '1' : '';   // 靠近顶部：说明卡改弹在标签下面
            node.style.transform = `translate(${((v3.x + 1) / 2 * r.width).toFixed(1)}px, ${((1 - v3.y) / 2 * r.height).toFixed(1)}px) translate(-50%, -100%)`;
          }
        };
        tick();
      } catch (e: any) { setErr(`3D 场景加载失败：${e?.message || e}`); }
    })();
    // 收尾：先把容器挪到 body 底下（藏起来），它 dispose 里那两次 removeChild 才都对得上；没建出查看器就直接删
    return () => {
      dead = true; cancelAnimationFrame(raf); pickRef.current = null;
      if (!viewer) { el.remove(); return; }
      el.style.display = 'none'; document.body.appendChild(el);
      const v = viewer;
      loading.catch(() => {}).then(() => { try { Promise.resolve(v.dispose()).catch(() => {}).finally(() => el.remove()); } catch { el.remove(); } });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.url, hs.length]);

  // 定住：输入清零，tick 里的缓动会把机位带回正中
  useEffect(() => { if (still) input.current = { x: 0, y: 0, z: 0 }; }, [still]);
  // 没开摄像头：跟着鼠标
  useEffect(() => {
    if (head) return;
    const move = (e: PointerEvent) => { if (stillRef.current) return; input.current = { x: (e.clientX / window.innerWidth - 0.5) * 2, y: (e.clientY / window.innerHeight - 0.5) * 2, z: 0 }; };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, [head]);
  useEffect(() => { input.current = { x: 0, y: 0, z: 0 }; onHeadSeen?.(false); }, [head]); // eslint-disable-line react-hooks/exhaustive-deps

  const onHead = (p: HeadPose | null) => { if (!p) return; onHeadSeen?.(true); if (!stillRef.current) input.current = { x: p.x * 1.6, y: p.y * 1.2, z: p.z }; };

  // 点一下画面（没拖动）：标注模式下取坐标；平时关掉说明卡。标签自己接点击
  const downAt = useRef<{ x: number; y: number } | null>(null);
  const onDown = (e: React.PointerEvent) => { downAt.current = { x: e.clientX, y: e.clientY }; };
  const onUp = (e: React.PointerEvent) => {
    const d = downAt.current; downAt.current = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
    if (edit) pickRef.current?.(e.clientX, e.clientY);
    else setOpen(null);
  };

  return (
    <>
      <div ref={host} style={{ position: 'absolute', inset: 0, cursor: edit ? 'crosshair' : undefined }} onPointerDown={onDown} onPointerUp={onUp} />
      {!ready && !err && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 13, letterSpacing: '.2em', color: '#9aa0c8' }}>LOADING 3D SCENE</div>
            <div style={{ marginTop: 10, width: 240, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.12)', overflow: 'hidden' }}><div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg,#6a5cff,#12b5cb)' }} /></div>
          </div>
        </div>
      )}
      {err && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#ff8fa3' }}>{err}</div>}
      {/* 物件标签：钉在物件的 3D 位置上（位置由 tick 每帧写），悬停变亮，点开说明 */}
      {hs.map(h => { const on = open === h.id; return (
        <div key={h.id} ref={n => { tagRefs.current[h.id] = n; }} className="splat-tag" onClick={e => { e.stopPropagation(); setOpen(on ? null : h.id); }}
          style={{ position: 'absolute', left: 0, top: 0, visibility: ready ? undefined : 'hidden', zIndex: on ? 6 : 4, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, pointerEvents: 'auto', userSelect: 'none' }}>
          {/* 说明卡：贴着这个标签弹出来，跟着它走 */}
          {on && (
            <div className="splat-card" onClick={e => e.stopPropagation()} style={{ position: 'absolute', bottom: 'calc(100% + 10px)', left: '50%', transform: 'translateX(-50%)', width: 'min(380px, 80vw)', padding: '14px 16px', borderRadius: 14, background: 'rgba(15,18,36,.92)', border: '1.5px solid #ffd166', color: '#e6e8f5', backdropFilter: 'blur(10px)', boxShadow: '0 20px 60px rgba(0,0,0,.55)', cursor: 'default', textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#ffd166' }}>{h.name}</div>
                <button onClick={() => setOpen(null)} style={{ border: 0, background: 'transparent', color: '#9aa0c8', cursor: 'pointer', fontSize: 15 }}>✕</button>
              </div>
              <div style={{ marginTop: 6, fontSize: 13.5, lineHeight: 1.7, color: '#d9dcef', whiteSpace: 'normal' }}>{h.desc}</div>
              <div className="splat-card-arrow" style={{ position: 'absolute', left: '50%', bottom: -8, width: 14, height: 14, transform: 'translateX(-50%) rotate(45deg)', background: 'rgba(15,18,36,.92)', borderRight: '1.5px solid #ffd166', borderBottom: '1.5px solid #ffd166' }} />
            </div>
          )}
          <div className="splat-pill" style={{ padding: '8px 16px', borderRadius: 999, fontSize: 15, fontWeight: 800, letterSpacing: '.02em', color: on ? '#171a2e' : '#fff', background: on ? '#ffd166' : 'rgba(15,18,36,.72)', border: `1.5px solid ${on ? '#ffd166' : 'rgba(255,255,255,.45)'}`, boxShadow: '0 6px 20px rgba(0,0,0,.35)', whiteSpace: 'nowrap', transition: 'background .15s, color .15s, transform .15s' }}>{h.name}</div>
          <div style={{ width: 2, height: 18, background: on ? '#ffd166' : 'rgba(255,255,255,.7)' }} />
          <div style={{ width: 10, height: 10, borderRadius: 5, background: on ? '#ffd166' : '#fff', boxShadow: '0 0 0 4px rgba(255,255,255,.25)' }} />
        </div>); })}
      <style>{`.splat-tag:hover > div.splat-pill { background: #ffd166 !important; color: #171a2e !important; transform: scale(1.06); }
.splat-tag[data-flip="1"] .splat-card { bottom: auto; top: calc(100% + 10px); }
.splat-tag[data-flip="1"] .splat-card-arrow { bottom: auto; top: -8px; transform: translateX(-50%) rotate(225deg); }`}</style>
      {head && (camCorner
        ? <div style={{ position: 'absolute', zIndex: 5, ...camCorner }}><HeadCam onPose={onHead} /></div>
        : <div style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 }}><HeadCam onPose={onHead} /></div>)}
    </>
  );
}
