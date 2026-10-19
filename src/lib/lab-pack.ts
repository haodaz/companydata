/**
 * 交接包（2026-10-19）：把海外这套（companydata 的 Supabase）里生成好的东西导成 JSON，给公司部署的 simulator 导入。
 * 四种包，格式都是 { manifest, ...数据 }，图片不打进包：所有 Storage 公网地址原样保留，另列一份 assets 清单，导入端自己下载、传到自己的桶、把地址换掉。
 *   spaces    空间包：skills + skill_tasks（空间）+ lab_chapters（章节，**含教案 lesson**）+ lab_cast（人物 / 场景 / 道具）+ lab_art_assets（素材库）+ standard_links（规则出处）
 *   lessons   教案包：只有 lab_chapters.id → lesson（空间已经导过、只补教案时用；1 MB 左右）
 *   knowledge 知识包：职业 / 薪资 / 典型任务 / 场所 / 工位 / 工具 / 行业标准 / 实体关联（和我聊、规则出处靠它）
 *   work      真活包：work_tasks（示范题，含基线）
 * 导入端脚本草稿在 docs/simulator-sync/2026-10-19/files/import-pack.mts。
 */
import { supabaseAdmin as db } from '@/lib/supabase';

export const PACK_FORMAT = 'ai100-pack';
export const PACK_VERSION = 1;
const STORAGE_RE = /https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/([a-z0-9-]+)\/([^"'\\\s)]+)/g;

/** 分页拉全表（Supabase 一次最多 1000 行）；网络抖一下就重试，别让几十 MB 的包因为一页失败 */
async function all(table: string, filter?: (q: any) => any, cols = '*'): Promise<any[]> {
  const out: any[] = []; const page = 1000;
  for (let from = 0; ; from += page) {
    let data: any[] | null = null, lastErr = '';
    for (let attempt = 0; attempt < 4 && !data; attempt++) {
      try {
        let q = db.from(table).select(cols).range(from, from + page - 1).order('id', { ascending: true });
        if (filter) q = filter(q);
        const r = await q;
        if (r.error) { lastErr = r.error.message; if (!/network|fetch/i.test(lastErr)) throw new Error(`${table}: ${lastErr}`); }
        else data = r.data || [];
      } catch (e: any) { lastErr = String(e?.message || e); if (!/network|fetch/i.test(lastErr)) throw e; }
      if (!data) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
    }
    if (!data) throw new Error(`${table}: ${lastErr}`);
    out.push(...data); if (data.length < page) break;
  }
  return out;
}

/** in(...) 的 id 太多会把 URL 撑爆（fetch failed）：按 150 个一批查 */
async function byIds(table: string, col: string, ids: string[], cols = '*'): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += 150) out.push(...await all(table, q => q.in(col, ids.slice(i, i + 150)), cols));
  return out;
}

/** 从任意 JSON 里把 Storage 公网地址都捞出来 → 素材清单（桶 / 路径 / 原地址） */
export function collectAssets(obj: any): { bucket: string; path: string; url: string }[] {
  const seen = new Map<string, { bucket: string; path: string; url: string }>();
  const s = JSON.stringify(obj); let m: RegExpExecArray | null;
  while ((m = STORAGE_RE.exec(s))) { const url = m[0]; if (!seen.has(url)) seen.set(url, { bucket: m[1], path: decodeURIComponent(m[2]), url }); }
  return [...seen.values()];
}

const manifest = (kind: string, extra: Record<string, any>) => ({ format: PACK_FORMAT, version: PACK_VERSION, kind, exported_at: new Date().toISOString(), source: 'companydata (overseas supabase)', ...extra });

