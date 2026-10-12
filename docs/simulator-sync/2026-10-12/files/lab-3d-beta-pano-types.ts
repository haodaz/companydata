// —— 给公司 simulator 的手工合并片段（2026-10-12）：360° 实拍的场景类型 ——
// 1. 把下面几个类型加进 src/lib/lab-3d-beta.ts（放在 Beta3DScene 前面）
// 2. Beta3DScene 里加一行：  pano?: Beta3DPano;
// 3. 场景数据（锅炉房 / 珊瑚礁等演示场景、海外 Storage 地址）不要带；公司自己的实拍素材按同样格式填

/**
 * 全景里识别出来的「好东西」（scripts/beta3d/pano-recognize.mts 生成，人可以在 JSON 里改）。
 * 方位：yaw = 水平角（度，0 = 等距柱状图的正中间，向右为正，-180–180）；pitch = 仰角（度，向上为正，-90–90）。
 */
export interface PanoSpot {
  id: string; yaw: number; pitch: number;
  /** 叫什么（行业里的叫法） */ title: string;
  /** 分类：设备 / 仪表 / 阀门管路 / 电气 / 安全标识 / 文件规程 / 工具 / 环境 */ kind: string;
  /** 行业标签：岗位、工序、风险点…… */ tags: string[];
  /** 介绍：是什么、干什么用、这一行看它的规矩（给体验者看的，两三句） */ desc: string;
  /** 识别置信度 0–1（低的人工确认后再放出） */ conf?: number;
}
/** 一个拍摄点位：街景式行走用。links 是地上的箭头——往 yaw 方向走到 to 那个点位 */
export interface PanoNode { id: string; url: string; kind: 'image' | 'video'; yaw?: number; spots?: PanoSpot[]; links?: { to: string; yaw: number; label?: string }[] }
export interface Beta3DPano {
  url: string; kind: 'image' | 'video'; yaw?: number;
  /** 识别出来的要素（单点位时用这里） */ spots?: PanoSpot[];
  /** 多点位：有了就按街景方式走，url / spots 是起点那一张 */ nodes?: PanoNode[];
  /** 视频是边走边拍的：前倾 / W 就沿拍摄路线往前播（而不是循环播放） */ walk?: boolean;
  /** 场景同时有 3D 和实拍时，默认先看实拍 */ first?: boolean;
}

