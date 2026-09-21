import { NextResponse } from 'next/server';
import { generateContent } from '@/lib/llm-client';
import { logTokenUsage } from '@/lib/token-logger';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { AGENT_MAP, FACTORY_AGENTS, type AgentId } from '@/lib/factory-agents';
import { JOB_FIELDS } from '@/lib/job-fields';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** 每位员工能执行的动作及其参数（大模型据此决定是「回答问题」还是「开工」） */
const ACTION_SPEC: Record<string, string> = {
  master_task: '{"type":"master_task","task":"<完整的总任务描述，交给流水线执行>"} — 用户要你安排采集 / 排产时使用',
  company_list: '{"type":"company_list","query":"<名单描述>","count":<5-30>} — 用户要一份企业名单时使用',
  profile: '{"type":"profile","company":"<企业名>"} — 用户要补全 / 查看某家企业的画像时使用',
  campus_urls: '{"type":"campus_urls","company":"<企业名>"} — 用户要找某家企业的校招 / 实习入口时使用',
  extract: '{"type":"extract","url":"<http(s) 链接>","company":"<企业名，可从上下文或域名推断，推断不出就留空>"} — 用户给了一个页面链接要抓取 / 提取岗位时使用',
  stats: '{"type":"stats"} — 用户要质检简报 / 数据质量 / 库里有多少数据时使用',
};

export async function POST(req: Request) {
  try {
    const { agentId, messages, model } = await req.json();
    const agent = AGENT_MAP[agentId as AgentId];
    if (!agent) return NextResponse.json({ error: 'Unknown agent' }, { status: 400 });
    const modelId = model || 'gemini-3.8-flash';

    const history = (Array.isArray(messages) ? messages : []).slice(-12)
      .map((m: any) => `${m.role === 'user' ? '用户' : agent.name}：${String(m.content || '').slice(0, 1500)}`).join('\n');

    const prompt = `
      ${agent.persona}
      你的工位：${agent.station}。你的职责：${agent.description}

      你所在的「智能企业数据工厂」以企业为个体，采集企业信息、校招项目、应届生岗位、实习（含远程），默认不采社招。目标企业：中国企业、中外合资、海外百强。
      同事：${FACTORY_AGENTS.filter(a => a.id !== agent.id).map(a => `${a.name}（${a.title}）`).join('、')}。
      ${agent.id === 'structurer' || agent.id === 'qa' ? `岗位字段：${JOB_FIELDS.map(f => f.label).join('、')}。核心字段（计入完整度）：${JOB_FIELDS.filter(f => f.core).map(f => f.label).join('、')}。` : ''}

      你能亲手执行的动作只有一种：
      ${ACTION_SPEC[agent.action]}

      对话记录：
      ${history}

      请回复最后一条用户消息。返回 JSON：
      {
        "reply": "<中文回复。要开工时，用一两句话说你马上去做什么；回答问题时直接回答，简洁具体，可用 Markdown 列表>",
        "action": <上面那种动作的 JSON 对象，或 null>
      }
      规则：
      - 只有当用户明确要你干活、且动作所需参数齐全时才给 action；缺参数就在 reply 里问清楚，action 为 null。
      - 用户的需求不归你管时，action 为 null，并告诉他该找哪位同事。
      - 不要编造数据、链接或岗位；你还没执行动作之前不知道结果，不要在 reply 里假装已经有结果。
    `;

    const result = await generateContent(prompt, modelId, { jsonMode: true });
    await logTokenUsage({ tool_name: 'office-chat', task_name: `Chat · ${agent.name}`, institution: '', model_id: modelId, usageMetadata: result.usageMetadata, success: true })
      .catch(e => console.error('Token logging failed', e));

    const parsed = parseJsonLoose(result.text);
    const action = parsed.action && typeof parsed.action === 'object' && parsed.action.type === agent.action ? parsed.action : null;
    return NextResponse.json({ reply: String(parsed.reply || '').trim() || '……', action });
  } catch (e: any) {
    console.error('[Office/chat]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
