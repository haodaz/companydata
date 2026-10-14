import { NextResponse } from 'next/server';
import { generateContent } from '@/lib/llm-client';
import { logTokenUsage } from '@/lib/token-logger';
import { parseJsonLoose } from '@/lib/agents/search-llm';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_COMPANIES = 8;
const MAX_OCCUPATIONS = 6;
const MAX_STD_ITEMS = 5;

/** 厂长排产：把一句话总任务拆成流水线参数 */
export async function POST(req: Request) {
  try {
    const { task, model } = await req.json();
    if (!task || !String(task).trim()) return NextResponse.json({ error: '请输入总任务' }, { status: 400 });
    const modelId = model || 'gemini-3.8-flash';

    const prompt = `
      你是「智能企业数据工厂」的厂长 Max。工厂有三条产线，先判断这个总任务该走哪一条（line）：
        company    企业与岗位线（下面 6 道工序）：要企业名单 / 企业画像 / 校招岗位 / 实习 / 企业办的比赛
        occupation 职业图谱线（Mira 职业研究员 → Ken 标准规程官）：要某些职业的档案、薪资、发展图谱、在哪干用什么、典型任务、这一行的标准
        standard   行业标准线（Ken 标准规程官）：只要某个职业 / 工序 / 设备的国标、行标、法规、操作规程、设备操作手册
      企业与岗位线的 6 道工序：
        1. 建名单（Scout）：当用户没有点名企业、只给了一类企业的描述时，联网生成目标企业名单
        2. 企业画像（Alice）：quick = 一次联网检索补基础字段（快、便宜）；full = 完整画像流水线（定位官网、抓原文、工商 / 融资 / 近期动态与舆情 / 管理团队 / 行业 / 校招口碑六个主题检索，写入企业库与子实体；每家约 10 次调用、5 分钟）
        3. 赛事雷达（Leo）：找这些企业办的比赛（黑客松 / 开发者大赛 / 商业案例赛 / 数据竞赛 / 校园创新赛），按奖励导向：hardware 给设备 / cash 给钱 / internship 给实习 / offer 给 offer / credits 给算力
        4. 寻源（Jarvis）：找企业的校招 / 实习官方入口 URL
        5. 抓取与提炼（Kelly + Dr. Thorne）：抓取页面并提取结构化岗位，写入岗位库
        6. 质检（Nova）：盘点产出与数据质量
      企业与岗位线只采集：企业信息、校招项目、应届生岗位、实习（含远程）、企业赛事。默认不采社招。
      职业图谱线：职业档案与分年限薪资（profile）、发展图谱与各地薪资（career）、工作场所与工具设备（context）、典型任务与工位（tasks），可选再查这一行的标准（standards）。
      行业标准线：每一条检索 = 一个职业 + 一个聚焦点（工序 / 设备 / 场景），找国标 / 行标 / 团标 / 法规 / 设备厂商操作手册 / ISO、OSHA 等国际参考。

      用户的总任务：
      """${String(task).slice(0, 2000)}"""

      请把它拆解成排产参数，返回 JSON：
      {
        "title": "<12 字以内的任务标题>",
        "line": "company" | "occupation" | "standard",
        "occupations": ["职业名", ...],    // line=occupation 时填：用户点名的职业照写；用户只给了方向（如「新能源方向的 5 个职业」）就由你列出最有代表性的规范职业名（中文、不带公司和级别），最多 ${MAX_OCCUPATIONS} 个；其它线为 []
        "occ_parts": { "profile": true, "career": true|false, "context": true|false, "tasks": true|false, "standards": true|false },   // line=occupation 时：只开用户点到的部分——「图谱 / 发展路径 / 晋升」→ career，「工具 / 设备 / 场所 / 在哪干」→ context，「任务 / 一天干什么」→ tasks，「档案 / 薪资 / 简介」→ profile，「标准 / 规程 / 手册」→ standards；用户说「完整 / 全套 / 建档 / 全部」或完全没说要哪部分时，profile+career+context+tasks 全开、standards 关
        "std_items": [{ "profession": "职业名", "query": "聚焦的工序 / 设备 / 场景，可空" }],   // line=standard 时填，最多 ${MAX_STD_ITEMS} 条；line=occupation 且 occ_parts.standards=true 时可空（每个职业自动查一条）；其它为 []
        "mode": "named" | "list",          // named = 用户点名了具体企业；list = 用户只描述了一类企业，需要先建名单
        "companies": ["企业名", ...],       // mode=named 时填，保持用户的写法，最多 ${MAX_COMPANIES} 家；mode=list 时为 []
        "list_query": "<交给 Scout 的名单描述>",   // mode=list 时填，否则为 ""
        "list_count": <数字>,               // mode=list 时要几家，用户没说就填 5，最多 ${MAX_COMPANIES}
        "steps": { "profile": true|false, "competitions": true|false, "source": true|false, "extract": true|false },
        "profile_mode": "quick" | "full",   // 用户提到「完整画像 / 详细画像 / 融资 / 管理团队 / 舆情 / 口碑 / 子实体」时为 full，否则 quick
        "rewards": ["hardware" | "cash" | "internship" | "offer" | "credits", ...],   // competitions=true 时，用户在意的奖励类型；没说就填 ["hardware","cash","internship","offer"]
        "competition_query": "<交给 Leo 的附加主题，如「黑客松」「校园赛」；没有则为空串>",
        "urls_per_company": <1-3>,          // 每家企业送去抓取的页面数，默认 2；用户要求「全面 / 尽量多」时填 3，要求「快速 / 试一下」时填 1
        "hint": "<提取时要特别关注的方向，如「2027 届 技术类」「远程实习」；没有则为空串>",
        "scope": "campus" | "all",          // 只有用户明确要求社招时才填 all
        "briefing": "<厂长的排产说明，2-3 句中文：这次任务怎么排、先后顺序、大概会产出什么>"
      }
      规则：
      - 用户只想「建名单 / 补画像」而没提岗位时，把不需要的 steps 设为 false（例如只要名单和画像：source=false, extract=false）。
      - 用户提到采集岗位 / 校招 / 实习时，source 和 extract 都为 true；extract=true 时 source 必须为 true。
      - 用户提到比赛 / 赛事 / 黑客松 / 大赛 / 奖品 / 设备 / 电脑 / 奖金 时，competitions=true；用户只想找比赛而不提岗位时，source=false, extract=false，profile 也可为 false。
      - 不要编造用户没有点名的企业。
      - line 不是 company 时：mode 填 "named"，companies 填 []，steps 全部 false。
    `;

    const result = await generateContent(prompt, modelId, { jsonMode: true });
    await logTokenUsage({ tool_name: 'office-chief', task_name: 'Plan Master Task', institution: String(task).slice(0, 80), model_id: modelId, usageMetadata: result.usageMetadata, success: true })
      .catch(e => console.error('Token logging failed', e));

    const p = parseJsonLoose(result.text);
    const companies: string[] = Array.from(new Set((Array.isArray(p.companies) ? p.companies : []).map((c: unknown) => String(c).trim()).filter(Boolean))).slice(0, MAX_COMPANIES) as string[];
    const mode = p.mode === 'list' || companies.length === 0 ? 'list' : 'named';
    const extract = p.steps?.extract !== false;

    const line = p.line === 'occupation' || p.line === 'standard' ? p.line : 'company';
    const occupations: string[] = Array.from(new Set((Array.isArray(p.occupations) ? p.occupations : []).map((x: unknown) => String(x).trim()).filter(Boolean))).slice(0, MAX_OCCUPATIONS) as string[];
    const op = p.occ_parts || {};
    const stdItems = (Array.isArray(p.std_items) ? p.std_items : []).map((x: any) => ({ profession: String(x?.profession || '').trim(), query: String(x?.query || '').trim() })).filter((x: any) => x.profession || x.query).slice(0, MAX_STD_ITEMS);
    if (line !== 'company') {
      return NextResponse.json({
        plan: {
          title: String(p.title || '总任务').slice(0, 30), line, mode: 'named', companies: [], list_query: '', list_count: 0,
          steps: { profile: false, competitions: false, source: false, extract: false }, profile_mode: 'quick', rewards: [], competition_query: '', urls_per_company: 1, hint: '', scope: 'campus',
          occupations: line === 'occupation' ? occupations : [],
          occ_parts: { profile: op.profile !== false, career: op.career !== false, context: op.context !== false, tasks: op.tasks !== false, standards: op.standards === true },
          std_items: line === 'standard' ? stdItems : (op.standards === true ? occupations.map(o => ({ profession: o, query: '' })) : []),
          briefing: String(p.briefing || ''),
        },
      });
    }

    return NextResponse.json({
      plan: {
        title: String(p.title || '总任务').slice(0, 30), line: 'company', occupations: [], occ_parts: null, std_items: [],
        mode,
        companies: mode === 'named' ? companies : [],
        list_query: mode === 'list' ? String(p.list_query || task).slice(0, 300) : '',
        list_count: Math.min(MAX_COMPANIES, Math.max(1, parseInt(p.list_count) || 5)),
        steps: { profile: p.steps?.profile !== false, competitions: p.steps?.competitions === true, source: extract || p.steps?.source !== false, extract },
        profile_mode: p.profile_mode === 'full' ? 'full' : 'quick',
        rewards: (Array.isArray(p.rewards) ? p.rewards : []).filter((r: unknown) => ['hardware', 'cash', 'internship', 'offer', 'credits'].includes(String(r))),
        competition_query: String(p.competition_query || '').slice(0, 100),
        urls_per_company: Math.min(3, Math.max(1, parseInt(p.urls_per_company) || 2)),
        hint: String(p.hint || '').slice(0, 100),
        scope: p.scope === 'all' ? 'all' : 'campus',
        briefing: String(p.briefing || ''),
      },
    });
  } catch (e: any) {
    console.error('[Office/plan]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
