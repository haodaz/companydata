/**
 * 迁移 029 跑完后跑一次：把 persona_chats 里已有的问答搬进 kg_questions（职业问答日志）。可重复跑（按 chat_id + 问题去重）。
 *   npx tsx scripts/backfill-kg-questions.mts
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { selectAll } = await import('../src/lib/supabase-all');
const { data: chats } = await selectAll(() => db.from('persona_chats').select('*').order('created_at'));
const { data: have } = await selectAll(() => db.from('kg_questions').select('chat_id, question').order('id'));
const seen = new Set(have.map((h: any) => `${h.chat_id}|${h.question}`));
const rows: any[] = [];
for (const c of chats as any[]) {
  const ms: any[] = c.messages || [];
  ms.forEach((m, i) => {
    if (m.role !== 'user' || seen.has(`${c.id}|${m.content}`)) return;
    const a = ms[i + 1] || {};
    rows.push({ chat_id: c.id, occupation_id: c.occupation_id, space_id: c.space_id, surface: c.surface, visitor: c.visitor, question: m.content, reply: a.content || null,
      // 旧记录只存了编号；网上来源的标题 / 链接在 a.web 里，能对回来
      sources: (a.sources || []).map((id: string) => { const w = (a.web || [])[Number(id.slice(1)) - 1]; return id[0] === 'W' && w ? { id, type: 'web', title: w.title, url: w.url } : { id, type: 'data', title: id, url: null }; }),
      gap: m.gap || null, web: a.web || [], web_points: a.webPoints || null, created_at: m.at || c.created_at });
  });
}
for (let i = 0; i < rows.length; i += 200) { const { error } = await db.from('kg_questions').insert(rows.slice(i, i + 200)); if (error) throw error; }
console.log(`搬了 ${rows.length} 问（${chats.length} 段对话）`);
