/**
 * 3D beta 探索（2026-10-11）：两个示例场景用 Veo 生成「绕场」视频 → COLMAP 估机位 → Brush 训练 3D 高斯（scripts/beta3d/）。
 * 查看器 /lab/beta/3d/<key>：场景跟着鼠标 / 头部（摄像头，本机推理）挪，屏幕像一扇窗。
 * position / lookAt / up 由 scripts/beta3d/view.py 从重建结果算出（视频中间那一帧的机位），span 是头部摆动时机位最多挪多远。
 */
import BOILER_SPOTS from '@/lib/pano-spots/boiler.json';
import REEF_HERON_SPOTS from '@/lib/pano-spots/reef-heron.json';
import REEF_ELLIOT_SPOTS from '@/lib/pano-spots/reef-elliot.json';
/** 场景里可以点的物件：鼠标悬停出线框，点一下弹说明（像游戏里的空间建模）。pos / size 在重建出来的场景坐标系里（用查看器 ?edit=1 点出来） */
export interface Beta3DHotspot { id: string; name: string; desc: string; pos: [number, number, number]; size: [number, number, number]; /** 绕竖轴转多少度 */ rotY?: number }

/**
 * 真实 360° 素材（可选，和 Veo 重建并存）：GoPro Max / Insta360 导出的等距柱状 2:1 图片或视频，查看器里只能转头看、没有视差。
 * 只有 pano 的场景：url 留空 ''（position / lookAt / up / span 随便填，用不上）；两个都有：先看 3D，角上能切到 360°。
 * 上传入口 /lab/studio/pano（要登录），传完给出要贴进来的这一段。yaw：一打开朝哪看（度，0 = 画面正中，正数往右）
 */
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

export interface Beta3DScene {
  key: string; title: string; role: string; spaceId: string; url: string;
  pano?: Beta3DPano;
  hotspots?: Beta3DHotspot[];
  position: [number, number, number]; lookAt: [number, number, number]; up: [number, number, number]; span: number;
  credit: string;
  /** 操作台里用它当背景的章节（时段）：这几章发生在这个场景里 */
  slots: string[];
}

/** 实拍珊瑚礁（大堡礁两个礁区，潜导视角识别过）：潜导空间的 reef 场景和独立试看页 reef-dive 共用 */
const REEF_DIVE_PANO: Beta3DPano = {
  url: 'https://jextsfzlbchbnsnxwgeu.supabase.co/storage/v1/object/public/lab-art/pano-wikimedia-heron_bommie_svii.jpg', kind: 'image',
  nodes: [
    { id: 'heron', spots: REEF_HERON_SPOTS as PanoSpot[], url: 'https://jextsfzlbchbnsnxwgeu.supabase.co/storage/v1/object/public/lab-art/pano-wikimedia-heron_bommie_svii.jpg', kind: 'image', links: [{ to: 'elliot', yaw: 0, label: '游去伊利奥特夫人岛礁区' }] },
    { id: 'elliot', spots: REEF_ELLIOT_SPOTS as PanoSpot[], url: 'https://jextsfzlbchbnsnxwgeu.supabase.co/storage/v1/object/public/lab-art/pano-wikimedia-lady_elliot_island_svii.jpg', kind: 'image', links: [{ to: 'heron', yaw: 180, label: '游回苍鹭岛礁丘' }] },
  ],
};

