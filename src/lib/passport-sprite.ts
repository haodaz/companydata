/**
 * 护照精灵「签签」· 服务端（2026-11-17）：带工具调用的智能体，只看、只动本人这一本护照。
 * 模型调用复用 AI 工作台的多厂商适配（src/lib/ws/agent.ts 的 stepOnce），默认和 /invest 一样「阿里优先、Claude 保底」，环境变量 PASSPORT_MODEL / PASSPORT_FALLBACK_MODEL 可换。
 *
 * 工具分两类：
 *  - 只读（读护照、查看记录、预约、去认证的去处、演示签章库）：服务端直接执行；
 *  - 会改数据（加一条、改资料、贴演示签章、生成 / 撤回分享、预约、申请核验）：服务端只核对参数、不执行，
 *    推一张「确认卡」给前端并停下这一轮；本人点「确认」后由前端调现成的 /api/passport/me/* 接口执行（照样校验管理员、照样播盖戳 / 贴签动效），
 *    再把执行结果作为这个工具的结果接回来继续聊。点「算了」就回一个「本人没同意」。
 * 对话历史放在前端（不新建表），每次带上来；服务端只认结构、截长度，伪造历史只影响他自己的这段对话。
 */
import type Anthropic from '@anthropic-ai/sdk';
import { stepOnce, type AgentKit, type Call, type Ev, type Msg, type Result } from '@/lib/ws/agent';
import { makeScrubber, scrubStream } from '@/lib/ws/scrub';
import { DESTINATIONS, FINISH_TAG, PAGES, VISIBILITY, pageDef, type PageId, type Visibility } from '@/app/passport/data';
import { DEMO_LIB, demoOption } from '@/app/passport/demo-lib';
import { SPRITE_NAME } from '@/app/passport/sprite-name';
import { cleanPages } from '@/lib/passport';
import { COVERS, MOTTO_MAX, PAPERS, PATTERNS, cleanMotto, isCover, isPaper, isPattern } from '@/app/passport/themes';
import type { OwnerBundle } from '@/app/passport/api-types';

export const SPRITE_MODELS = [process.env.PASSPORT_MODEL || 'qwen3.7-plus', process.env.PASSPORT_FALLBACK_MODEL || 'claude-opus-5-5'];

/* ---------- 简单防刷：每个账号每分钟 6 次、每天 80 次（单实例内存计数，重启清零） ---------- */
const hits = new Map<string, number[]>();
export function rateLimit(userId: string): string | null {
  const now = Date.now(), day = 86400000;
  const arr = (hits.get(userId) || []).filter(t => now - t < day);
  if (arr.filter(t => now - t < 60000).length >= 6) return `${SPRITE_NAME}有点忙不过来了，歇一分钟再问我吧。`;
  if (arr.length >= 80) return `今天我们已经聊了很多啦，明天再来找${SPRITE_NAME}吧。`;
  arr.push(now); hits.set(userId, arr);
  return null;
}

