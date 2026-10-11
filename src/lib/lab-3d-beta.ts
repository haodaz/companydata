/**
 * 3D beta 探索（2026-10-11）：两个示例场景用 Veo 生成「绕场」视频 → COLMAP 估机位 → Brush 训练 3D 高斯（scripts/beta3d/）。
 * 查看器 /lab/beta/3d/<key>：场景跟着鼠标 / 头部（摄像头，本机推理）挪，屏幕像一扇窗。
 * position / lookAt / up 由 scripts/beta3d/view.py 从重建结果算出（视频中间那一帧的机位），span 是头部摆动时机位最多挪多远。
 */
export interface Beta3DScene {
  key: string; title: string; role: string; spaceId: string; url: string;
  position: [number, number, number]; lookAt: [number, number, number]; up: [number, number, number]; span: number;
  credit: string;
  /** 操作台里用它当背景的章节（时段）：这几章发生在这个场景里 */
  slots: string[];
}

export const BETA3D: Record<string, Beta3DScene> = {
  cafe: {
    key: 'cafe', title: '咖啡吧台', role: '拉花师傅', spaceId: '155db8f9-b0b3-4f08-a842-df1e94c381f4',
    url: 'https://jextsfzlbchbnsnxwgeu.supabase.co/storage/v1/object/public/lab-art/beta3d-cafe-v2.splat', position: [0.0063, 0.0036, -0.0818], lookAt: [-2.4812, -0.8693, 25.2562], up: [-0.0009, -0.9994, -0.0348], span: 3.6,
    credit: 'Veo 3.1 生成环绕视频 · COLMAP + Brush 重建',
    slots: ['08:00', '09:00', '10:30', '12:00', '18:30'],   // 15:30 补货盘点在后仓，不用吧台
  },
  or: {
    key: 'or', title: '手术室', role: '开腹医师', spaceId: '681b5f1c-5115-4c32-82ea-69c085b21868',
    url: 'https://jextsfzlbchbnsnxwgeu.supabase.co/storage/v1/object/public/lab-art/beta3d-or-v1.splat', position: [0.0615, 0.0058, -0.0765], lookAt: [-1.5469, 0.3359, 26.0459], up: [-0.0033, -0.9999, 0.0124], span: 3.6,
    credit: 'Veo 3.1 生成环绕视频 · COLMAP + Brush 重建',
    slots: ['09:10', '14:00'],   // 阑尾切除、急诊探查在手术室；晨查 / 会诊 / 晚查不在
  },
};

/** 空间 id → 3D beta 场景（空间主页上挂入口用） */
/** 这一章操作台用不用 3D 背景 */
export const beta3dForChapter = (spaceId: string, slot?: string | null) => {
  const s = beta3dForSpace(spaceId);
  return s?.url && slot && s.slots.includes(slot) ? s : null;
};

export const beta3dForSpace = (spaceId: string) => Object.values(BETA3D).find(s => s.spaceId === spaceId) || null;
