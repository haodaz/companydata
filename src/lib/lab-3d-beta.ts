/**
 * 3D beta 探索（2026-10-11）：两个示例场景用 Veo 生成「绕场」视频 → COLMAP 估机位 → Brush 训练 3D 高斯（scripts/beta3d/）。
 * 查看器 /lab/beta/3d/<key>：场景跟着鼠标 / 头部（摄像头，本机推理）挪，屏幕像一扇窗。
 * position / lookAt / up 由 scripts/beta3d/view.py 从重建结果算出（视频中间那一帧的机位），span 是头部摆动时机位最多挪多远。
 */
/** 场景里可以点的物件：鼠标悬停出线框，点一下弹说明（像游戏里的空间建模）。pos / size 在重建出来的场景坐标系里（用查看器 ?edit=1 点出来） */
export interface Beta3DHotspot { id: string; name: string; desc: string; pos: [number, number, number]; size: [number, number, number]; /** 绕竖轴转多少度 */ rotY?: number }

/**
 * 真实 360° 素材（可选，和 Veo 重建并存）：GoPro Max / Insta360 导出的等距柱状 2:1 图片或视频，查看器里只能转头看、没有视差。
 * 只有 pano 的场景：url 留空 ''（position / lookAt / up / span 随便填，用不上）；两个都有：先看 3D，角上能切到 360°。
 * 上传入口 /lab/studio/pano（要登录），传完给出要贴进来的这一段。yaw：一打开朝哪看（度，0 = 画面正中，正数往右）
 */
export interface Beta3DPano { url: string; kind: 'image' | 'video'; yaw?: number }

export interface Beta3DScene {
  key: string; title: string; role: string; spaceId: string; url: string;
  pano?: Beta3DPano;
  hotspots?: Beta3DHotspot[];
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
  asphalt: {
    key: 'asphalt', title: '摊铺现场', role: '沥青摊铺施工员', spaceId: '0cfe3233-acd9-4e4c-b910-3d9350f18eff',
    url: 'https://jextsfzlbchbnsnxwgeu.supabase.co/storage/v1/object/public/lab-art/beta3d-asphalt-site-v1.splat', position: [-0.5483, -4.2882, -0.9021], lookAt: [-0.8637, -2.3699, 4.9669], up: [0.3431, -0.8872, 0.3084], span: 1.2,   // 用视频前段（第 13 帧）的机位：中间帧贴着路面，近处全是糊的高斯
    credit: 'Veo 3.1 生成环绕视频 · COLMAP + Brush 重建（54 万高斯，17 MB）',
    slots: ['06:50', '07:30', '08:20', '09:00', '10:20', '10:50', '13:30'],   // 15:40 日志归档在项目部
  },
  reef: {
    key: 'reef', title: '珊瑚礁', role: '潜导', spaceId: '387fcc19-bd56-453e-a983-b3a1b4da5704',
    url: 'https://jextsfzlbchbnsnxwgeu.supabase.co/storage/v1/object/public/lab-art/beta3d-reef-v1.splat', position: [-0.0038, 0.1282, 0.2202], lookAt: [-0.4826, 0.187, 7.7058], up: [-0.0142, -0.9999, 0.002], span: 1.2,   // 场景近（depth 7.5），摆动幅度按比例缩小
    credit: 'Veo 3.1 生成水下绕礁视频 · COLMAP + Brush 重建（39 万高斯，12.6 MB）',
    slots: ['09:00'],   // 礁区导潜
  },
};

/** 空间 id → 3D beta 场景（空间主页上挂入口用） */
/** 这一章操作台用不用 3D 背景 */
export const beta3dForChapter = (spaceId: string, slot?: string | null) => {
  const s = beta3dForSpace(spaceId);
  return s?.url && slot && s.slots.includes(slot) ? s : null;
};

export const beta3dForSpace = (spaceId: string) => Object.values(BETA3D).find(s => s.spaceId === spaceId) || null;