/* ---------- 工具 ---------- */
const str = { type: 'string' } as const, num = { type: 'number' } as const, bool = { type: 'boolean' } as const;
const tool = (name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = []): Anthropic.Tool => ({ name, description, input_schema: { type: 'object', properties, required } });
const SHAREABLE = PAGES.filter(p => !p.ownerOnly).map(p => `${p.id}=${p.title}`).join('、');
export const SPRITE_TOOLS: Anthropic.Tool[] = [
  tool('read_passport', '读本人这本护照的全部内容：身份页信息、本人自述的条目（带核验状态）、演示签章库加进来的演示签章（不是真实签发）、每一页有几条。'),
  tool('list_shares', '查分享记录：给过谁、看哪几页、几天、到期没、撤回没、对方看过几次、最后什么时候看的。'),
  tool('list_bookings', '查「去认证」的预约记录。'),
  tool('list_destinations', '列出「去认证」的几个去处：去哪儿、能拿到什么签、用时、费用、可选的时间或题目。建议去哪儿拿新签时只从这里挑。'),
  tool('list_demo_library', '列出演示签章库：每条的 key、名字、落在哪一页、是否已经在护照里。'),
  tool('show_options', '需要本人做选择时用：在界面上弹出一个可选资源的抽屉让他点选。kind：destinations 去认证的去处 / demo_stamps 演示签章库里还没加的 / share_targets 分享给谁。只在要他选的时候用；他点选后会用一句话告诉你选了什么，你再调对应的工具。', { kind: str }, ['kind']),
  tool('add_self_item', '在「本人填写」页加一条本人自述（会盖一枚本人章，状态是本人自述 · 待核验）。kind：exp 经历 / work 作品 / cert 证书。title 盖在章上，最好 6 个字以内。verify=true 表示同时申请平方核验。', { kind: str, title: str, org: str, date: str, link: str, verify: bool }, ['kind', 'title']),
  tool('update_profile', '改身份页上的昵称（≤10 字）、一句话简介（≤60 字）、联系方式可见范围（self 仅自己可见 / grant 授权后可见 / public 公开）。只传要改的。', { nickname: str, bio: str, visibility: str }),
  tool('add_demo_stamp', '从演示签章库贴一条演示签章进护照（标「演示」，不是真实签发）。key 来自 list_demo_library。', { key: str }, ['key']),
  tool('create_share', `生成一条分享链接（按页授权）。pages 从这些里选：${SHAREABLE}（身份页必含）；days 1–365；to 写给谁。`, { to: str, pages: { type: 'array', items: str }, days: num }, ['to', 'pages', 'days']),
  tool('revoke_share', '撤回一次还有效的分享授权。share_id 来自 list_shares。', { share_id: str }, ['share_id']),
  tool('book_destination', '预约「去认证」的一个去处。dest 和 slot 必须来自 list_destinations。', { dest: str, slot: str }, ['dest', 'slot']),
  tool('request_verify', '给一条本人自述申请平方核验。claim_no 来自 read_passport。', { claim_no: str }, ['claim_no']),
  tool('update_look', `定制我的人才护照：cover 封面（${Object.entries(COVERS).map(([k, v]) => `${k}=${v.name}`).join('、')}）、paper 内页纸张（${Object.entries(PAPERS).map(([k, v]) => `${k}=${v.name}`).join('、')}）、pattern 封面烫印纹样（${Object.entries(PATTERNS).map(([k, v]) => `${k}=${v}`).join('、')}）、motto 封面一句话（≤12 字）。只传要改的。`, { cover: str, paper: str, pattern: str, motto: str }),
];
export const WRITE_TOOLS = new Set(['add_self_item', 'update_profile', 'add_demo_stamp', 'create_share', 'revoke_share', 'book_destination', 'request_verify', 'update_look']);

/* ---------- 系统提示 ---------- */
const GUIDE = `护照怎么用：
- 护照一页一页翻：身份页、本人填写、鉴真签、ATA 能力签、体验签、真活签、长处与发展、足迹、查看记录。
- 本人做过的事在「加一条」里加，盖一枚「本人自述 · 待核验」的章；可以申请平方核验，对上了换成核验章。
- 别人签发的签（鉴真签、ATA 考试 / AI 能力认证、体验签、真活签）去「去认证」里拿：考试、AI 百业模拟岗位、真活台企业题。拿到后贴进护照。
- 「演示签章库」里的签章只是演示，用来看效果，不代表真的考过、做过。
- 「分享」按页授权：选给谁、看哪几页、看几天，生成一条链接；到期自动失效，随时能撤回；对方每看一次都记在「查看记录」。
- 「我的」里能改昵称、简介、联系方式给谁看、证件照，也能「定制我的人才护照」（封面颜色、烫印纹样、封面一句话、内页纸张）。`;

