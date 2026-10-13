/**
 * 百业工厂内测试聊：挑不同行业的百业空间，每个职人问几道学生常问的问题，走真实的「和我聊」流程
 * （平方知识库 → 答不上联网查 → 逐句核查），记进对话和职业问答日志（surface = studio，visitor = internal-trial，标明是内测）。
 *   npx tsx scripts/kg-trial-chats.mts [--spaces 16] [--per 5]
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { selectAll } = await import('../src/lib/supabase-all');
const { loadChatContext, chatReply, recordTurn, logQuestion } = await import('../src/lib/kg/persona-chat');
const argv = process.argv.slice(2);
const arg = (k: string, d: number) => (argv.includes(k) ? Number(argv[argv.indexOf(k) + 1]) : d);
const SPACES = arg('--spaces', 16), PER = arg('--per', 5);

const POOL = [
  '刚入行能拿多少？几年能涨上去？', '这一行一天都在忙什么？', '没有相关经验，怎么入行？要考什么证？', '新人最容易在哪一步出错？',
  '现在哪些公司在招？要什么条件？', '这行未来前景怎么样？会不会被 AI 取代？', '平时要用到哪些工具和设备？', '干好了能升到什么位置？',
  '在不同城市收入差别大吗？', '这行有什么必须遵守的操作规范或标准？',
];
const { data: spaces } = await selectAll(() => db.from('skill_tasks').select('id, title, jd_snapshot, profile').order('created_at'));
// 每个职业只挑一个空间，尽量覆盖不同行业
const seen = new Set<string>(); const pick: any[] = [];
for (const s of (spaces as any[]).sort(() => Math.random() - 0.5)) {
  const role = s.profile?.role || s.jd_snapshot?.title || s.title;
  if (seen.has(role)) continue; seen.add(role); pick.push(s);
  if (pick.length >= SPACES) break;
}
console.log(`内测 ${pick.length} 个空间，每个问 ${PER} 题`);
let ok = 0, gaps = 0, fail = 0;
const q = [...pick];
await Promise.all(Array.from({ length: 4 }, async () => {
  for (let s = q.shift(); s; s = q.shift()) {
    try {
      const c = await loadChatContext({ spaceId: s.id });
      const qs = [...POOL].sort(() => Math.random() - 0.5).slice(0, PER);
      let chatId: string | null = null; const history: any[] = [];
      for (const question of qs) {
        const r = await chatReply({ occ: c.occ, persona: c.persona, knowledge: c.knowledge, history, question });
        const base = { space_id: s.id, occupation_id: c.occ.id, surface: 'studio', visitor: 'internal-trial' };
        chatId = await recordTurn(chatId, base, { question, ...r });
        await logQuestion(chatId, base, { question, ...r });
        history.push({ role: 'user', content: question }, { role: 'assistant', content: r.reply });
        ok++; if (r.gap) gaps++;
      }
      console.log(`  ${c.occ.name}（${c.persona.name}）：${qs.length} 问`);
    } catch (e: any) { fail++; console.warn(`  ${s.title} 失败：${e.message}`); }
  }
}));
console.log(`完成 ${ok} 问，其中缺口 ${gaps}；失败空间 ${fail}`);
