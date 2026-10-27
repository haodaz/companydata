/**
 * Forage 公开模拟页 → 外层信息（谁家、什么方向、扮演谁干什么、练什么技能、评价、任务结构）。只解析本地 HTML，不联网。
 * 不取任务正文 / 资料（用户 10-26：不需要具体题目）。
 */
import fs from 'node:fs';

export function flightOf(html: string): string {
  const parts: string[] = [];
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) { try { parts.push(JSON.parse(m[1])); } catch { /* 跳过坏块 */ } }
  return parts.join('');
}

/** 从 start（指向 '{' 或 '['）按括号配对截出完整 JSON */
function balanced(s: string, start: number): string | null {
  const open = s[start], close = open === '{' ? '}' : ']';
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return s.slice(start, i + 1);
  }
  return null;
}

/** RSC 里长文本是引用（"$5d"），正文在「5d:T长度,」那一行：取到下一行开头为止 */
function deref(f: string, v: any): string {
  if (typeof v !== 'string') return '';
  const m = v.match(/^\$([0-9a-f]+)$/); if (!m) return v;
  const at = f.search(new RegExp(`(^|\\n)${m[1]}:T[0-9a-f]+,`));
  if (at < 0) return '';
  const start = f.indexOf(',', at) + 1;
  const next = f.slice(start).search(/\n[0-9a-f]+:/);
  return next < 0 ? f.slice(start) : f.slice(start, start + next);
}

const strip = (h: string) => (h || '').replace(/<li>/g, '\n- ').replace(/<\/p>\s*<p>/g, '\n\n').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\n{2,}/g, '\n').trim();

export function parsePage(html: string, url: string) {
  const f = flightOf(html);
  const pi = f.indexOf('"program":{');
  const program = pi >= 0 ? JSON.parse(balanced(f, pi + 10)!) : null;
  // 任务模块：带 virtualInternshipStepIds 的对象（往前找到它所在对象的开头）
  const modules: any[] = [];
  const seen = new Set<string>();
  let k = 0;
  while ((k = f.indexOf('"virtualInternshipStepIds":[', k + 1)) > 0) {
    for (let j = k; j > Math.max(0, k - 20000); j--) {
      if (f[j] === '{' && f.slice(j, j + 8) === '{"_id":"') {
        const b = balanced(f, j); if (!b || b.length < k - j) continue;
        try { const o = JSON.parse(b); if (o.virtualInternshipStepIds && !seen.has(o._id)) { seen.add(o._id); modules.push(o); } } catch { /* 继续往前找 */ }
        break;
      }
    }
  }
  modules.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  // 介绍与场景里的「你的角色 / 你的目标」
  const role = f.match(/"studentRole":"((?:[^"\\]|\\.)*)"/), goal = f.match(/"studentGoal":"((?:[^"\\]|\\.)*)"/);
  // 评分和评价（服务端渲染的 HTML 里）
  const rating = html.match(/Reviews<\/h2>[\s\S]{0,600}?>(\d\.\d)</)?.[1] || html.match(/>(\d\.\d)<\/(?:span|p|div)>[\s\S]{0,400}?<article/)?.[1] || null;
  const reviews: { text: string; school: string }[] = [];
  const ar = /<article[^>]*>([\s\S]*?)<\/article>/g; let a: RegExpExecArray | null;
  while ((a = ar.exec(html))) {
    const body = a[1];
    const school = body.match(/<span class="font-semibold">[^<]*<\/span>,\s*([^<]+)<\/span>/)?.[1]?.trim() || '';
    const text = strip(body.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<span class="w-full mt-4[\s\S]*$/, ''));
    if (text.length > 20) reviews.push({ text, school });
  }
  // 老版模拟没有「你的角色 / 目标」卡片：取落地页的欢迎介绍段（「Welcome to the … Job Simulation」到「Available Achievements」之间）
  // 概览：落地页的欢迎介绍（program.copy.lead，长文本引用）；老版没有「你的角色 / 目标」卡片时就靠它
  const overview = strip(deref(f, program?.copy?.lead)).replace(/[ \t]+/g, ' ').trim() || null;
  const skills = [...new Set(modules.flatMap(m => (m.skills || []).map((s: any) => s.skillText)).filter(Boolean))];
  const achievements = [...html.matchAll(/Available Achievements[\s\S]{0,2000}/g)].length ? ['Certificate', 'CV Snippet', 'Interview Tips', 'Skills'].filter(x => html.includes(`>${x}<`)) : [];
  return {
    source: 'forage', external_id: program?._id || url, url,
    company_name: program?.company || null, company_slug: program?.publicCompanyId || null,
    title: program?.title || '', tagline: program?.copyLine || program?.tagline || null,
    career_areas: program?.careers || [], target_majors: program?.targetMajors || [],
    role_summary: role ? strip(JSON.parse(`"${role[1]}"`)) : null,
    goal_summary: goal ? strip(JSON.parse(`"${goal[1]}"`)) : null,
    skills, difficulty: program?.difficulty || null, time_guidance: program?.timeGuidance || program?.calculatedTimeGuidance || null,
    rating: rating ? parseFloat(rating) : null, review_samples: reviews,
    task_structure: modules.map(m => ({ position: m.position, title: m.title, tagline: m.tagline || null, type: m.type || null, time: m.timeGuidance || null, difficulty: m.difficulty && m.difficulty !== "$undefined" ? m.difficulty : null, skills: (m.skills || []).map((s: any) => s.skillText), steps: (m.virtualInternshipStepIds || []).length,
      // 任务介绍（落地页任务页签里公开的那部分）：会学到什么、要做什么；步骤只留标题和类型，不留正文
      learn: strip(deref(f, m.whatYouWillLearn)) || null, do: strip(deref(f, m.whatYouWillDo)) || null,
      step_titles: [...(m.virtualInternshipSteps || [])].sort((x: any, y: any) => (m.virtualInternshipStepIds || []).indexOf(x._id) - (m.virtualInternshipStepIds || []).indexOf(y._id)).map((st: any) => ({ title: (st.title || '').trim(), type: st.type })).filter((st: any) => st.title) })),
    achievements, company_type: program?.companyType || null,
    launch_date: (program?.launchDate || '').replace(/^\$D/, '') || null,
    meta: { overview, program_type: program?.programType || null, category: program?.programCategory || null, location: program?.location || null, logo: program?.colorLogo || program?.images?.colorLogo || null, image: program?.gridImage || null, is_live: program?.isLive ?? null },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const p of process.argv.slice(2)) {
    const [file, url] = p.split('|');
    console.log(JSON.stringify(parsePage(fs.readFileSync(file, 'utf8'), url || file), null, 1));
  }
}