export function spriteSystem(b: OwnerBundle) {
  const p = b.passport;
  return `你是人才护照里的护照精灵「${SPRITE_NAME}」，陪这本护照的主人（${p.nickname || p.name}）打理护照：帮他查、帮他写、帮他改护照里的状态、告诉他去哪儿拿新的签。

说话方式：像一个懂行的朋友，简体中文，短句，先给结论，一次说两三句到一小段；必要时用 ①②③ 列两三点；纯文字，不用 Markdown（星号加粗、井号标题、表格都不要）、不用表情符号。不要念出工具名、参数名、编号。

规矩：
- 只根据这本护照里已有的内容说话。经历、分数、等级、签发方一律来自工具结果；没有的就说护照里还没有，不编、不猜、不用常识补。
- 本人自述的条目要说明「还没核验」；演示签章库加进来的要说明「这是演示的，不是真实签发」，不能拿演示签章当真本事夸。
- 建议去哪儿拿新签，只从「去认证」的去处里挑：先 list_destinations 看清楚，文字里只说最推荐的一两个和理由（能拿到什么签、大概多久），然后一定调 show_options(kind=destinations) 把全部去处弹给他挑。
- 需要护照内容时先调只读工具查，别凭印象。
- 需要他从几样里挑一个（去哪儿认证、贴哪张演示签章、分享给谁）时，调 show_options 弹出资源抽屉让他点，别在文字里列一长串。
- 会改数据的事（加一条、改资料、定制封面纸张、贴演示签章、生成或撤回分享、预约、申请核验）：直接调对应的工具，界面会弹一张确认卡让本人点「确认」才执行，你不用先在文字里反复问「要不要」。确认卡出来前用一句话说你打算做什么。工具结果里 declined=true 表示本人没同意，就别再提这件事。
- 帮他写分享给 HR 的话时，只用护照里有的事实；演示签章不能写进去当成就。
- 不聊和这本护照无关的事，礼貌带回来。

${GUIDE}`;
}

/* ---------- 只读工具的执行 ---------- */
const st = (i: { status: string }) => (i.status === 'review' ? '本人自述 · 已申请平方核验（还没核验完）' : '本人自述 · 还没核验');
function readPassport(b: OwnerBundle) {
  const p = b.passport;
  const self = b.items.filter(i => i.source === 'self');
  const demo = b.items.filter(i => i.source === 'demo');
  const count = Object.fromEntries(PAGES.filter(x => x.id !== 'id' && x.id !== 'access').map(x => [x.title, b.items.filter(i => i.page === x.id).length]));
  return {
    身份页: { 姓名: p.name, 昵称: p.nickname, 简介: p.bio || '（还没写）', 护照号: p.passportNo, 联系方式: VISIBILITY[p.visibility], 证件照: p.avatarUrl ? '已上传' : '还没上传（用的默认照）' },
    本人自述: self.map(i => ({ claim_no: i.claimNo, 类别: i.kind === 'exp' ? '经历' : i.kind === 'work' ? '作品' : '证书', 名字: i.title, 在哪儿: i.org || undefined, 时间: i.date || undefined, 链接: i.link || undefined, 状态: st(i) })),
    演示签章: demo.map(i => { const o = demoOption(i.demoKey || ''); const c = o?.make({ name: p.name, nameEn: 'HOLDER' }, i.claimNo); return { 说明: '演示数据，不是真实签发', 页: pageDef(i.page).title, 名字: o?.label || i.title, 内容: c?.statement, 分项: c?.scores?.map(s => `${s.name} ${s.v}/${s.max}`).join('；') || undefined }; }),
    每页条数: count,
    还没签发的页: PAGES.filter(x => !['id', 'self', 'access'].includes(x.id) && !b.items.some(i => i.page === x.id)).map(x => x.title),
  };
}
function listShares(b: OwnerBundle) {
  const now = Date.now();
  return b.grants.map(g => ({ share_id: g.id, 给谁: g.to, 页: g.pages.map(x => pageDef(x).title).join('、'), 天数: g.days, 到期: g.expiresAt.slice(0, 10), 状态: g.revokedAt ? '已撤回' : new Date(g.expiresAt).getTime() < now ? '已到期' : '有效', 看过: g.views, 最后查看: g.lastViewAt?.slice(0, 16).replace('T', ' ') || undefined }));
}
const destInfo = () => DESTINATIONS.map(d => ({ dest: d.id, 去处: d.title, 谁家: d.who, 拿到: d.gets, 用时: d.time, 费用: d.cost, 说明: d.desc, 可选: d.slots }));

