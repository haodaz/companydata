'use client';

/**
 * 360° 全景查看器（3D beta 的可选素材）：GoPro Max / Insta360 导出的等距柱状 2:1 图片或视频，贴在一个球的内壁上，人站在球心往外看。
 * 拖动（鼠标 / 触屏）转头看，滚轮拉近拉远；打开 head 后跟着头转（摄像头本机推理，不录不传）。
 * 只能转、不能挪——没有视差，这是和 3D 高斯（Splat3D）的根本区别；要视差得走 make-scene.mjs --equirect 重建。
 *   yaw：一打开朝哪看，度，0 = 画面正中，正数往右
 *   视频：静音、循环、playsInline（手机上不全屏）
 */
import { useEffect, useRef, useState } from 'react';
import { HeadCam, type HeadPose } from '@/components/lab/HeadCam';

export function Pano360({ src, kind, yaw = 0, head = false, camCorner, onReady, onHeadSeen }: {
  src: string; kind: 'image' | 'video'; yaw?: number; head?: boolean;
  /** 摄像头小窗放在哪个角（不传就不显示小窗，但照样追踪） */
  camCorner?: React.CSSProperties;
  onReady?: () => void; onHeadSeen?: (seen: boolean) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  // 视线：lon 水平（度），lat 俯仰（度），fov 视场角；拖动改 lon / lat，头部只叠一个偏移
  const view = useRef({ lon: 180 + yaw, lat: 0, fov: 75 });
  const headIn = useRef({ x: 0, y: 0, z: 0 });
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!src || !host.current) return;
    let dead = false, raf = 0, dispose = () => {};
    const el = host.current;
    view.current = { lon: 180 + yaw, lat: 0, fov: 75 };
    (async () => {
      try {
        const THREE = await import('three');
        if (dead) return;
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(el.clientWidth, el.clientHeight);
        renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
        el.appendChild(renderer.domElement);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, el.clientWidth / Math.max(1, el.clientHeight), 0.1, 1100);
        // 球内壁：x 翻过来，贴图从里面看才是正的。three 的球 u=0.5（画面正中）落在 -x 方向，所以 lon=180 看的是画面正中
        const geo = new THREE.SphereGeometry(500, 72, 48); geo.scale(-1, 1, 1);

        let tex: import('three').Texture, video: HTMLVideoElement | null = null;
        if (kind === 'video') {
          video = Object.assign(document.createElement('video'), { src, crossOrigin: 'anonymous', loop: true, muted: true, playsInline: true, autoplay: true, preload: 'auto' });
          video.setAttribute('playsinline', ''); video.setAttribute('muted', '');
          await new Promise<void>((ok, bad) => {
            video!.addEventListener('loadeddata', () => ok(), { once: true });
            video!.addEventListener('error', () => bad(new Error('视频读不出来（格式不支持或跨域）')), { once: true });
          });
          await video.play().catch(() => {});   // 自动播放被拦就停在第一帧，点一下再播（见下面 pointerdown）
          tex = new THREE.VideoTexture(video);
        } else {
          tex = await new THREE.TextureLoader().setCrossOrigin('anonymous').loadAsync(src);
        }
        if (dead) { tex.dispose(); geo.dispose(); renderer.dispose(); renderer.domElement.remove(); if (video) { video.pause(); video.removeAttribute('src'); video.load(); } return; }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;   // 8K 全景不做 mipmap，省显存
        const mat = new THREE.MeshBasicMaterial({ map: tex });
        scene.add(new THREE.Mesh(geo, mat));
        setReady(true); onReady?.();

        const resize = () => { renderer.setSize(el.clientWidth, el.clientHeight); camera.aspect = el.clientWidth / Math.max(1, el.clientHeight); camera.updateProjectionMatrix(); };
        const ro = new ResizeObserver(resize); ro.observe(el);

        const cur = { x: 0, y: 0, z: 0 };
        const target = new THREE.Vector3();
        const tick = () => {
          raf = requestAnimationFrame(tick);
          for (const k of ['x', 'y', 'z'] as const) cur[k] += (headIn.current[k] - cur[k]) * 0.12;
          const v = view.current;
          // 头往右挪 → 像透过窗户往左边看（和 Splat3D 的窗户方向一致）；凑近 → 拉近
          const lon = v.lon - cur.x * 35, lat = Math.max(-85, Math.min(85, v.lat + cur.y * 20));
          const fov = Math.max(30, Math.min(100, v.fov - cur.z * 25));
          if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
          const phi = THREE.MathUtils.degToRad(90 - lat), theta = THREE.MathUtils.degToRad(lon);
          target.set(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
          camera.lookAt(target);
          renderer.render(scene, camera);
        };
        tick();

        // 拖动转头：按住拖，往右拖 = 视线往左（像抓着画面拖）
        let drag: { x: number; y: number; lon: number; lat: number } | null = null;
        const down = (e: PointerEvent) => {
          if (video?.paused) video.play().catch(() => {});
          drag = { x: e.clientX, y: e.clientY, lon: view.current.lon, lat: view.current.lat };
          el.setPointerCapture(e.pointerId);
        };
        const move = (e: PointerEvent) => {
          if (!drag) return;
          const k = view.current.fov / el.clientHeight;   // 一个屏高 ≈ 一个视场角，拖起来跟手
          view.current.lon = drag.lon - (e.clientX - drag.x) * k;
          view.current.lat = Math.max(-85, Math.min(85, drag.lat + (e.clientY - drag.y) * k));
        };
        const up = (e: PointerEvent) => { drag = null; if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId); };
        const wheel = (e: WheelEvent) => { e.preventDefault(); view.current.fov = Math.max(30, Math.min(100, view.current.fov + e.deltaY * 0.05)); };
        el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
        el.addEventListener('wheel', wheel, { passive: false });

        dispose = () => {
          ro.disconnect();
          el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
          el.removeEventListener('wheel', wheel);
          tex.dispose(); mat.dispose(); geo.dispose(); renderer.dispose(); renderer.domElement.remove();
          if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
        };
      } catch (e) { if (!dead) setErr(`360° 画面加载失败：${e instanceof Error ? e.message : e}`); }
    })();
    return () => { dead = true; cancelAnimationFrame(raf); dispose(); setReady(false); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, kind]);

  // yaw 改了（上传页调朝向）：直接转过去，不重新加载
  useEffect(() => { view.current.lon = 180 + yaw; }, [yaw]);
  useEffect(() => { headIn.current = { x: 0, y: 0, z: 0 }; onHeadSeen?.(false); }, [head]); // eslint-disable-line react-hooks/exhaustive-deps
  const onHead = (p: HeadPose | null) => { if (!p) return; onHeadSeen?.(true); headIn.current = { x: p.x, y: p.y, z: p.z }; };

  return (
    <>
      <div ref={host} style={{ position: 'absolute', inset: 0, cursor: 'grab', touchAction: 'none' }} />
      {!ready && !err && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <div style={{ fontSize: 13, letterSpacing: '.2em', color: '#9aa0c8' }}>LOADING 360°</div>
        </div>
      )}
      {err && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#ff8fa3', padding: 20, textAlign: 'center' }}>{err}</div>}
      {head && (camCorner
        ? <div style={{ position: 'absolute', zIndex: 5, ...camCorner }}><HeadCam onPose={onHead} /></div>
        : <div style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 }}><HeadCam onPose={onHead} /></div>)}
    </>
  );
}
