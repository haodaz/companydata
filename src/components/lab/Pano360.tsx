'use client';

/**
 * 360° 全景查看器（3D beta 的可选素材）：GoPro Max / Insta360 导出的等距柱状 2:1 图片或视频，贴在一个球的内壁上，人站在球心往外看。
 * 拖动（鼠标 / 触屏）转头看，滚轮 / 双指捏合 / W S 拉近拉远；打开 head 后跟着头转，往前凑 = 走近（视场角变窄）。
 * 只能转、不能挪——没有视差，这是和 3D 高斯（Splat3D）的根本区别；要视差得走 make-scene.mjs --equirect 重建。
 *   yaw：一打开朝哪看，度，0 = 画面正中，正数往右
 *   spots：识别出来的要素，钉在 yaw / pitch 上，点开看说明；conf < 0.5 的藏起来（showAll 时全显示）
 *   nodes：街景式多点位。地上画箭头（links），点箭头 / W / 前倾对准箭头 → 走到下一个点位。
 *          node.yaw = 这张图的正中在「世界」里朝哪（度）；跨点位时保持世界朝向不变，所以各点位的图不用拍得朝向一致
 *   walk：边走边拍的视频——不循环播放，前倾 / 按住 W 往前播，S / 往后仰慢慢倒回去
 *   视频（非 walk）：静音、循环、playsInline（手机上不全屏）
 */
import { useEffect, useRef, useState } from 'react';
import type * as T from 'three';
import { HeadCam, type HeadPose } from '@/components/lab/HeadCam';
import type { PanoNode, PanoSpot } from '@/lib/lab-3d-beta';

type Link = NonNullable<PanoNode['links']>[number];
type Layer = { url: string; kind: 'image' | 'video'; mesh: T.Mesh; mat: T.MeshBasicMaterial; tex: T.Texture; video: HTMLVideoElement | null };

const FOV_MIN = 30, FOV_MAX = 100;
const clampFov = (f: number) => Math.max(FOV_MIN, Math.min(FOV_MAX, f));
/** a − b 的角度差，落在 −180–180 */
const angDiff = (a: number, b: number) => ((a - b) % 360 + 540) % 360 - 180;
/** 视线 lon / lat（度）→ 单位方向。和球的贴图对齐：lon = 180 + 图上 yaw，lat = pitch */
const lonLatDir = (lon: number, lat: number): [number, number, number] => {
  const phi = (90 - lat) * Math.PI / 180, th = lon * Math.PI / 180;
  return [Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th)];
};
// 地上箭头：离人水平 1.3、低 0.91 → 俯角约 35°；有点位时开场视线往下压 8°，箭头一进来就在画面下沿（和街景一样）
const ARROW_D = 1.3, ARROW_H = 0.91, STREET_LAT = -8;
const LEAN_STEP = 0.5, LEAN_REARM = 0.2, LEAN_AIM = 25;   // 前倾迈步：z 过 0.5、视线对准箭头 25° 内；退回 0.2 以下才能迈下一步
const conf = (s: PanoSpot) => s.conf ?? 1;