/** 资源抽屉里的一张张卡：点了就把 say 当作本人的一句话发给签签 */
export interface OptionItem { id: string; title: string; sub: string; gets?: string; time?: string; cost?: string; tag?: string; say: string }
export interface Options { kind: string; title: string; items: OptionItem[] }
export function optionsFor(kind: string, b: OwnerBundle): Options | null {
  if (kind === 'destinations') return { kind, title: '去哪儿拿一枚新的签', items: DESTINATIONS.map(d => ({ id: d.id, title: d.title, sub: d.who, gets: d.gets, time: d.time, cost: d.cost, say: `我想${d.title.replace(/^去/, '去')}` })) };
  if (kind === 'demo_stamps') { const have = new Set(b.items.filter(i => i.source === 'demo').map(i => i.demoKey)); return { kind, title: '从演示签章库挑一张', items: DEMO_LIB.filter(o => !have.has(o.key)).map(o => ({ id: o.key, title: o.label, sub: `${pageDef(o.page).title} · ${o.sub}`, tag: o.finish ? `演示 · ${FINISH_TAG[o.finish]}` : '演示', say: `帮我加演示签章「${o.label}」` })) }; }
  if (kind === 'share_targets') return { kind, title: '分享给谁', items: [
    { id: 'campus', title: '某校招平台', sub: '身份 · 鉴真 · ATA · 7 天', say: '分享给某校招平台，看身份、鉴真签、ATA 能力签，7 天' },
    { id: 'hunter', title: '某猎头', sub: '身份 · 鉴真 · ATA · 真活 · 长处 · 14 天', say: '分享给某猎头，看身份、鉴真签、ATA 能力签、真活签、长处与发展，14 天' },
    { id: 'hr', title: '某企业 HR', sub: '身份 · 本人填写 · 真活 · 3 天', say: '分享给某企业 HR，看身份、本人填写、真活签，3 天' },
  ] };
  return null;
}
export async function runRead(name: string, b: OwnerBundle, input?: Record<string, unknown>): Promise<{ label: string; result: unknown; options?: Options }> {
  if (name === 'read_passport') return { label: '看了一遍护照', result: readPassport(b) };
  if (name === 'list_shares') return { label: '看了分享记录', result: b.grants.length ? listShares(b) : { 说明: '还没分享过' } };
  if (name === 'list_bookings') return { label: '看了预约', result: b.bookings.length ? b.bookings.map(x => ({ 去处: DESTINATIONS.find(d => d.id === x.dest)?.title || x.dest, 选的: x.slot, 预约号: x.no, 时间: x.createdAt.slice(0, 16).replace('T', ' ') })) : { 说明: '还没有预约' } };
  if (name === 'list_destinations') return { label: '看了去认证的去处', result: destInfo() };
  if (name === 'show_options') { const o = optionsFor(String(input?.kind), b); return o ? { label: '给你挑了几样', result: { 已在界面上弹出: o.title, 选项: o.items.map(x => x.title) }, options: o } : { label: name, result: { error: 'kind 只能是 destinations / demo_stamps / share_targets' } }; }
  if (name === 'list_demo_library') { const have = new Set(b.items.filter(i => i.source === 'demo').map(i => i.demoKey)); return { label: '翻了演示签章库', result: DEMO_LIB.map(o => ({ key: o.key, 名字: o.label, 页: pageDef(o.page).title, 简介: o.sub, 已在护照里: have.has(o.key) })) }; }
  return { label: name, result: { error: '没有这个工具' } };
}

