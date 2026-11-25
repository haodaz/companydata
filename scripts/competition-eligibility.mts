/**
 * 海外比赛：中国大陆的人能不能报、奖金能不能领（11-25）。
 * 读官网 + 规则页（Devpost 是 /rules），千问只按原文判断，证据必须是原文里的句子，否则算「规则没写明」。
 * 结果写到 note 开头一行「中国大陆：可报 / 不可报 / 规则没写明——原文：…」，参赛资格空的顺手补上；人工锁定的不动。
 *   npx tsx scripts/competition-eligibility.mts --task 12,13 [--apply]
 */
process.loadEnvFile('.env.local');
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { fetchJinaUrl } = await import('@/lib/agents/fetcher');
const { generateContent } = await import('@/lib/llm-client');
const { parseJsonLoose } = await import('@/lib/agents/search-llm');
const { withCost } = await import('@/lib/token-logger');

const opt = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : ''; };
const APPLY = process.argv.includes('--apply');
const tasks = opt('task').split(',').filter(Boolean);
const { data: ss } = await db.from('competition_searches').select('id').in('task_id', tasks);
const { data: rows } = await db.from('competitions').select('id,name,official_url,registration_url,eligibility,note,region,human_locked_fields').in('search_id', (ss || []).map((s: any) => s.id));
const overseas = (rows || []).filter((c: any) => (c.official_url || c.registration_url) && !/[\u4e00-\u9fff]/.test(c.name) && (c.region === 'overseas' || !/\.cn\/|\.cn$|aliyun|baidu|huawei|tencent|xfyun|modelscope|heywhale|datafountain|saikr|nowcoder|52jingsai|huodongxing|cvmart|datacastle|segmentfault|juejin/.test(c.official_url || c.registration_url)));
console.log(`海外比赛 ${overseas.length} 个`);

const LABEL: Record<string, string> = { yes: '可报', no: '不可报', unclear: '规则没写明' };
const out: any[] = [];
let k = 0;
await Promise.all([0, 1, 2].map(async () => {
  for (let c; (c = overseas[k++]);) {
    const base = (c.official_url || c.registration_url).replace(/[?#].*$/, '').replace(/\/$/, '');
    const urls = [base, ...(/devpost\.com/.test(base) ? [`${base}/rules`] : [])];
    const text = (await Promise.all(urls.map(u => Promise.race([fetchJinaUrl(u).catch(() => ''), new Promise<string>(r => setTimeout(() => r(''), 60_000))])))).map((t, i) => `### ${urls[i]}\n${(t || '').slice(0, 30000)}`).join('\n\n');
    if (text.length < 500) { out.push({ id: c.id, name: c.name, verdict: 'unclear', quote: null, why: '页面打不开' }); continue; }
    const r: any = await Promise.race([new Promise(r => setTimeout(() => r({ text: '{}' }), 120_000)), withCost({ tool_name: 'competition-radar', task_name: '海外比赛中国可报核对 11-25' }, () => generateContent(`下面是比赛「${c.name}」的官网 / 规则页原文。判断：住在中国大陆的个人或团队能不能报名参赛并领奖。
- 规则明确不限国家 / open worldwide，且没把中国列进排除名单 → yes
- 列了排除国家名单、名单里没有 China → yes，quote 抄那句排除名单
- 把 China / PRC 列进不能参加的国家，或只限某些国家（如只限美国居民）→ no
- 没写参赛资格的国家限制 → unclear
quote 必须一字不差抄原文里的那一句（英文就抄英文），找不到就 null；why 用一句中文说明。
${text}
只返回 JSON：{"verdict":"yes|no|unclear","quote":null,"why":"","eligibility":"参赛资格一句话中文（谁能报、几人一队）"}`, 'qwen3.7-plus', { jsonMode: true, temperature: 0 }))]);   // 卡住的页 / 模型 2 分钟就放弃，记「规则没写明」
    const v = parseJsonLoose(r.text) || {};
    let verdict = ['yes', 'no', 'unclear'].includes(v.verdict) ? v.verdict : 'unclear';
    // 原文对得上就算（空白 / 大小写不计，引得长时前 60 个字对上即可）
    const flat = (x: string) => x.replace(/[\s*_`>]+/g, ' ').trim().toLowerCase();
    const q = typeof v.quote === 'string' ? v.quote.trim() : '', ft = flat(text);
    const quote = q && (ft.includes(flat(q)) || (q.length > 60 && ft.includes(flat(q).slice(0, 60)))) ? q : null;
    if (!quote && verdict !== 'unclear') verdict = 'unclear';   // 没有原文证据不下结论
    out.push({ id: c.id, name: c.name, verdict, quote, why: v.why, eligibility: v.eligibility, url: base });
    console.log(`${LABEL[verdict]} · ${c.name} · ${String(quote || v.why || '').slice(0, 90)}`);
    if (APPLY) {
      const locked = new Set<string>(c.human_locked_fields || []);
      const line = `中国大陆：${LABEL[verdict]}${quote ? `——原文：${quote.slice(0, 200)}` : v.why ? `（${v.why}）` : ''}`;
      const patch: any = {};
      if (!locked.has('note')) patch.note = [line, String(c.note || '').replace(/^中国大陆：.*\n?/, '')].filter(Boolean).join('\n');
      if (!c.eligibility && v.eligibility && !locked.has('eligibility')) patch.eligibility = v.eligibility;
      if (Object.keys(patch).length) await db.from('competitions').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', c.id);
    }
  }
}));
(await import('node:fs')).writeFileSync('reports/1125-海外比赛中国可报核对.json', JSON.stringify(out, null, 1));
console.log(Object.fromEntries(['yes', 'no', 'unclear'].map(x => [LABEL[x], out.filter(o => o.verdict === x).length])));
process.exit(0);