export function Pano360({ src, kind, yaw = 0, head = false, camCorner, onReady, onHeadSeen, spots, nodes, walk = false, showAll = false }: {
  src: string; kind: 'image' | 'video'; yaw?: number; head?: boolean;
  /** 摄像头小窗放在哪个角（不传就不显示小窗，但照样追踪） */
  camCorner?: React.CSSProperties;
  onReady?: () => void; onHeadSeen?: (seen: boolean) => void;
  /** 单点位的要素（有 nodes 时是起点那张的兜底） */ spots?: PanoSpot[];
  /** 街景式多点位 */ nodes?: PanoNode[];
  /** 视频沿拍摄路线走（不循环） */ walk?: boolean;
  /** 低置信度的要素也显示（?all=1） */ showAll?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  // 视线：lon 水平（度），lat 俯仰（度），fov 视场角（目标值，画面上有平滑）；拖动改 lon / lat，头部只叠一个偏移
  const view = useRef({ lon: 180 + yaw, lat: nodes?.length ? STREET_LAT : 0, fov: 75 });
  const aim = useRef<{ lon: number; lat: number; k: number } | null>(null);   // 平滑转过去（点列表 / 走向箭头）
  const headIn = useRef({ x: 0, y: 0, z: 0 });
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');

  // 点位 / 要素
  const startNode = nodes?.find(n => n.url === src) || nodes?.[0];
  const [nodeId, setNodeId] = useState(startNode?.id || '');
  const node = nodes?.find(n => n.id === nodeId) || null;
  const curSpots = (node ? (node.spots ?? (node.url === src ? spots : undefined)) : spots) || [];
  const visible = curSpots.filter(s => showAll || conf(s) >= 0.5);
  const [filter, setFilter] = useState<string | null>(null);
  const [moreTags, setMoreTags] = useState(false);
  const [listOpen, setListOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 720);   // 手机上默认收起
  const [open, setOpen] = useState<string | null>(null);
  const shown = filter ? visible.filter(s => s.kind === filter || s.tags.includes(filter)) : visible;
  const [videoUi, setVideoUi] = useState(false);   // 当前是行走视频：显示进度条

  // 给每帧循环读的
  const shownRef = useRef(shown); shownRef.current = shown;
  const markerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const nodesRef = useRef(nodes); nodesRef.current = nodes;
  const nodeIdRef = useRef(nodeId);
  const walkRef = useRef(walk); walkRef.current = walk;
  const headRef = useRef(head); headRef.current = head;
  const want = useRef({ url: startNode?.url || src, kind: startNode?.kind || kind });
  const swapRef = useRef<((url: string, kind: 'image' | 'video') => void) | null>(null);
  const leanHud = useRef<HTMLDivElement>(null);
  const arrowTip = useRef<HTMLDivElement>(null);
  const progBar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current) return;
    let dead = false, raf = 0, dispose = () => {};
    const el = host.current;
    view.current = { lon: 180 + yaw, lat: nodesRef.current?.length ? STREET_LAT : 0, fov: 75 };
    (async () => {
      try {
        const THREE = await import('three');
        if (dead) return;
        const DEG = Math.PI / 180;
        // 球内壁：x 翻过来，贴图从里面看才是正的。three 的球 u=0.5（画面正中）落在 -x 方向，所以 lon=180 看的是画面正中
        const geo = new THREE.SphereGeometry(500, 72, 48); geo.scale(-1, 1, 1);
        const loader = new THREE.TextureLoader().setCrossOrigin('anonymous');

        // 一个点位一张贴图（8K 不做 mipmap，省显存）；换点位时旧的整个 dispose
        const mkLayer = async (url: string, k: 'image' | 'video'): Promise<Layer> => {
          let tex: T.Texture, video: HTMLVideoElement | null = null;
          if (k === 'video') {
            const walking = walkRef.current;
            video = Object.assign(document.createElement('video'), { src: url, crossOrigin: 'anonymous', loop: !walking, muted: true, playsInline: true, autoplay: !walking, preload: 'auto' });
            video.setAttribute('playsinline', ''); video.setAttribute('muted', '');
            try {
              await new Promise<void>((ok, bad) => {
                video!.addEventListener('loadeddata', () => ok(), { once: true });
                video!.addEventListener('error', () => bad(new Error('视频读不出来（格式不支持或跨域）')), { once: true });
              });
            } catch (e) { video.removeAttribute('src'); video.load(); throw e; }
            if (!walking) await video.play().catch(() => {});   // 自动播放被拦就停在第一帧，点一下再播（见 pointerdown）
            const vt = new THREE.VideoTexture(video); tex = vt;
            if (walking) video.addEventListener('seeked', () => { vt.needsUpdate = true; });   // 暂停时倒退（seek）也要刷新画面
          } else {
            tex = await loader.loadAsync(url);
          }
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
          // 不做深度测试：叠两层做淡入淡出、地上箭头都靠 renderOrder 排先后
          const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
          return { url, kind: k, mesh: new THREE.Mesh(geo, mat), mat, tex, video };
        };
        const drop = (l: Layer) => {
          l.mesh.removeFromParent(); l.tex.dispose(); l.mat.dispose();
          if (l.video) { l.video.pause(); l.video.removeAttribute('src'); l.video.load(); }
        };

        let cur = await mkLayer(want.current.url, want.current.kind);
        if (dead) { drop(cur); geo.dispose(); return; }
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(el.clientWidth, el.clientHeight);
        renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
        el.appendChild(renderer.domElement);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, el.clientWidth / Math.max(1, el.clientHeight), 0.1, 1100);
        scene.add(cur.mesh);
        setVideoUi(walkRef.current && cur.kind === 'video');
        setReady(true); onReady?.();

        const resize = () => { renderer.setSize(el.clientWidth, el.clientHeight); camera.aspect = el.clientWidth / Math.max(1, el.clientHeight); camera.updateProjectionMatrix(); };
        const ro = new ResizeObserver(resize); ro.observe(el);

        // ── 地上箭头（街景式）：平铺在脚下的人字形，透视自然压扁 ──
        const chev = new THREE.Shape([[0, .42], [.42, -.02], [.42, -.24], [0, .17], [-.42, -.24], [-.42, -.02]].map(([x, y]) => new THREE.Vector2(x, y)));
        const arrowGeo = new THREE.ShapeGeometry(chev); arrowGeo.rotateX(-Math.PI / 2);   // 形状的 +y → 局部 -z（箭头指向）
        const hitGeo = new THREE.CircleGeometry(.6, 24); hitGeo.rotateX(-Math.PI / 2);
        const arrows = new THREE.Group(); scene.add(arrows);
        type Arrow = { g: T.Group; link: Link; main: T.MeshBasicMaterial; hit: T.Mesh };
        let arrowList: Arrow[] = [];
        const buildArrows = (links: Link[]) => {
          for (const a of arrowList) a.g.traverse(o => { if ((o as T.Mesh).isMesh) ((o as T.Mesh).material as T.Material).dispose(); });
          arrows.clear(); arrowList = [];
          for (const link of links) {
            const th = (180 + link.yaw) * DEG;
            const g = new THREE.Group();
            g.position.set(Math.cos(th) * ARROW_D, -ARROW_H, Math.sin(th) * ARROW_D);
            g.rotation.y = -th - Math.PI / 2;   // 局部 -z 转到 (cos th, 0, sin th)
            g.scale.setScalar(.6);
            const shade = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .35, depthTest: false, depthWrite: false }));
            shade.scale.setScalar(1.18); shade.position.y = -.01; shade.renderOrder = 10;
            const main = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .85, depthTest: false, depthWrite: false });
            const m = new THREE.Mesh(arrowGeo, main); m.renderOrder = 11;
            const hit = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, colorWrite: false, depthTest: false, depthWrite: false }));
            g.add(shade, m, hit); arrows.add(g);
            arrowList.push({ g, link, main, hit });
          }
        };
        const nodeNow = () => nodesRef.current?.find(n => n.id === nodeIdRef.current);
        buildArrows(nodeNow()?.links || []);

        // ── 走到下一个点位：转向箭头 + 拉近 → 新图淡入 → 恢复视场角 ──
        const headS = { x: 0, y: 0, z: 0 };   // 平滑后的头部输入
        let fx = 0, fxT = 0;   // 过场时叠在视场角上的偏移（负 = 拉近）
        let trans = false, fade: { t0: number; old: Layer } | null = null;
        const go = async (link: Link) => {
          if (trans) return;
          const from = nodeNow(), to = nodesRef.current?.find(n => n.id === link.to);
          if (!from || !to) return;
          trans = true; arrows.visible = false; setOpen(null);
          aim.current = { lon: 180 + link.yaw, lat: STREET_LAT, k: .2 };
          fxT = -16;
          const t0 = performance.now();
          let next: Layer;
          try { next = await mkLayer(to.url, to.kind); }
          catch { trans = false; fxT = 0; aim.current = null; arrows.visible = true; return; }
          if (dead) { drop(next); return; }
          const left = 320 - (performance.now() - t0);
          if (left > 0) await new Promise(r => setTimeout(r, left));
          if (dead) { drop(next); return; }
          // 换参考系：世界朝向不变。旧图跟着转同样的角度，淡出时看起来没动
          const delta = (from.yaw || 0) - (to.yaw || 0);
          aim.current = null;
          view.current.lon = 180 + link.yaw + delta;
          const old = cur; old.mesh.rotation.y = -delta * DEG; old.mesh.renderOrder = 0;
          cur = next; cur.mat.opacity = 0; cur.mesh.renderOrder = 1; scene.add(cur.mesh);
          if (cur.video && walkRef.current) cur.video.pause();
          nodeIdRef.current = to.id; setNodeId(to.id);
          setVideoUi(walkRef.current && cur.kind === 'video');
          buildArrows(to.links || []);
          fade = { t0: performance.now(), old }; fxT = 0;
        };
        // W / S：走向离视线（或背后）最近的箭头（90° 以内才算）
        const stepNearest = (off: number) => {
          const vy = view.current.lon - headS.x * 35 - 180 + off;
          let best: Arrow | null = null, bd = 90;
          for (const a of arrowList) { const d = Math.abs(angDiff(a.link.yaw, vy)); if (d < bd) { bd = d; best = a; } }
          if (best) go(best.link);
        };

        // 单点位换图（上传页换素材）：直接换，不做过场
        swapRef.current = async (url, k) => {
          if (url === cur.url && k === cur.kind) return;
          try {
            const next = await mkLayer(url, k);
            if (dead) { drop(next); return; }
            drop(cur); cur = next; scene.add(cur.mesh); setVideoUi(walkRef.current && cur.kind === 'video');
          } catch (e) { setErr(`360° 画面加载失败：${e instanceof Error ? e.message : e}`); }
        };
        if (!nodesRef.current?.length && (want.current.url !== cur.url || want.current.kind !== cur.kind)) swapRef.current(want.current.url, want.current.kind);

        // ── 输入：拖动 / 捏合 / 滚轮 / 键盘 ──
        const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
        const pickArrow = (cx: number, cy: number): Arrow | null => {
          if (!arrows.visible || !arrowList.length) return null;
          const r = el.getBoundingClientRect();
          ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
          ray.setFromCamera(ndc, camera);
          const hit = ray.intersectObjects(arrowList.map(a => a.hit), false)[0];
          return hit ? arrowList.find(a => a.hit === hit.object) || null : null;
        };
        let hover: Arrow | null = null;
        const pts = new Map<number, { x: number; y: number }>();
        let drag: { x: number; y: number; lon: number; lat: number } | null = null;
        let pinch: { d: number; fov: number } | null = null;
        let downAt: { x: number; y: number } | null = null;
        const spread = () => { const [a, b] = [...pts.values()]; return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)); };
        const down = (e: PointerEvent) => {
          if (cur.video?.paused && !walkRef.current) cur.video.play().catch(() => {});
          pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pts.size === 2) { drag = null; downAt = null; pinch = { d: spread(), fov: view.current.fov }; }
          else if (pts.size === 1) { drag = { x: e.clientX, y: e.clientY, lon: view.current.lon, lat: view.current.lat }; downAt = { x: e.clientX, y: e.clientY }; aim.current = null; }
          el.setPointerCapture(e.pointerId);
        };
        const move = (e: PointerEvent) => {
          if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pinch && pts.size >= 2) { view.current.fov = clampFov(pinch.fov * pinch.d / spread()); return; }
          if (drag) {
            const k = camera.fov / el.clientHeight;   // 一个屏高 ≈ 一个视场角，拖起来跟手
            view.current.lon = drag.lon - (e.clientX - drag.x) * k;
            view.current.lat = Math.max(-85, Math.min(85, drag.lat + (e.clientY - drag.y) * k));
            return;
          }
          if (e.pointerType === 'mouse') { hover = pickArrow(e.clientX, e.clientY); el.style.cursor = hover ? 'pointer' : 'grab'; }
        };
        const up = (e: PointerEvent) => {
          pts.delete(e.pointerId);
          if (pinch && pts.size < 2) pinch = null;
          if (drag && downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6) {
            const a = pickArrow(e.clientX, e.clientY);
            if (a) go(a.link); else setOpen(null);   // 点空白处：关掉说明卡
          }
          drag = null; downAt = null;
          if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
        };
        const wheel = (e: WheelEvent) => { e.preventDefault(); view.current.fov = clampFov(view.current.fov + e.deltaY * 0.05); };
        const keys = { fwd: false, back: false, turn: 0 };
        const walkingNow = () => walkRef.current && cur.kind === 'video';
        const keyDown = (e: KeyboardEvent) => {
          const t = e.target as HTMLElement | null;
          if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
          const k = e.key.toLowerCase();
          const street = !!nodesRef.current?.length && !walkingNow();
          if (k === 'w' || k === 'arrowup') { keys.fwd = true; if (street && !e.repeat) stepNearest(0); }
          else if (k === 's' || k === 'arrowdown') { keys.back = true; if (street && !e.repeat) stepNearest(180); }
          else if (k === 'a' || k === 'arrowleft') keys.turn = -1;
          else if (k === 'd' || k === 'arrowright') keys.turn = 1;
          else if (k === '=' || k === '+') view.current.fov = clampFov(view.current.fov - 6);
          else if (k === '-') view.current.fov = clampFov(view.current.fov + 6);
          else if (k === 'escape') { setOpen(null); return; }
          else return;
          e.preventDefault();
        };
        const keyUp = (e: KeyboardEvent) => {
          const k = e.key.toLowerCase();
          if (k === 'w' || k === 'arrowup') keys.fwd = false;
          else if (k === 's' || k === 'arrowdown') keys.back = false;
          else if (k === 'a' || k === 'arrowleft' || k === 'd' || k === 'arrowright') keys.turn = 0;
        };
        const blur = () => { keys.fwd = keys.back = false; keys.turn = 0; };
        el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
        el.addEventListener('wheel', wheel, { passive: false });
        window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp); window.addEventListener('blur', blur);

        // ── 每帧 ──
        const target = new THREE.Vector3(), fwd = new THREE.Vector3(), tmp = new THREE.Vector3();
        const yellow = new THREE.Color(0xffd166), white = new THREE.Color(0xffffff);
        let fovS = view.current.fov, last = performance.now(), armed = true, cool = 0, backAcc = 0;
        const tick = () => {
          raf = requestAnimationFrame(tick);
          const now = performance.now(), dt = Math.min(.05, (now - last) / 1000); last = now;
          for (const k of ['x', 'y', 'z'] as const) headS[k] += (headIn.current[k] - headS[k]) * 0.12;
          // 前倾量：0.06 以内当没动（脸不可能完全不晃）
          const lean = Math.sign(headS.z) * Math.max(0, Math.abs(headS.z) - .06);
          const v = view.current, walking = walkingNow(), street = !!nodesRef.current?.length && !walking;
          if (keys.turn) { v.lon += keys.turn * 70 * dt; aim.current = null; }
          if (!street && !walking) {   // 单张图：W / S 按住就是往前走近 / 往后退
            if (keys.fwd) v.fov = clampFov(v.fov - 40 * dt);
            if (keys.back) v.fov = clampFov(v.fov + 40 * dt);
          }
          const a = aim.current;
          if (a) {
            const dl = angDiff(a.lon, v.lon), dd = a.lat - v.lat;
            v.lon += dl * a.k; v.lat += dd * a.k;
            if (Math.abs(dl) < .05 && Math.abs(dd) < .05) aim.current = null;
          }
          // 视场角：目标（滚轮 / 键 / 捏合）− 前倾（凑近 → 变窄 = 往前走）+ 过场拉近，再整体平滑，像迈步而不是跳
          fx += (fxT - fx) * .12;
          const fovGoal = clampFov(v.fov - lean * (walking ? 8 : 40)) + fx;
          fovS += (fovGoal - fovS) * .1;
          const fov = Math.max(20, Math.min(FOV_MAX, fovS));
          if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
          // 头往右挪 → 像透过窗户往左边看（和 Splat3D 的窗户方向一致）
          const lon = v.lon - headS.x * 35, lat = Math.max(-85, Math.min(85, v.lat + headS.y * 20));
          target.set(...lonLatDir(lon, lat));
          camera.lookAt(target); camera.updateMatrixWorld();
          camera.getWorldDirection(fwd);

          // 过场淡入
          if (fade) {
            const k = Math.min(1, (now - fade.t0) / 450);
            cur.mat.opacity = k;
            if (k >= 1) { drop(fade.old); fade = null; cur.mesh.renderOrder = 0; trans = false; arrows.visible = true; }
          }

          // 行走视频：前倾 / W 往前播，后仰 / S 慢慢倒回
          if (walking && cur.video) {
            const vid = cur.video;
            const fwdOn = keys.fwd || lean > .18, backOn = keys.back || lean < -.3;
            if (fwdOn) {
              backAcc = 0;
              vid.playbackRate = keys.fwd ? 1 : Math.max(.4, Math.min(1.6, .4 + (lean - .18) * 2.5));
              if (vid.paused && !vid.ended) vid.play().catch(() => {});
            } else {
              if (!vid.paused) vid.pause();
              if (backOn && vid.currentTime > 0) {
                backAcc += dt * .5;
                if (!vid.seeking) { vid.currentTime = Math.max(0, vid.currentTime - backAcc); backAcc = 0; }
              }
            }
            if (progBar.current && vid.duration) progBar.current.style.width = `${(vid.currentTime / vid.duration * 100).toFixed(2)}%`;
          }

          // 前倾迈步：视线对准某个箭头（25° 内）且前倾过线 → 走过去；之后要先退回来才能迈下一步
          let leanTo: Arrow | null = null;
          if (street && headRef.current && !trans) {
            const vy = lon - 180; let bd = LEAN_AIM;
            for (const ar of arrowList) { const d = Math.abs(angDiff(ar.link.yaw, vy)); if (d < bd) { bd = d; leanTo = ar; } }
            if (lean < LEAN_REARM) armed = true;
            if (leanTo && lean > LEAN_STEP && armed && now > cool) { armed = false; cool = now + 1500; go(leanTo.link); }
          }
          const hud = leanHud.current;
          if (hud) {
            const p = leanTo ? Math.max(0, Math.min(1, lean / LEAN_STEP)) : 0;
            hud.style.display = leanTo && armed ? 'flex' : 'none';
            if (leanTo) {
              const lbl = hud.firstElementChild as HTMLElement, bar = hud.lastElementChild?.firstElementChild as HTMLElement;
              const txt = `往前倾，走向${leanTo.link.label ? `「${leanTo.link.label}」` : '这个方向'}`;
              if (lbl.textContent !== txt) lbl.textContent = txt;
              bar.style.width = `${(p * 100).toFixed(1)}%`;
            }
          }
          for (const ar of arrowList) {
            const on = ar === hover || ar === leanTo;
            const p = ar === leanTo ? Math.max(0, Math.min(1, lean / LEAN_STEP)) : 0;
            ar.main.color.copy(on ? yellow : white); ar.main.opacity = on ? 1 : .85;
            ar.g.scale.setScalar(.6 * (1 + (ar === hover ? .12 : 0) + p * .25));
          }
          // 悬停箭头：旁边写上去哪
          const tip = arrowTip.current;
          if (tip) {
            if (hover && arrows.visible) {
              tmp.copy(hover.g.position).project(camera);
              tip.style.display = 'block';
              tip.textContent = hover.link.label || '走过去';
              tip.style.transform = `translate(${((tmp.x + 1) / 2 * el.clientWidth).toFixed(1)}px, ${((1 - tmp.y) / 2 * el.clientHeight + 26).toFixed(1)}px) translate(-50%, 0)`;
            } else tip.style.display = 'none';
          }

          // 要素标记：每帧把 yaw / pitch 投到屏幕上；在身后的、出了屏幕的藏起来
          const w = el.clientWidth, h = el.clientHeight;
          for (const s of shownRef.current) {
            const m = markerRefs.current[s.id]; if (!m) continue;
            tmp.set(...lonLatDir(180 + s.yaw, s.pitch));
            let show = !trans && tmp.dot(fwd) > .05;
            let x = 0, y = 0;
            if (show) {
              tmp.multiplyScalar(100).project(camera);
              x = (tmp.x + 1) / 2 * w; y = (1 - tmp.y) / 2 * h;
              show = x > -40 && x < w + 40 && y > -40 && y < h + 40;
            }
            m.style.visibility = show ? 'visible' : 'hidden';
            if (show) {
              m.dataset.flip = y < 300 ? '1' : '';   // 靠近顶部：说明卡改弹在下面
              m.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
            }
          }
          renderer.render(scene, camera);
        };
        tick();

        dispose = () => {
          ro.disconnect(); swapRef.current = null;
          el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
          el.removeEventListener('wheel', wheel);
          window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', blur);
          buildArrows([]); arrowGeo.dispose(); hitGeo.dispose();
          if (fade) drop(fade.old);
          drop(cur); geo.dispose(); renderer.dispose(); renderer.domElement.remove();
        };
      } catch (e) { if (!dead) setErr(`360° 画面加载失败：${e instanceof Error ? e.message : e}`); }
    })();
    return () => { dead = true; cancelAnimationFrame(raf); dispose(); setReady(false); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 单点位换素材（上传页）：换贴图，不重建渲染器
  useEffect(() => {
    if (nodes?.length) return;
    want.current = { url: src, kind };
    swapRef.current?.(src, kind);
  }, [src, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  // yaw 改了（上传页调朝向）：直接转过去，不重新加载
  useEffect(() => { view.current.lon = 180 + yaw; }, [yaw]);
  useEffect(() => { headIn.current = { x: 0, y: 0, z: 0 }; onHeadSeen?.(false); }, [head]); // eslint-disable-line react-hooks/exhaustive-deps
  const onHead = (p: HeadPose | null) => { if (!p) return; onHeadSeen?.(true); headIn.current = { x: p.x, y: p.y, z: p.z }; };

  // 点列表里的一项：平滑转过去，打开说明卡
  const flyTo = (s: PanoSpot) => { aim.current = { lon: 180 + s.yaw, lat: Math.max(-80, Math.min(80, s.pitch)), k: .08 }; setOpen(s.id); };

  // 分类 + 标签，带个数；分类在前
  const kinds = new Map<string, number>(), tags = new Map<string, number>();
  for (const s of visible) {
    kinds.set(s.kind, (kinds.get(s.kind) || 0) + 1);
    for (const t of new Set(s.tags)) if (t !== s.kind) tags.set(t, (tags.get(t) || 0) + 1);
  }
  for (const k of kinds.keys()) tags.delete(k);
  const byCount = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]);
  const tagList = byCount(tags), TAG_CAP = 8;
  const chips: [string | null, string, number][] = [
    [null, '全部', visible.length],
    ...byCount(kinds).map(([k, n]) => [k, k, n] as [string, string, number]),
    ...(moreTags ? tagList : tagList.slice(0, TAG_CAP)).map(([t, n]) => [t, `#${t}`, n] as [string, string, number]),
  ];
  const chipStyle = (on: boolean): React.CSSProperties => ({ padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', border: `1px solid ${on ? '#ffd166' : 'rgba(255,255,255,.22)'}`, color: on ? '#171a2e' : '#c7cbe6', background: on ? '#ffd166' : 'rgba(15,18,36,.62)', backdropFilter: 'blur(6px)' });

  return (
    <>
      <div ref={host} style={{ position: 'absolute', inset: 0, cursor: 'grab', touchAction: 'none' }} />
      {!ready && !err && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <div style={{ fontSize: 13, letterSpacing: '.2em', color: '#9aa0c8' }}>LOADING 360°</div>
        </div>
      )}
      {err && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#ff8fa3', padding: 20, textAlign: 'center' }}>{err}</div>}

      {/* 要素标记：点 + 圈，悬停出名字，点开说明卡（样式同 Splat3D 的物件说明卡） */}
      {ready && shown.map(s => { const on = open === s.id; return (
        <div key={s.id} ref={n => { markerRefs.current[s.id] = n; }} className="pano-spot" data-on={on ? '1' : ''}
          style={{ position: 'absolute', left: 0, top: 0, visibility: 'hidden', zIndex: on ? 7 : 4, userSelect: 'none' }}>
          {on && (
            <div className="pano-card" onPointerDown={e => e.stopPropagation()} style={{ position: 'absolute', bottom: 'calc(100% + 12px)', left: '50%', transform: 'translateX(-50%)', width: 'min(360px, 80vw)', padding: '14px 16px', borderRadius: 14, background: 'rgba(15,18,36,.92)', border: '1.5px solid #ffd166', color: '#e6e8f5', backdropFilter: 'blur(10px)', boxShadow: '0 20px 60px rgba(0,0,0,.55)', cursor: 'default', textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#ffd166' }}>{s.title}</div>
                <button onClick={() => setOpen(null)} style={{ border: 0, background: 'transparent', color: '#9aa0c8', cursor: 'pointer', fontSize: 15 }}>✕</button>
              </div>
              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 6, color: '#171a2e', background: '#9aa0c8' }}>{s.kind}</span>
                {s.tags.map(t => <span key={t} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, color: '#c7cbe6', border: '1px solid rgba(255,255,255,.22)' }}>{t}</span>)}
                {showAll && <span style={{ fontSize: 11, padding: '2px 8px', color: conf(s) < .5 ? '#ff8fa3' : '#9aa0c8' }}>置信度 {conf(s).toFixed(2)}</span>}
              </div>
              <div style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.7, color: '#d9dcef', whiteSpace: 'normal' }}>{s.desc}</div>
              <div className="pano-card-arrow" style={{ position: 'absolute', left: '50%', bottom: -8, width: 14, height: 14, transform: 'translateX(-50%) rotate(45deg)', background: 'rgba(15,18,36,.92)', borderRight: '1.5px solid #ffd166', borderBottom: '1.5px solid #ffd166' }} />
            </div>
          )}
          <div className="pano-label">{s.title}</div>
          <div className="pano-dot" onClick={() => setOpen(on ? null : s.id)}><i /></div>
        </div>); })}
      <style>{`.pano-spot .pano-dot { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; cursor: pointer; border: 1.5px solid rgba(255,255,255,.45); background: rgba(15,18,36,.22); transition: transform .15s, border-color .15s, background .15s; }
.pano-spot .pano-dot i { width: 7px; height: 7px; border-radius: 50%; background: rgba(255,255,255,.9); box-shadow: 0 0 6px rgba(0,0,0,.7); transition: background .15s; }
.pano-spot:hover .pano-dot, .pano-spot[data-on="1"] .pano-dot { border-color: #ffd166; background: rgba(15,18,36,.55); transform: scale(1.25); box-shadow: 0 0 0 4px rgba(255,209,102,.18); }
.pano-spot:hover .pano-dot i, .pano-spot[data-on="1"] .pano-dot i { background: #ffd166; }
.pano-spot .pano-label { position: absolute; left: 50%; bottom: calc(100% + 6px); transform: translateX(-50%); opacity: 0; pointer-events: none; white-space: nowrap; padding: 4px 10px; border-radius: 999px; font-size: 12.5px; font-weight: 700; color: #fff; background: rgba(15,18,36,.82); border: 1px solid rgba(255,255,255,.3); transition: opacity .15s; }
.pano-spot:hover .pano-label { opacity: 1; }
.pano-spot[data-on="1"] .pano-label { display: none; }
.pano-spot[data-flip="1"] .pano-card { bottom: auto !important; top: calc(100% + 12px); }
.pano-spot[data-flip="1"] .pano-card-arrow { bottom: auto !important; top: -8px; transform: translateX(-50%) rotate(225deg) !important; }`}</style>

      {/* 分类 / 标签筛选 + 「路过的好东西」列表 */}
      {ready && visible.length > 0 && (
        <div style={{ position: 'absolute', left: 20, top: 64, width: 'min(290px, calc(100vw - 40px))', zIndex: 6, display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {chips.map(([k, label, n]) => (
              <button key={label} onClick={() => setFilter(k === filter ? null : k)} style={chipStyle(k === filter)}>{label} <span style={{ opacity: .6 }}>{n}</span></button>
            ))}
            {tagList.length > TAG_CAP && <button onClick={() => setMoreTags(v => !v)} style={{ ...chipStyle(false), borderStyle: 'dashed' }}>{moreTags ? '收起' : `更多 ${tagList.length - TAG_CAP}`}</button>}
          </div>
          <div style={{ borderRadius: 12, background: 'rgba(15,18,36,.72)', border: '1px solid rgba(255,255,255,.18)', backdropFilter: 'blur(8px)', overflow: 'hidden' }}>
            <button onClick={() => setListOpen(v => !v)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', border: 0, background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
              <span>路过的好东西 <span style={{ color: '#9aa0c8', fontWeight: 600 }}>{shown.length}</span></span>
              <span style={{ color: '#9aa0c8', transform: listOpen ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }}>▾</span>
            </button>
            {listOpen && (
              <div style={{ maxHeight: '46vh', overflowY: 'auto', borderTop: '1px solid rgba(255,255,255,.1)' }}>
                {shown.map(s => (
                  <button key={s.id} onClick={() => flyTo(s)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', gap: 8, padding: '7px 12px', border: 0, cursor: 'pointer', textAlign: 'left', fontSize: 12.5, color: open === s.id ? '#ffd166' : '#e6e8f5', background: open === s.id ? 'rgba(255,209,102,.1)' : 'transparent' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
                    <span style={{ flex: 'none', color: '#9aa0c8', fontSize: 11 }}>{s.kind}</span>
                  </button>
                ))}
                {!shown.length && <div style={{ padding: '8px 12px', fontSize: 12, color: '#9aa0c8' }}>这个点位没有这一类</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 悬停箭头的去向、前倾进度（tick 里直接写） */}
      <div ref={arrowTip} style={{ position: 'absolute', left: 0, top: 0, display: 'none', zIndex: 4, pointerEvents: 'none', padding: '3px 9px', borderRadius: 999, fontSize: 12, fontWeight: 700, color: '#171a2e', background: '#ffd166', whiteSpace: 'nowrap' }} />
      <div ref={leanHud} style={{ position: 'absolute', left: '50%', bottom: 28, transform: 'translateX(-50%)', display: 'none', flexDirection: 'column', alignItems: 'center', gap: 6, zIndex: 5, pointerEvents: 'none', padding: '8px 14px', borderRadius: 12, background: 'rgba(15,18,36,.72)', border: '1px solid rgba(255,255,255,.2)', backdropFilter: 'blur(6px)' }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#fff' }} />
        <div style={{ width: 160, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.15)', overflow: 'hidden' }}><div style={{ width: 0, height: '100%', background: '#ffd166' }} /></div>
      </div>
      {videoUi && (
        <>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: 'rgba(255,255,255,.12)', zIndex: 5, pointerEvents: 'none' }}>
            <div ref={progBar} style={{ width: 0, height: '100%', background: 'linear-gradient(90deg,#3ddc97,#12b5cb)' }} />
          </div>
          <div style={{ position: 'absolute', left: '50%', bottom: 12, transform: 'translateX(-50%)', fontSize: 11.5, color: '#c7cbe6', textShadow: '0 1px 6px rgba(0,0,0,.8)', pointerEvents: 'none', zIndex: 5 }}>按住 W / 往前倾 往前走 · S / 往后仰 退回</div>
        </>
      )}

      {head && (camCorner
        ? <div style={{ position: 'absolute', zIndex: 5, ...camCorner }}><HeadCam onPose={onHead} /></div>
        : <div style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 }}><HeadCam onPose={onHead} /></div>)}
    </>
  );
}
