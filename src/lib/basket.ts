/**
 * 数据外采篮（Chrome 插件）的平台一侧：插件把人正在看的页面「放进篮子」，这里提炼、入库、打采集标记。
 *
 * 为什么有它：很多招聘站只给真人看（检测无头浏览器就跳空白、要过「我是人类」、入口藏在 JS 按钮后面），
 * 模型自己一路检索最后都是 0。人做判断（打开、过验证、翻页、点开详情），插件只读人屏幕上已经显示的字，
 * 不点、不翻、不绕反爬（2026-10-16 和百度一起磨出来的做法）。
 */
import { supabaseAdmin } from '@/lib/supabase';
import { structureJobData } from '@/lib/agents/structurer-job';
import { upsertJobsFromLog } from '@/lib/job-store';
import { verifyToken, signToken, type SessionPayload } from '@/lib/jwt';

export const BASKET_MODEL = () => process.env.BASKET_MODEL || process.env.CHEAP_MODEL || 'qwen-plus';

/** 篮子口令：登录用户在宣传页上生成，粘进插件设置。就是一张 30 天的登录票，带 purpose 标记 */
export async function issueBasketToken(user: SessionPayload) {
  return signToken({ id: user.id, email: user.email, role: user.role, purpose: 'basket' } as any);
}

export async function readBasketToken(req: Request): Promise<SessionPayload | null> {
  const h = req.headers.get('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (m) return verifyToken(m[1].trim());
  const c = (req.headers.get('cookie') || '').match(/(?:^|;\s*)auth_token=([^;]+)/);
  return c ? verifyToken(decodeURIComponent(c[1])) : null;
}

export type BasketPage = {
  companyId: number;
  url: string;
  title?: string;
  text: string;                       // 页面上人看得到的文字（innerText）
  links?: { t: string; h: string }[]; // 页面上的链接（岗位详情链接靠它）
  kind?: 'list' | 'detail' | 'auto';
};

/** 同一个人同一天的篮子归到一个岗位任务里，任务列表里能看到「谁哪天挎篮子采了什么」 */
async function todayTask(user: SessionPayload) {
  const day = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const name = `🧺 数据外采篮 · ${user.email} · ${day}`;
  const { data: found } = await supabaseAdmin.from('job_tasks').select('id').eq('name', name).limit(1);
  if (found?.[0]) return found[0].id as string;
  const { data, error } = await supabaseAdmin.from('job_tasks').insert({ name, scope: 'campus', model_id: BASKET_MODEL(), created_by: user.email, status: 'running', notes: '数据外采篮：人在自己的 Chrome 里打开 / 翻页 / 点开详情，插件只读页面上已经显示的文字' }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

/** 正文太长时只留岗位相关的部分；导航、页脚这些不要 */
function compact(text: string) {
  return text.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim().slice(0, 60000);
}

export async function ingestBasketPage(user: SessionPayload, p: BasketPage) {
  const { data: co } = await supabaseAdmin.from('companies').select('id, name, if_delete').eq('id', p.companyId).maybeSingle();
  if (!co || co.if_delete) throw new Error('找不到这家企业（可能已合并），请在插件里重新选一下');
  const text = compact(p.text || '');
  if (text.length < 40) throw new Error('这一页几乎没有文字，可能还没加载完，等一下再放进篮子');
  const jobLinks = (p.links || []).filter(l => /job|position|post|detail|职位|岗位/i.test(l.h + l.t)).slice(0, 300);
  const md = `### Source: [${(p.title || co.name).replace(/[\[\]]/g, '')}](${p.url})\n\n（数据外采篮：${user.email} 在自己的浏览器里打开这一页，插件读取页面上显示的文字）\n\n${text}\n\n${jobLinks.length ? `## 页面上的岗位链接\n${jobLinks.map(l => `[${l.t.replace(/[\[\]]/g, '')}](${l.h})`).join('\n')}\n` : ''}`;

  const taskId = await todayTask(user);
  const model = BASKET_MODEL();
  const { data: log, error } = await supabaseAdmin.from('job_crawl_logs').insert({ task_id: taskId, target_url: p.url, company: co.name, company_id: co.id, hint: '', fetcher_status: 'success', structurer_status: 'running', raw_markdown: md, markdown_len: md.length, model_id: model }).select('id').single();
  if (error) throw error;
  const r = await structureJobData(md, co.name, '', model, Date.now(), 'campus');
  if (!r) {
    await supabaseAdmin.from('job_crawl_logs').update({ structurer_status: 'failed', error_message: '提炼失败' }).eq('id', log.id);
    throw new Error('这一页没提炼出结果，换一页再试');
  }
  // partial_page：篮子送来的只是一页，入库时不拿它判断别的岗位「已下线」
  const structured = { ...r, partial_page: true, pipeline_log: [{ key: 'basket', title: `数据外采篮 · ${user.email}`, status: 'success', color: 'green' }] };
  await supabaseAdmin.from('job_crawl_logs').update({ structurer_status: 'success', structured_json: structured }).eq('id', log.id);
  const saved = r.jobs.length ? await upsertJobsFromLog(log.id, structured) : 0;
  await supabaseAdmin.from('job_crawl_logs').update({ pushed_to_db: saved > 0, jobs_saved: saved }).eq('id', log.id);

  // 采集标记：详情页（只有一个岗位、带职责要求）标「详情已补」，列表页标「仅列表信息」
  const isDetail = p.kind === 'detail' || (p.kind !== 'list' && r.jobs.length === 1 && text.length > 400);
  if (saved) {
    const { data: rows } = await supabaseAdmin.from('jobs').select('id, collect_flags').eq('source_log_id', log.id);
    for (const j of rows || []) {
      const f = new Set<string>(j.collect_flags || []);
      f.add('数据外采篮');
      if (isDetail) { f.add('详情已补'); f.delete('仅列表信息'); } else if (!f.has('详情已补')) f.add('仅列表信息');
      if (/内推码/.test(text)) f.add('支持内推码');
      await supabaseAdmin.from('jobs').update({ collect_flags: [...f] }).eq('id', j.id);
    }
  }
  return { company: co.name, jobs: r.jobs.length, saved, kind: isDetail ? 'detail' : 'list', names: r.jobs.slice(0, 12).map(j => String(j.name || '')) };
}

/** 待采清单：AI 自己啃不动的企业（库里有档、0 个在招岗位），附上卡在哪、可能的入口 */
export async function basketQueue(limit = 60) {
  const { data: counts } = await supabaseAdmin.from('company_relation_counts').select('company_id, jobs_open, url_total').eq('jobs_open', 0).limit(3000);
  const ids = (counts || []).map(c => c.company_id);
  const out: any[] = [];
  for (let i = 0; i < ids.length && out.length < limit; i += 200) {
    const { data } = await supabaseAdmin.from('companies').select('id, name, campus_url, careers_url, official_website, source').in('id', ids.slice(i, i + 200)).not('if_delete', 'is', true).or('campus_url.not.is.null,careers_url.not.is.null');
    out.push(...(data || []));
  }
  return out.slice(0, limit).map(c => ({ id: c.id, name: c.name, entry: c.campus_url || c.careers_url || c.official_website, source: c.source }));
}
