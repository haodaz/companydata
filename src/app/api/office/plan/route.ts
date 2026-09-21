import { NextResponse } from 'next/server';
import { generateContent } from '@/lib/llm-client';
import { logTokenUsage } from '@/lib/token-logger';
import { parseJsonLoose } from '@/lib/agents/search-llm';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_COMPANIES = 8;

/** 厂长排产：把一句话总任务拆成流水线参数 */
export async function POST(req: Request) {
  try {
    const { task, model } = await req.json();
    if (!task || !String(task).trim()) return NextResponse.json({ error: '请输入总任务' }, { status: 400 });
    const modelId = model || 'gemini-3.8-flash';

    const prompt = `
      你是「智能企业数据工厂」的厂长 Max。工厂的流水线固定为 5 道工序：
        1. 建名单（Scout）：当用户没有点名企业、只给了一类企业的描述时，联网生成目标企业名单
        2. 企业画像（Alice）：补全企业信息与校招概况
        3. 寻源（Jarvis）：找企业的校招 / 实习官方入口 URL
        4. 抓取与提炼（Kelly + Dr. Thorne）：抓取页面并提取结构化岗位，写入岗位库
        5. 质检（Nova）：盘点产出与数据质量
      工厂只采集：企业信息、校招项目、应届生岗位、实习（含远程）。默认不采社招。

      用户的总任务：
      """${String(task).slice(0, 2000)}"""

      请把它拆解成排产参数，返回 JSON：
      {
        "title": "<12 字以内的任务标题>",
        "mode": "named" | "list",          // named = 用户点名了具体企业；list = 用户只描述了一类企业，需要先建名单
        "companies": ["企业名", ...],       // mode=named 时填，保持用户的写法，最多 ${MAX_COMPANIES} 家；mode=list 时为 []
        "list_query": "<交给 Scout 的名单描述>",   // mode=list 时填，否则为 ""
        "list_count": <数字>,               // mode=list 时要几家，用户没说就填 5，最多 ${MAX_COMPANIES}
        "steps": { "profile": true|false, "source": true|false, "extract": true|false },
        "urls_per_company": <1-3>,          // 每家企业送去抓取的页面数，默认 2；用户要求「全面 / 尽量多」时填 3，要求「快速 / 试一下」时填 1
        "hint": "<提取时要特别关注的方向，如「2027 届 技术类」「远程实习」；没有则为空串>",
        "scope": "campus" | "all",          // 只有用户明确要求社招时才填 all
        "briefing": "<厂长的排产说明，2-3 句中文：这次任务怎么排、先后顺序、大概会产出什么>"
      }
      规则：
      - 用户只想「建名单 / 补画像」而没提岗位时，把不需要的 steps 设为 false（例如只要名单和画像：source=false, extract=false）。
      - 用户提到采集岗位 / 校招 / 实习时，source 和 extract 都为 true；extract=true 时 source 必须为 true。
      - 不要编造用户没有点名的企业。
    `;

    const result = await generateContent(prompt, modelId, { jsonMode: true });
    await logTokenUsage({ tool_name: 'office-chief', task_name: 'Plan Master Task', institution: String(task).slice(0, 80), model_id: modelId, usageMetadata: result.usageMetadata, success: true })
      .catch(e => console.error('Token logging failed', e));

    const p = parseJsonLoose(result.text);
    const companies: string[] = Array.from(new Set((Array.isArray(p.companies) ? p.companies : []).map((c: unknown) => String(c).trim()).filter(Boolean))).slice(0, MAX_COMPANIES) as string[];
    const mode = p.mode === 'list' || companies.length === 0 ? 'list' : 'named';
    const extract = p.steps?.extract !== false;

    return NextResponse.json({
      plan: {
        title: String(p.title || '总任务').slice(0, 30),
        mode,
        companies: mode === 'named' ? companies : [],
        list_query: mode === 'list' ? String(p.list_query || task).slice(0, 300) : '',
        list_count: Math.min(MAX_COMPANIES, Math.max(1, parseInt(p.list_count) || 5)),
        steps: { profile: p.steps?.profile !== false, source: extract || p.steps?.source !== false, extract },
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