/* ---------- 会改数据的工具：只核对、出确认卡，不执行 ---------- */
export interface Confirm { id: string; name: string; title: string; lines: string[]; action: Record<string, unknown> }
const s = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
export function propose(c: Call, b: OwnerBundle): { confirm: Confirm } | { error: string } {
  const i = (c.input || {}) as Record<string, unknown>;
  const mk = (title: string, lines: string[], action: Record<string, unknown>) => ({ confirm: { id: c.id, name: c.name, title, lines, action } });
  if (c.name === 'add_self_item') {
    const kind = String(i.kind); if (!['exp', 'work', 'cert'].includes(kind)) return { error: 'kind 只能是 exp / work / cert' };
    const title = s(i.title, 16); if (!title) return { error: '名字不能空' };
    if (b.items.filter(x => x.source === 'self').length >= 8) return { error: '「本人填写」页已经满 8 条了' };
    const kn = kind === 'exp' ? '经历' : kind === 'work' ? '作品' : '证书';
    const a = { kind, title, org: s(i.org, 30), date: s(i.date, 12), link: s(i.link, 120) || undefined, verify: i.verify === true };
    return mk(`在「本人填写」页盖一枚${kn}章`, [`名字：${title}`, ...(a.org ? [`在哪儿：${a.org}`] : []), ...(a.date ? [`时间：${a.date}`] : []), ...(a.link ? [`链接：${a.link}`] : []), a.verify ? '同时申请平方核验' : '先不申请核验（本人自述 · 待核验）'], a);
  }
  if (c.name === 'update_profile') {
    const a: Record<string, unknown> = {}; const lines: string[] = [];
    if (i.nickname !== undefined) { const n = s(i.nickname, 10); if (!n) return { error: '昵称不能空' }; a.nickname = n; lines.push(`昵称：${b.passport.nickname || '（空）'} → ${n}`); }
    if (i.bio !== undefined) { a.bio = s(i.bio, 60); lines.push(`简介 → ${a.bio || '（清空）'}`); }
    if (i.visibility !== undefined) { if (!['self', 'grant', 'public'].includes(String(i.visibility))) return { error: 'visibility 只能是 self / grant / public' }; a.visibility = i.visibility; lines.push(`联系方式：${VISIBILITY[b.passport.visibility]} → ${VISIBILITY[i.visibility as Visibility]}`); }
    if (!lines.length) return { error: '没有要改的' };
    return mk('改身份页上的个人信息', lines, a);
  }
  if (c.name === 'add_demo_stamp') {
    const o = demoOption(String(i.key)); if (!o) return { error: '演示签章库里没有这个 key' };
    if (b.items.some(x => x.source === 'demo' && x.demoKey === o.key)) return { error: '这一条已经在护照里了' };
    return mk(`${o.form === 'stamp' ? '盖' : '贴'}一条演示签章`, [`${o.label}（演示）`, `落在：${pageDef(o.page).title}`, '标着「演示」，不是真实签发'], { key: o.key });
  }
  if (c.name === 'create_share') {
    const days = Math.round(Number(i.days)); if (!Number.isFinite(days) || days < 1 || days > 365) return { error: 'days 要在 1–365' };
    const pages = cleanPages(i.pages) as PageId[]; const to = s(i.to, 20) || '某场景平台';
    return mk('生成一条分享链接', [`给谁：${to}`, `能看：${pages.map(x => pageDef(x).title).join('、')}`, `有效：${days} 天，随时能撤回`], { to, pages, days });
  }
  if (c.name === 'revoke_share') {
    const g = b.grants.find(x => x.id === String(i.share_id)); if (!g) return { error: '没有这条分享' };
    if (g.revokedAt) return { error: '这条已经撤回了' };
    return mk('撤回一次分享授权', [`给谁：${g.to}`, `能看：${g.pages.map(x => pageDef(x).title).join('、')}`, '撤回后对方再打开会看到「本人已撤回」'], { share_id: g.id });
  }
  if (c.name === 'book_destination') {
    const d = DESTINATIONS.find(x => x.id === String(i.dest)); if (!d) return { error: '没有这个去处，先调 list_destinations' };
    const slot = s(i.slot, 60); if (!d.slots.includes(slot)) return { error: `可选的只有：${d.slots.join(' / ')}` };
    return mk(`预约：${d.title}`, [`${d.who}`, `选的：${slot}`, `拿到：${d.gets}`], { dest: d.id, slot });
  }
  if (c.name === 'update_look') {
    const a: Record<string, unknown> = {}; const lines: string[] = []; const cur = b.passport.look;
    if (i.cover !== undefined) { if (!isCover(i.cover)) return { error: '没有这种封面' }; a.cover = i.cover; lines.push(`封面：${COVERS[cur.cover].name} → ${COVERS[i.cover].name}`); }
    if (i.paper !== undefined) { if (!isPaper(i.paper)) return { error: '没有这种纸张' }; a.paper = i.paper; lines.push(`纸张：${PAPERS[cur.paper].name} → ${PAPERS[i.paper].name}`); }
    if (i.pattern !== undefined) { if (!isPattern(i.pattern)) return { error: '没有这种纹样' }; a.pattern = i.pattern; lines.push(`纹样：${PATTERNS[cur.pattern]} → ${PATTERNS[i.pattern]}`); }
    if (i.motto !== undefined) { if (Array.from(String(i.motto)).length > MOTTO_MAX) return { error: `封面那句话最多 ${MOTTO_MAX} 个字` }; a.motto = cleanMotto(i.motto); lines.push(`封面一句话 → ${a.motto || '（不显示）'}`); }
    if (!lines.length) return { error: '没有要改的' };
    return mk('定制我的人才护照', lines, a);
  }
  if (c.name === 'request_verify') {
    const it = b.items.find(x => x.source === 'self' && x.claimNo === String(i.claim_no)); if (!it) return { error: '本人自述里没有这一条' };
    if (it.status === 'review') return { error: '这一条已经申请过核验了' };
    return mk('申请平方核验', [`条目：${it.title}`, '核验员会对公开记录、联系出具方；核验期间仍显示「本人自述」'], { claim_no: it.claimNo });
  }
  return { error: '没有这个工具' };
}

