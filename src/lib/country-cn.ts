/**
 * 国名 → 企业库口径的中文国名（企业 country 列存中文：中国 / 美国 / 德国…）。
 * 地区编码表只收了常见几国；展商名单（analytica 等）里的英文国名靠这张对照表（10-21：analytica 写进来的 Germany / USA 和库里不一致）。
 */
import { resolveRegion, regionName } from '@/lib/region-codes';

export const EN_CN: Record<string, string> = {"Italy":"意大利","Poland":"波兰","India":"印度","Latvia":"拉脱维亚","Great Britain":"英国","United Kingdom":"英国","UK":"英国","Hungary":"匈牙利","Spain":"西班牙","Canada":"加拿大","Brazil":"巴西","Portugal":"葡萄牙","Netherlands":"荷兰","Switzerland":"瑞士","Belgium":"比利时","Austria":"奥地利","France":"法国","South Korea":"韩国","Korea":"韩国","Denmark":"丹麦","Czech Republic":"捷克","Czechia":"捷克","Sweden":"瑞典","Finland":"芬兰","Norway":"挪威","Ireland":"爱尔兰","Israel":"以色列","Turkey":"土耳其","Türkiye":"土耳其","Taiwan":"中国台湾","Hong Kong":"中国香港","Macau":"中国澳门","Australia":"澳大利亚","Greece":"希腊","Slovenia":"斯洛文尼亚","Slovakia":"斯洛伐克","Lithuania":"立陶宛","Estonia":"爱沙尼亚","Romania":"罗马尼亚","Croatia":"克罗地亚","Serbia":"塞尔维亚","Bulgaria":"保加利亚","Ukraine":"乌克兰","Russia":"俄罗斯","Mexico":"墨西哥","Argentina":"阿根廷","Chile":"智利","South Africa":"南非","Egypt":"埃及","United Arab Emirates":"阿联酋","UAE":"阿联酋","Saudi Arabia":"沙特阿拉伯","Iran":"伊朗","Pakistan":"巴基斯坦","Malaysia":"马来西亚","Thailand":"泰国","Vietnam":"越南","Indonesia":"印度尼西亚","Philippines":"菲律宾","New Zealand":"新西兰","Luxembourg":"卢森堡","Liechtenstein":"列支敦士登","Monaco":"摩纳哥","Iceland":"冰岛","Cyprus":"塞浦路斯","Malta":"马耳他","Belarus":"白俄罗斯","Kazakhstan":"哈萨克斯坦","Morocco":"摩洛哥","Tunisia":"突尼斯","Nigeria":"尼日利亚","Kenya":"肯尼亚","Bangladesh":"孟加拉国","Sri Lanka":"斯里兰卡","Singapore":"新加坡","Japan":"日本","Germany":"德国","USA":"美国","United States":"美国","China":"中国","Taiwan (Chinese Taipei)":"中国台湾","Montenegro":"黑山"};

/** 认不出返回 null；已经是中文的原样返回 */
export function countryCn(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (/[一-鿿]/.test(s)) return s;
  if (EN_CN[s]) return EN_CN[s];
  const code = resolveRegion({ country: s }).country;
  const cn = code ? regionName('country', code) : null;
  return cn && cn !== code ? cn : null;
}
