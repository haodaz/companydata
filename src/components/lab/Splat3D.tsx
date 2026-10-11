'use client';

/**
 * 3D 高斯场景（3D beta）：机位跟着鼠标，打开 head 后跟着头（摄像头本机推理，不录不传）——屏幕像一扇窗。
 * 独立查看器 /lab/beta/3d/<key> 和操作台背景共用。
 *   pan：-1…1，在重建出来的机位轨迹上整体往左 / 右挪（操作台每往下走一步挪一点，像在房间里走动）
 */
import { useEffect, useRef, useState } from 'react';
import type { Beta3DScene } from '@/lib/lab-3d-beta';
import { HeadCam, type HeadPose } from '@/components/lab/HeadCam';

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export function Splat3D({ scene: s, head = false, pan = 0, camCorner, onReady, onHeadSeen }: {
  scene: Beta3DScene; head?: boolean; pan?: number;
  /** 摄像头小窗放在哪个角（不传就不显示小窗，但照样追踪） */
  camCorner?: React.CSSProperties;
  onReady?: () => void; onHeadSeen?: (seen: boolean) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const input = useRef({ x: 0, y: 0, z: 0 });
  const panRef = useRef(pan);
  panRef.current = pan;
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!s.url || !host.current) return;
    let viewer: any = null, raf = 0, dead = false;
    (async () => {
      try {
        const GS: any = await import('@mkkellogg/gaussian-splats-3d');
        if (dead) return;
        viewer = new GS.Viewer({
          rootElement: host.current, cameraUp: s.up, initialCameraPosition: s.position, initialCameraLookAt: s.lookAt,
          useBuiltInControls: false, sharedMemoryForWorkers: false, selfDrivenMode: true, dynamicScene: false, sphericalHarmonicsDegree: 1,
        });
        await viewer.addSplatScene(s.url, { showLoadingUI: false, progressiveLoad: false, splatAlphaRemovalThreshold: 5, onProgress: (p: number) => setProgress(Math.round(p)) });
        if (dead) return;
        viewer.start();
        setReady(true); onReady?.();
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
        };
        tick();
      } catch (e: any) { setErr(`3D 场景加载失败：${e?.message || e}`); }
    })();
    // dispose 是异步的：React 已经把容器拿掉时它再删画布会报 removeChild，try/catch 接不住，要接它返回的 promise
    return () => { dead = true; cancelAnimationFrame(raf); try { Promise.resolve(viewer?.dispose()).catch(() => {}); } catch { /* 已释放 */ } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.url]);

  // 没开摄像头：跟着鼠标
  useEffect(() => {
    if (head) return;
    const move = (e: PointerEvent) => { input.current = { x: (e.clientX / window.innerWidth - 0.5) * 2, y: (e.clientY / window.innerHeight - 0.5) * 2, z: 0 }; };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, [head]);
  useEffect(() => { input.current = { x: 0, y: 0, z: 0 }; onHeadSeen?.(false); }, [head]); // eslint-disable-line react-hooks/exhaustive-deps

  const onHead = (p: HeadPose | null) => { if (p) { input.current = { x: p.x * 1.6, y: p.y * 1.2, z: p.z }; onHeadSeen?.(true); } };

  return (
    <>
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      {!ready && !err && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 13, letterSpacing: '.2em', color: '#9aa0c8' }}>LOADING 3D SCENE</div>
            <div style={{ marginTop: 10, width: 240, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.12)', overflow: 'hidden' }}><div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg,#6a5cff,#12b5cb)' }} /></div>
          </div>
        </div>
      )}
      {err && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#ff8fa3' }}>{err}</div>}
      {head && (camCorner
        ? <div style={{ position: 'absolute', zIndex: 5, ...camCorner }}><HeadCam onPose={onHead} /></div>
        : <div style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 }}><HeadCam onPose={onHead} /></div>)}
    </>
  );
}