/* ---------- 历史：只认结构、截长度 ---------- */
const MAX_MSGS = 30;
export function cleanHistory(raw: unknown): Msg[] {
  const arr = Array.isArray(raw) ? raw.slice(-MAX_MSGS) : [];
  const out: Msg[] = [];
  for (const m of arr) {
    if (!m || typeof m !== 'object') continue;
    const r = m as Record<string, unknown>;
    if (r.role === 'user') out.push({ role: 'user', text: s(r.text, 2000) });
    else if (r.role === 'assistant') out.push({ role: 'assistant', text: s(r.text, 4000), calls: (Array.isArray(r.calls) ? r.calls : []).slice(0, 8).map((c: Record<string, unknown>) => ({ id: s(c?.id, 80), name: s(c?.name, 40), input: c?.input && typeof c.input === 'object' ? c.input : {} })) });
    else if (r.role === 'tool') out.push({ role: 'tool', results: (Array.isArray(r.results) ? r.results : []).slice(0, 8).map((x: Record<string, unknown>) => ({ id: s(x?.id, 80), name: s(x?.name, 40), content: s(x?.content, 4000) })) });
  }
  // 从第一条用户消息开始（截断后别让开头是孤零零的工具结果）
  const first = out.findIndex(m => m.role === 'user');
  const h = first < 0 ? [] : out.slice(first);
  // 工具调用和结果要成对：没配上结果的调用补一个「本人没处理」，多出来的结果丢掉
  const fixed: Msg[] = [];
  for (let k = 0; k < h.length; k++) {
    const m = h[k];
    if (m.role === 'tool') continue;
    fixed.push(m);
    if (m.role === 'assistant' && m.calls.length) {
      const next = h[k + 1];
      const got = next?.role === 'tool' ? next.results : [];
      fixed.push({ role: 'tool', results: m.calls.map(c => got.find(x => x.id === c.id) || { id: c.id, name: c.name, content: JSON.stringify({ declined: true, note: '本人没有处理这一步，改说别的了' }) }) });
    }
  }
  return fixed;
}
/** 确认卡的结果接回去：合进最后那条工具结果里 */
export function withResults(h: Msg[], results: Result[]): Msg[] {
  const last = h[h.length - 1], prev = h[h.length - 2];
  if (!results.length || last?.role !== 'tool' || prev?.role !== 'assistant') return h;
  const ids = new Set(prev.calls.map(c => c.id));
  const map = new Map(results.filter(r => ids.has(r.id)).map(r => [r.id, { id: r.id, name: r.name, content: s(r.content, 2000) }]));
  return [...h.slice(0, -1), { role: 'tool', results: last.results.map(r => map.get(r.id) || r) }];
}
/** 历史最后一条是不是还在等确认卡 */
export const pendingIds = (h: Msg[]) => {
  const last = h[h.length - 1], prev = h[h.length - 2];
  if (last?.role !== 'tool' || prev?.role !== 'assistant') return [];
  return last.results.filter(r => { try { return JSON.parse(r.content)?.pending === true; } catch { return false; } }).map(r => r.id);
};