export const BETA3D: Record<string, Beta3DScene> = {
  cafe: {
    key: 'cafe', title: '咖啡吧台', role: '拉花师傅', spaceId: '155db8f9-b0b3-4f08-a842-df1e94c381f4',
    url: 'https://jextsfzlbchbnsnxwgeu.supabase.co/storage/v1/object/public/lab-art/beta3d-cafe-v2.splat', position: [0.0063, 0.0036, -0.0818], lookAt: [-2.4812, -0.8693, 25.2562], up: [-0.0009, -0.9994, -0.0348], span: 3.6,
    credit: 'Veo 3.1 生成环绕视频 · COLMAP + Brush 重建',
    slots: ['08:00', '09:00', '10:30', '12:00', '18:30'],   // 15:30 补货盘点在后仓，不用吧台
    // 位置是粗放的：在 /lab/beta/3d/cafe?edit=1 里点物件拿坐标再校
    hotspots: [
      { id: 'machine', name: '半自动意式咖啡机', pos: [-3, 2, 26], size: [9, 6, 6], desc: '双头机：每个冲煮头 9 bar 压力、93℃ 左右的水穿过压实的咖啡粉饼，25–30 秒萃出一份 espresso。开店第一件事是放水、看锅炉压力表稳不稳；每杯之间要冲一下冲煮头，把上一杯的粉渣冲掉。' },
      { id: 'wand', name: '蒸汽棒', pos: [-8, 2, 25], size: [2, 5, 2], desc: '打奶的地方。棒尖插到奶面下一点点，先「进气」把奶撕出细泡，听到的是纸撕开一样的声音；奶温 40℃ 左右停止进气，再把棒插深一点让奶旋起来「打绵」，63℃ 左右关汽。用完立刻擦干净、放一下汽，奶渍烧在棒上就很难擦。' },
      { id: 'grinder', name: '磨豆机', pos: [5, 1, 26], size: [3.5, 8, 3.5], desc: '意式磨豆机，刻度调的是研磨粗细。早上第一件事就是「调磨」：粉太粗流速快、酸而薄；太细流速慢、苦而涩。豆子换袋、天气潮湿都要重新调，一天里会调好几次。' },
      { id: 'counter', name: '出杯台', pos: [0, 5, 19], size: [16, 1.5, 6], desc: '做好的饮品放这里喊单。拉花杯口朝客人、把手朝右；高峰期一次出三四杯，顺序和单子一致，别让先点的人等后点的。台面随时擦干，一圈奶渍就是一次差评。' },
      { id: 'shelf', name: '杯架与豆仓', pos: [0, -6, 34], size: [16, 4, 3], desc: '杯子倒扣沥干、按容量分列；豆子按烘焙日期先进先出，开封后两周内用完。盘点时数的就是这里：一袋豆能出多少杯、今天用掉几袋，就能算出今天的杯量对不对。' },
    ],
  },
  or: {
    key: 'or', title: '手术室', role: '开腹医师', spaceId: '681b5f1c-5115-4c32-82ea-69c085b21868',
    url: 'https://jextsfzlbchbnsnxwgeu.supabase.co/storage/v1/object/public/lab-art/beta3d-or-v1.splat', position: [0.0615, 0.0058, -0.0765], lookAt: [-1.5469, 0.3359, 26.0459], up: [-0.0033, -0.9999, 0.0124], span: 3.6,
    credit: 'Veo 3.1 生成环绕视频 · COLMAP + Brush 重建',
    slots: ['09:10', '14:00'],   // 阑尾切除、急诊探查在手术室；晨查 / 会诊 / 晚查不在
    // 坐标系：up 是 -y（y 越小越高），z 往房间深处。用 /lab/beta/3d/or?edit=1 点出来再手调
    hotspots: [
      { id: 'table', name: '手术床', pos: [-1, 3, 28], size: [8, 3, 20], desc: '可以升降、倾斜、侧翻的手术床。开腹前主刀会把床调到自己肘部略下的高度，阑尾手术常把床往左倾一点，让肠管靠重力离开右下腹，显露更清楚。床垫下面有电热毯，术中保温也是外科医生的事。' },
      { id: 'lamp', name: '无影灯', pos: [-1, -8, 28], size: [17, 4, 9], desc: '多颗灯珠从不同角度打光，手和器械挡住一部分也不会留下影子，所以叫无影。手柄是可拆的无菌把手，术中由手术组自己调——新手常犯的错是让巡回护士调灯，位置永远对不准自己的视线。' },
      { id: 'monitor', name: '麻醉机与监护仪', pos: [-1, -1, 42], size: [7, 7, 4], desc: '麻醉医生的阵地：呼吸机送气、吸入麻药浓度、心电、血压、血氧都在这几块屏上。外科医生切皮前要和麻醉医生确认「可以开始」，术中出血多了第一个告诉你的也是这边的血压曲线。' },
      { id: 'cabinet_r', name: '器械与耗材柜', pos: [9, -2, 30], size: [3, 7, 14], desc: '无菌器械包、缝线、引流管、纱布按手术类型分格存放。巡回护士按手术通知单提前备好，术中临时加东西要报数——纱布、器械进出都得清点，关腹前数目对不上就不能缝。' },
      { id: 'cabinet_l', name: '洗手间与通道', pos: [-11, -2, 30], size: [3, 7, 14], desc: '外科洗手在手术间外的洗手池完成，七步洗手法、刷到肘上 10 cm，双手举着走进来，由器械护士帮你穿无菌衣、戴手套。穿好后双手只能在胸前到腰之间活动，碰到任何非无菌的东西就得重来。' },
    ],
  },
  nursery: {
    key: 'nursery', title: '婴儿房', role: '月嫂', spaceId: '19fd15d1-3787-4e65-a3a6-883a013ae59c',
    url: 'https://jextsfzlbchbnsnxwgeu.supabase.co/storage/v1/object/public/lab-art/beta3d-nursery-v1.splat', position: [0.1853, 0.0051, 0.0312], lookAt: [1.7824, -0.0463, 30.4817], up: [0.0089, -1.0, -0.0022], span: 3.6,
    credit: 'Veo 3.1 生成环绕视频 · COLMAP + Brush 重建',
    slots: ['07:40', '08:30', '10:10', '11:30', '16:20', '18:00'],   // 09:20 上报安抚、14:30 月子餐不在婴儿房
  },
  office: {
    key: 'office', title: '数据分析工位', role: '数据分析师', spaceId: 'a35a662d-2be8-4cc1-a255-4c3f8ad29139',
    url: 'https://jextsfzlbchbnsnxwgeu.supabase.co/storage/v1/object/public/lab-art/beta3d-office-v3.splat', position: [0.1139, 0.0067, -0.1061], lookAt: [-2.2126, 0.1388, 19.596], up: [-0.0017, -1.0, 0.0061], span: 3.0,   // v3：从椅背后看过去，屏幕朝着椅子
    credit: 'Veo 3.1 生成环绕视频 · COLMAP + Brush 重建',
    slots: ['08:30', '09:20', '10:10', '11:00', '14:00', '15:10', '16:20', '17:30'],   // 一整天都在工位上
  },
  rocket: {
    key: 'rocket', title: '总装厂房 · 发动机段', role: '火箭总装工程师', spaceId: '640f3bc6-6ce1-4c32-82dd-6491344ab86f',
    url: 'https://jextsfzlbchbnsnxwgeu.supabase.co/storage/v1/object/public/lab-art/beta3d-rocket-v1.splat', position: [0.006, 0.0041, -0.0052], lookAt: [-1.4515, -0.0696, 19.0291], up: [0.0068, -1.0, -0.0034], span: 3.0,   // 近景弧线（离主体 3 m）一次重建成功；大空间远景两次都对不上
    credit: 'Veo 3.1 生成环绕视频 · COLMAP + Brush 重建（17 万高斯，5.6 MB）',
    slots: ['08:30', '09:10', '10:00', '11:00', '13:30'],   // 厂房里的章；15:00 试车台在户外、16:10 复盘在会议室
    // 位置是粗放的：在 /lab/beta/3d/rocket?edit=1 里点物件拿坐标再校
    hotspots: [
      { id: 'nozzle', name: '发动机喷管', pos: [-1.5, 1, 19], size: [5, 5, 5], desc: '钟形的喷管把燃气加速到超音速——推力就从这里来。总装时最怕磕碰：喷管壁是再生冷却通道，薄得像易拉罐，吊装、对接、每一次挪动都要有人盯着喷管口。' },
      { id: 'pump', name: '涡轮泵与管路', pos: [-1.5, -3, 19], size: [4, 4, 4], desc: '把液氧和甲烷从贮箱压进燃烧室的泵，转速以万转计。周围这一团管路、阀门和电缆，每一根都有编号，装错一根试车就点不着——总装工艺卡上一条一条对，装完还要做气密。' },
      { id: 'cradle', name: '运输托架', pos: [-1.5, 5, 19], size: [12, 2, 6], desc: '黄色的托架托着整个箭体，上面的滚轮能让箭体绕轴转，方便从各个角度作业。箭体一上托架就要测同轴度，托架不平，后面级段对接全是白干。' },
      { id: 'platform', name: '工作平台', pos: [5, 0, 17], size: [3, 8, 10], desc: '蓝色的工作平台贴着箭体，高度可调。上平台先系安全带、工具要有防坠绳——一把扳手掉进箭体里，整段都得重新清点。' },
    ],
  },
  command: {
    key: 'command', title: '应急指挥大厅', role: '应急指挥调度员', spaceId: 'adcf442a-fe29-4f82-9bd0-4a82f82f72fc',
    url: 'https://jextsfzlbchbnsnxwgeu.supabase.co/storage/v1/object/public/lab-art/beta3d-command-hall-v1.splat', position: [0.0039, 0.0012, -0.0766], lookAt: [12.2838, 2.612, 47.097], up: [0.036, -0.9983, 0.0455], span: 3.6,
    credit: 'Veo 3.1 生成环绕视频 · COLMAP + Brush 重建（6 万高斯，2 MB）',
    slots: ['07:30', '08:00', '08:30', '09:10', '10:20', '11:10', '14:00', '16:30', '18:00'],   // 11:40 河堤一线不在大厅
  },
  // asphalt（摊铺现场）2026-10-13 撤掉：重建出来几乎全是针状高斯（中位长宽比 ~100，压路机冒烟训练成拉丝），挪机位、滤浮点都救不回来；重新生成环绕视频再重建前，这个空间不挂 3D
  reef: {
    key: 'reef', title: '珊瑚礁', role: '潜导', spaceId: '387fcc19-bd56-453e-a983-b3a1b4da5704',
    url: 'https://jextsfzlbchbnsnxwgeu.supabase.co/storage/v1/object/public/lab-art/beta3d-reef-v1.splat', position: [-0.0038, 0.1282, 0.2202], lookAt: [-0.4826, 0.187, 7.7058], up: [-0.0142, -0.9999, 0.002], span: 1.2,   // 场景近（depth 7.5），摆动幅度按比例缩小
    credit: '3D：Veo 3.1 生成水下绕礁视频 · COLMAP + Brush 重建（39 万高斯，12.6 MB）｜360° 实拍：Underwater Earth / XL Catlin Seaview Survey（Christophe Bailhache）· 大堡礁 · CC BY-SA 3.0 · Wikimedia Commons',
    slots: ['09:00'],   // 礁区导潜
    // 2026-10-12：实拍珊瑚礁也接进来——入口进去默认看实拍（有潜水要点标记），右上角能切回 3D
    pano: { ...REEF_DIVE_PANO, first: true },
  },
  boiler: {
    key: 'boiler', title: '锅炉房', role: '锅炉运行 / 设备巡检（试看）', spaceId: '',
    url: '', position: [0, 0, 0], lookAt: [0, 0, 1], up: [0, -1, 0], span: 1,   // 只有全景，没有 3D
    // spots：scripts/beta3d/pano-recognize.mts 识别出来的要素（35 件），人可以直接改 JSON
    pano: { url: 'https://jextsfzlbchbnsnxwgeu.supabase.co/storage/v1/object/public/lab-art/pano-polyhaven-boiler_room.jpg', kind: 'image', spots: BOILER_SPOTS as PanoSpot[] },
    credit: '360° 实拍 · Poly Haven「Boiler Room」· 摄影 Oliksiy Yakovlyev · CC0',
    slots: [],   // 第一张公开实拍素材（2026-10-12 和用户一起挑的），还没挂到任何空间
  },
  // ⚠ UI 测试夹具，不是真数据：同一张锅炉房图当两个点位，只为看街景箭头 / 走动过场 / 要素标记。
  // 点位 b 的 yaw = 90：假装 b 的图正中朝世界的 90°，走过去时视线会按这个偏移换算。spots 的内容是编的
  'reef-dive': {
    key: 'reef-dive', title: '珊瑚礁 · 潜水员视角', role: '潜导 / 海洋科考（试看）', spaceId: '',
    url: '', position: [0, 0, 0], lookAt: [0, 0, 1], up: [0, -1, 0], span: 1,
    // spots：pano-recognize.mts 按潜导视角识别（不可触碰的珊瑚、要保持距离的生物、浪涌 / 触礁风险区、看点）
    // 两个礁区用箭头连起来：从苍鹭岛礁丘「游」到伊利奥特夫人岛。原图 9500 宽，缩到 8192 免得有的显卡贴图上限黑屏
    pano: REEF_DIVE_PANO,
    credit: '360° 水下实拍 · Underwater Earth / XL Catlin Seaview Survey（Christophe Bailhache）· 大堡礁 Heron Bommie / Lady Elliot Island · CC BY-SA 3.0 · 来自 Wikimedia Commons',
    slots: [],   // 2026-10-12 和用户一起挑的（带比特看大海）；授权 BY-SA：要署名，改了再发布也得同授权
  },
  'boiler-walk': {
    key: 'boiler-walk', title: '锅炉房 · 走动测试', role: '锅炉运行 / 设备巡检（试看）', spaceId: '',
    url: '', position: [0, 0, 0], lookAt: [0, 0, 1], up: [0, -1, 0], span: 1,
    pano: {
      url: 'https://jextsfzlbchbnsnxwgeu.supabase.co/storage/v1/object/public/lab-art/pano-polyhaven-boiler_room.jpg', kind: 'image',
      nodes: [
        {
          id: 'a', url: 'https://jextsfzlbchbnsnxwgeu.supabase.co/storage/v1/object/public/lab-art/pano-polyhaven-boiler_room.jpg', kind: 'image', yaw: 0,
          links: [{ to: 'b', yaw: 30, label: '往前走（测试）' }, { to: 'b', yaw: -110, label: '去左边（测试）' }],
          spots: [
            { id: 'test-a1', yaw: 0, pitch: 0, title: '测试点 · 正前方', kind: '设备', tags: ['测试', '巡检'], desc: '假数据：yaw 0 / pitch 0，应该正好落在一打开的画面中心。', conf: 0.9 },
            { id: 'test-a2', yaw: 90, pitch: 20, title: '测试点 · 右上', kind: '仪表', tags: ['测试'], desc: '假数据：yaw 90 / pitch 20，往右转 90° 再抬头一点。', conf: 0.8 },
            { id: 'test-a3', yaw: -60, pitch: -10, title: '测试点 · 低置信度', kind: '阀门管路', tags: ['测试', '待核对'], desc: '假数据：conf 0.3，平时藏起来，?all=1 才显示。', conf: 0.3 },
          ],
        },
        {
          id: 'b', url: 'https://jextsfzlbchbnsnxwgeu.supabase.co/storage/v1/object/public/lab-art/pano-polyhaven-boiler_room.jpg', kind: 'image', yaw: 90,
          links: [{ to: 'a', yaw: -150, label: '回起点（测试）' }],
          spots: [
            { id: 'test-b1', yaw: 180, pitch: 0, title: '测试点 · b 的背面', kind: '安全标识', tags: ['测试'], desc: '假数据：点位 b 里 yaw 180，在图的接缝处。', conf: 0.7 },
          ],
        },
      ],
    },
    credit: '360° 实拍 · Poly Haven「Boiler Room」· 摄影 Oliksiy Yakovlyev · CC0（走动测试夹具）',
    slots: [],
  },
};

/** 空间 id → 3D beta 场景（空间主页上挂入口用） */
/** 这一章操作台用不用 3D 背景 */
export const beta3dForChapter = (spaceId: string, slot?: string | null) => {
  const s = beta3dForSpace(spaceId);
  return s?.url && slot && s.slots.includes(slot) ? s : null;
};

export const beta3dForSpace = (spaceId: string) => Object.values(BETA3D).find(s => s.spaceId === spaceId) || null;
