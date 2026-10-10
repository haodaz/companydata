/**
 * AI 百业 · 代码里写死的图搬进素材库。
 *
 * 预置示范（skill-lab-seed*.ts）的场景图、立绘、数字职人头像原来直接引用仓库里的 public/lab/*.jpg|png，
 * 和生成的图（Supabase Storage 桶 lab-art）是两套来源：导出空间包要特殊处理、换图没法走素材库、公司 / 海外两边各带一份文件。
 * 这里把它们统一：灌示范时先把用到的本地图上传到 Storage（文件名 seed-<原名>，重复上传覆盖同名），
 * 引用一律换成 Storage 网址，再由角色表对账（迁移 019）登记进素材库。
 * 已经灌过的老数据（库里 url 还是 /lab/…）用 localizeLibrary 一次性搬完。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { supabaseAdmin } from '@/lib/supabase';
import { uploadLabAsset } from '@/lib/lab-art';
import { rewriteUrls } from '@/lib/json-url';
import { refreshArtCache, rewriteUrlEverywhere, tasksUsingAssets } from '@/lib/lab-cast-server';

const LOCAL = /^\/lab\/[A-Za-z0-9_-]+\.(png|jpe?g|webp)$/i;
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

/** 是不是仓库里写死的示范图（/lab/xxx.jpg；/lab/gen/ 是开发环境的回退目录，不算） */
export const isLocalSeedUrl = (u: unknown): u is string => typeof u === 'string' && LOCAL.test(u);

/** JSON 里（任意层级）出现的本地示范图 */
export function collectLocalUrls(value: any, out = new Set<string>()): Set<string> {
  if (isLocalSeedUrl(value)) out.add(value);
  else if (Array.isArray(value)) value.forEach(v => collectLocalUrls(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach(v => collectLocalUrls(v, out));
  return out;
}

const uploaded = new Map<string, Promise<string>>();
/** 把一张本地示范图传到 Storage，返回公开网址；同一进程里同一张只传一次 */
export function localizeOne(url: string): Promise<string> {
  let p = uploaded.get(url);
  if (!p) {
    p = (async () => {
      const file = url.slice('/lab/'.length);
      const buf = await fs.readFile(path.join(process.cwd(), 'public', 'lab', file));
      return uploadLabAsset(buf, `seed-${file}`, MIME[file.split('.').pop()!.toLowerCase()] || 'application/octet-stream');
    })();
    p.catch(() => uploaded.delete(url));
    uploaded.set(url, p);
  }
  return p;
}

/**
 * 把一段 JSON（sim / profile）里的本地示范图全部换成 Storage 网址。
 * 传不上去（开发环境没配 Storage）就原样保留 /lab/…，页面照样能显示。
 */
export async function localizeSeedUrls<T>(value: T): Promise<{ value: T; map: Map<string, string>; failed: string[] }> {
  const map = new Map<string, string>();
  const failed: string[] = [];
  for (const u of collectLocalUrls(value)) {
    try { map.set(u, await localizeOne(u)); }
    catch (e: any) { failed.push(u); console.warn('[lab-seed-assets] 上传失败，保留本地路径：', u, e?.message || e); }
  }
  return { value: map.size ? rewriteUrls(value, map) : value, map, failed };
}

/**
 * 库里还指着 /lab/… 的素材一次性搬进 Storage：上传 → 改素材行的 url → 刷新挂着它的空间的缓存 →
 * 兜底把剩下的旧路径字符串也改掉。管理后台「存储」页的按钮调它；可重复跑（第二遍没东西可搬）。
 */
export async function localizeLibrary(): Promise<{ moved: number; refreshed: number; rewritten: number; failed: { url: string; error: string }[] }> {
  const { data: assets, error } = await supabaseAdmin.from('lab_art_assets').select('id, url').like('url', '/lab/%');
  if (error) throw error;
  const rows = ((assets || []) as { id: string; url: string }[]).filter(a => isLocalSeedUrl(a.url));
  let moved = 0, refreshed = 0, rewritten = 0;
  const failed: { url: string; error: string }[] = [];
  for (const a of rows) {
    try {
      const url = await localizeOne(a.url);
      const { error: uErr } = await supabaseAdmin.from('lab_art_assets').update({ url, updated_at: new Date().toISOString() }).eq('id', a.id);
      if (uErr) throw uErr;
      moved++;
      refreshed += await refreshArtCache(await tasksUsingAssets([a.id]));
      rewritten += await rewriteUrlEverywhere(a.url, url);
    } catch (e: any) {
      failed.push({ url: a.url, error: e?.message || String(e) });
    }
  }
  return { moved, refreshed, rewritten, failed };
}

/** 库里还有几张没搬的（管理后台显示用） */
export async function countLocalAssets(): Promise<number> {
  const { count } = await supabaseAdmin.from('lab_art_assets').select('id', { count: 'exact', head: true }).like('url', '/lab/%');
  return count || 0;
}