/* ---------- 一轮：模型说话 → 只读工具直接跑 → 碰到会改数据的工具就出确认卡停下 ---------- */
export type SpriteEv = Ev | { t: 'confirm'; confirm: Confirm } | { t: 'options'; options: Options };
export async function spriteTurn(history: Msg[], b: OwnerBundle, emit: (e: SpriteEv) => void): Promise<Msg[]> {
  const kit: AgentKit = { system: spriteSystem(b), tools: SPRITE_TOOLS, run: async (n, i) => runRead(n, b, i), org: '人才护照', task: `人才护照 · ${SPRITE_NAME}`, maxTokens: 1500 };
  const clean = makeScrubber(SPRITE_TOOLS);
  const added: Msg[] = [];
  for (let step = 0; step < 6; step++) {
    const stream = scrubStream(clean, delta => emit({ t: 'text', delta }));
    const say = (e: Ev) => (e.t === 'text' ? stream.write(e.delta) : emit(e));
    let out: Awaited<ReturnType<typeof stepOnce>> | null = null, lastErr: unknown = null;
    for (const model of SPRITE_MODELS) {
      try { out = await stepOnce([...history, ...added], model, kit, say); break; } catch (e) { lastErr = e; console.warn(`[passport/sprite] ${model} 失败：${String((e as Error)?.message || e).slice(0, 200)}`); }
    }
    stream.flush();
    if (!out) throw lastErr || new Error('模型没有回应');
    added.push({ role: 'assistant', text: clean(out.text), calls: out.calls, provider: out.provider });
    if (!out.calls.length) break;
    const results: Result[] = [];
    let waiting = false;
    for (const c of out.calls) {
      if (WRITE_TOOLS.has(c.name)) {
        const p = propose(c, b);
        if ('error' in p) { results.push({ id: c.id, name: c.name, content: JSON.stringify({ error: p.error }), is_error: true }); continue; }
        results.push({ id: c.id, name: c.name, content: JSON.stringify({ pending: true }) });
        emit({ t: 'confirm', confirm: p.confirm }); waiting = true; continue;
      }
      emit({ t: 'tool_start', id: c.id, name: c.name, input: c.input });
      const r = await runRead(c.name, b, (c.input || {}) as Record<string, unknown>);
      results.push({ id: c.id, name: c.name, content: JSON.stringify(r.result).slice(0, 8000), label: r.label });
      emit({ t: 'tool_end', id: c.id, name: c.name, label: r.label });
      if (r.options) emit({ t: 'options', options: r.options });
    }
    added.push({ role: 'tool', results });
    if (waiting) break;   // 等本人点确认卡；结果由下一次请求接上
  }
  return added;
}
