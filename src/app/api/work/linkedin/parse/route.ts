import { NextRequest, NextResponse } from 'next/server';
import { generateContent } from '@/lib/llm-client';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { logTokenUsage } from '@/lib/token-logger';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * 本人 LinkedIn → 人才档案（2026-10-23 探索，/work/linkedin 用；不入库）。
 * 文字是 LinkedIn 账号主人在自己浏览器里用真活插件读的（插件只开 /in/me/，只能读本人），本人预览、勾选后才交过来。
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const sections = (Array.isArray(body.sections) ? body.sections : []).slice(0, 12).map((s: any) => ({ label: String(s?.label || '').slice(0, 20), text: String(s?.text || '').slice(0, 12000) })).filter((s: any) => s.text);
  if (!sections.length) return NextResponse.json({ ok: false, error: '没有内容' }, { status: 400 });
  const text = sections.map((s: any) => `## ${s.label}\n${s.text}`).join('\n\n').slice(0, 40000);
  const prompt = `下面是一位 LinkedIn 账号主人本人授权、在她 / 他自己登录的浏览器里交上来的主页文字（名片、简介、各详情版块）。整理成一份给招聘方看的人才档案。
规则：
- 用中文写；人名、机构名、产品名、学位名保留原文。只用原文里有的，不编；数字原样保留；看不出来的字段留空。
- skills：只列原文明确写出的技术、工具、方法（如「Next.js」「MCP」），不要从项目描述的比喻或修辞里提炼。
- verifiable：最多 5 条，挑最能说明这个人本事、又能拿去核实的具体说法；how 写怎么核实（看哪里 / 要什么材料 / 出什么题）。
- 同一件事在不同版块说法不一致的（比如简介里的学位名和教育经历里的不一样），一定列进 verifiable，claim 写清两处各怎么说。
- gaps：最多 5 条，只列对招聘决策有用、原文确实没有的信息（如联系方式、学历年份、当前是否在职、作品链接）。
- 平台给本人看的提示语（如「Open to Work」引导）忽略。
## 原文
${text}
## 输出 JSON
{"name":"","headline":"一句话定位（中文）","location":"","open_to":["想找的机会"],
"education":[{"school":"","degree":"","major":"","period":""}],
"experience":[{"org":"","title":"","period":"","location":"","highlights":["要点（中文，保留数字）"]}],
"projects":[{"name":"","what":"一句话（中文）","link":""}],
"skills":[""],"languages":[""],
"verifiable":[{"claim":"","how":""}],
"gaps":[""],
"summary":"三句话的中文概述：做过什么、最突出的本事、适合什么样的岗位",
"work_task_hint":"要验证这个人最核心的那项本事，可以出一道什么样的真活（一句话，中文）"}`;
  try {
    let p: any = null, used = '';
    for (const m of ['qwen-plus', 'deepseek-v4-pro']) {
      try {
        const r = await generateContent(prompt, m, { jsonMode: true, temperature: 0 });
        await logTokenUsage({ tool_name: 'work', task_name: 'LinkedIn · 整理档案', model_id: m, usageMetadata: r.usageMetadata } as any).catch(() => {});
        p = parseJsonLoose(r.text); if (p && typeof p === 'object') { used = m; break; }
      } catch (e) { console.warn(`[linkedin-parse] ${m} 失败：${String((e as any)?.message).slice(0, 100)}`); }
    }
    if (!p) throw new Error('整理失败，再试一次');
    return NextResponse.json({ ok: true, profile: p, model: used });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
