/**
 * 企业的 flora_external_id（库里列名 external_id）命名规则——数据部门 2026-10-10：
 *   和企业 slug 一致 = 「所在国家两位小写字母代码 . 官网主域名」，如中通快递 → cn.zto.com；
 *   没填官网 → 「国家代码 . 企业中文名拼音首字母」，如大疆农业 → cn.djny（官网打不开也照官网算）。
 * applysquare_id、slug 都和它同值。岗位不变，还是 o9y + 12 位（迁移 012）。
 *
 * 有官网那一档由数据库触发器算（迁移 018 fill_company_flora_id，所有写入路径都覆盖，重名先用完整主机名再加 -2）；
 * 拼音那一档数据库算不了，在这里补：新建企业时调 ensureCompanyFloraId，存量用 scripts/fix-1010.mts。
 * 先按拼音建的企业，之后补上官网会被触发器升级成域名那一档。
 */
import { pinyin } from 'pinyin-pro';
import { supabaseAdmin } from '@/lib/supabase';

/** 和迁移 018 的 country_iso2 同一张表：库里的国家写的是中文名（偶尔英文） */
const COUNTRY: Record<string, string> = {
  中国: 'cn', 中国大陆: 'cn', 中华人民共和国: 'cn', china: 'cn',
  中国香港: 'hk', 香港: 'hk', 中国澳门: 'mo', 澳门: 'mo', 中国台湾: 'tw', 台湾: 'tw',
  美国: 'us', usa: 'us', 'united states': 'us', 英国: 'gb', uk: 'gb', 'united kingdom': 'gb',
  法国: 'fr', 德国: 'de', 日本: 'jp', 韩国: 'kr', 瑞士: 'ch', 瑞典: 'se', 荷兰: 'nl', 比利时: 'be', 意大利: 'it', 西班牙: 'es',
  丹麦: 'dk', 挪威: 'no', 芬兰: 'fi', 爱尔兰: 'ie', 奥地利: 'at', 卢森堡: 'lu', 以色列: 'il', 俄罗斯: 'ru',
  加拿大: 'ca', 澳大利亚: 'au', 新西兰: 'nz', 新加坡: 'sg', 马来西亚: 'my', 印度: 'in', 印度尼西亚: 'id', 泰国: 'th', 越南: 'vn', 菲律宾: 'ph',
  沙特阿拉伯: 'sa', 阿联酋: 'ae', 阿拉伯联合酋长国: 'ae', 卡塔尔: 'qa', 巴西: 'br', 墨西哥: 'mx', 南非: 'za', 土耳其: 'tr',
};

/** 国家两位小写代码；没填国家的中文名企业按中国算；认不出来返回 null（交给人看） */
export function countryCode(country: string | null | undefined, name?: string | null): string | null {
  const c = String(country || '').trim();
  if (!c) return /[一-鿿]/.test(String(name || '')) ? 'cn' : null;
  if (/^[a-z]{2}$/i.test(c)) return c.toLowerCase();
  return COUNTRY[c] || COUNTRY[c.toLowerCase()] || null;
}

/** 中文名拼音首字母；英文 / 数字原样小写保留（TCL科技 → tclkj），括号里的注释不算 */
export function nameInitials(name: string | null | undefined): string {
  const s = String(name || '').replace(/[（(].*?[)）]/g, '').trim();
  let out = '';
  for (const ch of Array.from(s)) {
    if (/[一-鿿]/.test(ch)) out += pinyin(ch, { pattern: 'first', toneType: 'none' }).toLowerCase();
    else if (/[a-z0-9]/i.test(ch)) out += ch.toLowerCase();
  }
  return out;
}

/** 还没按新规则定下来的编号：空的、迁移 012 的 o9y 随机串 */
export const needsFloraId = (id: string | null | undefined) => !id || /^o9y[a-z0-9]{12}$/.test(id);

/**
 * 给一家企业补拼音那一档的编号（有官网的触发器已经算过，这里不动）。重名加 -2、-3。
 * 返回最终编号；国家认不出来 / 名字里没有可用字符时返回 null，编号保持原样。
 */
export async function ensureCompanyFloraId(companyId: number): Promise<string | null> {
  const { data: c } = await supabaseAdmin.from('companies').select('id, name, country, external_id, flora_id_locked').eq('id', companyId).maybeSingle();
  if (!c) return null;
  if (c.flora_id_locked || !needsFloraId(c.external_id)) return c.external_id;
  const cc = countryCode(c.country, c.name), ini = nameInitials(c.name);
  if (!cc || !ini) return null;
  const base = `${cc}.${ini}`;
  for (let k = 1; k < 50; k++) {
    const id = k === 1 ? base : `${base}-${k}`;
    const { data: taken } = await supabaseAdmin.from('companies').select('id').eq('external_id', id).neq('id', companyId).limit(1);
    if (taken?.length) continue;
    const { error } = await supabaseAdmin.from('companies').update({ external_id: id }).eq('id', companyId);
    if (!error) return id;
    if (!/duplicate|unique/i.test(error.message)) throw error;   // 并发撞了唯一索引：换下一个
  }
  return null;
}
