/**
 * 科研产品库（数据部门 10-21 #21《CRMProduct_仪器耗材试剂_字段》；用户 10-21：服务于仪器设备服务的评价 + 资源推荐平台，服务也收）。
 * 前后端共用的常量和小工具，不碰数据库。
 */
import { randomId } from '@/lib/entity-ids';

/** kind 决定 external_id 前缀和 type；软件 kyrj_ / 服务 kyfw_ 是我们提议，待数据部门确认 */
export const PRODUCT_KINDS = [
  { key: 'instrument', name: '仪器设备', prefix: 'kyyq_', type: 'instruments_and_equipment' },
  { key: 'consumable', name: '耗材', prefix: 'kyhc_', type: 'reagents_and_consumables' },
  { key: 'reagent', name: '试剂', prefix: 'kysj_', type: 'reagents_and_consumables' },
  { key: 'software', name: '软件', prefix: 'kyrj_', type: 'software' },   // 用户 10-21：软件是软件，和硬件一样是产品；软件开发 / 定制开发才是服务
  { key: 'service', name: '服务', prefix: 'kyfw_', type: 'services' },
] as const;
export type ProductKind = typeof PRODUCT_KINDS[number]['key'];
export const PRODUCT_TYPES = [
  { value: 'instruments_and_equipment', name: '仪器设备' },
  { value: 'reagents_and_consumables', name: '试剂耗材' },
  { value: 'software', name: '软件' },
  { value: 'services', name: '服务' },
];
export const kindOf = (k: any) => PRODUCT_KINDS.find(x => x.key === k) || null;
/** 前缀 + 16 位小写字母数字 */
export const productExternalId = (kind: ProductKind) => `${kindOf(kind)!.prefix}${randomId(16)}`;

export const DOC_TYPES = [
  { key: 'brochure', name: '产品手册' },
  { key: 'datasheet', name: '规格书' },
  { key: 'manual', name: '操作手册' },
  { key: 'app_note', name: '应用文献' },
  { key: 'sds', name: '安全数据表' },
  { key: 'coa', name: '质检报告' },
  { key: 'other', name: '其他资料' },
];
export const DOC_TYPE_NAMES: Record<string, string> = Object.fromEntries(DOC_TYPES.map(d => [d.key, d.name]));

/** 产品介绍 → 不含图、视频的 html（数据部门口径）：只留段落 / 列表 / 表格 / 加粗等文字标签 */
export function plainHtml(input: string | null | undefined): string | null {
  const s = String(input || '').trim();
  if (!s) return null;
  if (!/<[a-z][\s\S]*>/i.test(s)) return s.split(/\n{1,}/).map(x => x.trim()).filter(Boolean).map(x => `<p>${x.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!))}</p>`).join('');
  return s.replace(/<(img|video|audio|iframe|source|picture|svg|script|style|object|embed)\b[\s\S]*?(<\/\1>|\/?>)/gi, '')
    .replace(/<(?!\/?(p|br|ul|ol|li|table|thead|tbody|tr|td|th|strong|b|em|i|h[1-6]|span|div|sup|sub)\b)[^>]+>/gi, '')
    .replace(/\s(style|class|on\w+|src|srcset)="[^"]*"/gi, '').trim() || null;
}

/** 数据部门给的标签 prompt（原样），3–5 个、每个 ≤ 8 字、中文分号隔开 */
export function labelPrompt(p: { name: string; brand?: string | null; specification?: string | null; company?: string | null; type?: string | null; intro?: string | null }) {
  const v = (x: any) => (x == null || x === '' ? '无' : String(x).slice(0, 1500));
  return `你是一个专业的产品标签生成专家。请根据以下产品信息，生成 3-5 个产品标签。

产品信息：
- 产品名称：${v(p.name)}
- 品牌：${v(p.brand)}
- 规格型号：${v(p.specification)}
- 生产/销售公司：${v(p.company)}
- 产品类型：${v(p.type)}
- 产品介绍：${v(p.intro)}

要求：
1. 生成 3-5 个标签，覆盖产品的应用领域、技术特点、材质/性能等维度。
2. 每个标签 8 个字以内（含 8 个字）。
3. 多个标签用中文分号（；）分隔。
4. 标签要具体、专业、准确，能体现产品的核心卖点。
5. 只输出标签本身，不要任何多余文字、不要 JSON、不要解释。

参考示例：
产品：电感耦合等离子体质谱仪 (ICP-MS)
输出：元素分析；地质环境；半导体级；快速装机

请直接输出标签串，例如：
标签1；标签2；标签3；标签4`;
}
/** 模型回来的标签串清洗：去序号 / 引号，每个 ≤ 8 字，最多 5 个 */
export const cleanLabels = (s: string) => {
  const a = [...new Set(String(s || '').replace(/^.*?[:：]/, '').split(/[；;，,、\n]/).map(x => x.replace(/^\s*\d+[.、)]\s*|["'“”]/g, '').trim()).filter(x => x && x.length <= 8))].slice(0, 5);
  return a.length >= 1 ? a.join('；') : null;
};