/** 空间包：不传 ids = 全部空间 */
export async function buildSpacePack(ids?: string[]) {
  const tasks = ids?.length ? await byIds('skill_tasks', 'id', ids) : await all('skill_tasks');
  const taskIds = tasks.map(t => t.id); const skillIds = [...new Set(tasks.map(t => t.skill_id).filter(Boolean))];
  const skills = await byIds('skills', 'id', skillIds);
  const chapters = await byIds('lab_chapters', 'task_id', taskIds);
  const cast = await byIds('lab_cast', 'task_id', taskIds);
  const links = await byIds('standard_links', 'space_id', taskIds);
  const assetIds = [...new Set(cast.map(c => c.asset_id).filter(Boolean))] as string[];
  // 素材库整表一起带（728 个人物只挂了一部分素材，可复用的素材空间里也会直接引用）
  const art = ids?.length ? await byIds('lab_art_assets', 'id', assetIds) : await all('lab_art_assets');
  // 章节 sim / 空间 profile 里直接写的图片地址也可能指到素材库之外的文件：统一靠 collectAssets 兜住
  const body = { skills, spaces: tasks, chapters, cast, art, standard_links: links };
  const assets = collectAssets(body);
  return { manifest: manifest('spaces', { counts: { skills: skills.length, spaces: tasks.length, chapters: chapters.length, lessons: chapters.filter(c => c.lesson).length, cast: cast.length, art: art.length, standard_links: links.length, assets: assets.length }, tables: ['skills', 'skill_tasks', 'lab_chapters', 'lab_cast', 'lab_art_assets', 'standard_links'], note: '按 id upsert；图片地址在 assets 里，导入时下载 → 传自己的桶 → 全文替换 url' }), ...body, assets };
}

/** 教案包：只有章节 id → 教案 */
export async function buildLessonPack() {
  const rows = await all('lab_chapters', q => q.not('lesson', 'is', null), 'id, task_id, seq, title, lesson, lesson_at');
  return { manifest: manifest('lessons', { counts: { lessons: rows.length }, tables: ['lab_chapters'], note: '按 lab_chapters.id 更新 lesson / lesson_at；空间要先导过（id 一致）' }), lessons: rows };
}

/** 知识包：和我聊、规则出处、典型任务靠的那套底座 */
export async function buildKnowledgePack() {
  const tables = ['occupations', 'occupation_salaries', 'occupation_region_salaries', 'occupation_faqs', 'typical_tasks', 'work_places', 'work_stations', 'work_items', 'industry_standards', 'entity_links'];
  const data: Record<string, any[]> = {};
  for (const t of tables) data[t] = await all(t, q => (t === 'occupations' || t === 'typical_tasks' || /^work_/.test(t) || t === 'entity_links' ? q.or('if_delete.is.null,if_delete.eq.false') : q));
  const assets = collectAssets(data);
  const counts = Object.fromEntries(tables.map(t => [t, data[t].length]));
  return { manifest: manifest('knowledge', { counts: { ...counts, assets: assets.length }, tables, note: '按 id upsert；occupations 先、再薪资 / 典型任务 / 实体关联（有外键）；标准库 dedupe_key 唯一' }), ...data, assets };
}

/** 真活包：示范题（含基线），不带作答 */
export async function buildWorkPack(ids?: string[]) {
  const tasks = ids?.length ? await byIds('work_tasks', 'id', ids) : await all('work_tasks');
  const assets = collectAssets(tasks);
  return { manifest: manifest('work', { counts: { work_tasks: tasks.length, assets: assets.length }, tables: ['work_tasks'], note: '按 id upsert；company_id / context 指的是海外企业库，导入后当「新企业」看待即可；share_token / owner_key 原样带（链接不变）' }), work_tasks: tasks, assets };
}

export async function packCounts() {
  const c = async (t: string, f?: (q: any) => any) => { let q = db.from(t).select('id', { count: 'exact', head: true }); if (f) q = f(q); const r = await q; return r.count ?? 0; };
  return {
    spaces: await c('skill_tasks'), chapters: await c('lab_chapters'), lessons: await c('lab_chapters', q => q.not('lesson', 'is', null)), cast: await c('lab_cast'), art: await c('lab_art_assets'),
    occupations: await c('occupations'), typical_tasks: await c('typical_tasks'), places: await c('work_places'), stations: await c('work_stations'), items: await c('work_items'), standards: await c('industry_standards'), entity_links: await c('entity_links'),
    work_tasks: await c('work_tasks'),
  };
}
