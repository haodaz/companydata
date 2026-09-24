import fs from 'node:fs';
for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { searchJson } = await import('../src/lib/agents/search-llm');
const prompt = `Use web search to find ONE real, currently published campus-recruiting job posting (校园招聘 / 2026届 or 2027届 / 应届生) in mainland China for a precision investment casting process engineer role — 精密铸造 / 熔模铸造 / 精铸 工艺工程师 (turbine blades, aero-engine castings, or similar). Candidate employers: 无锡透平叶片, 安徽应流, 鹰普精密 (Impro), 中航发 / 贵州安吉航空精密铸造, 江苏永瀚, 东方电气, 上海电气, 洛阳双瑞, or any similar company. Prefer the company's official careers site or an official campus-recruiting posting (牛客 / 应届生求职网 / 高校就业网 acceptable if it reproduces the official text).
Return ONLY JSON: { "company": "", "company_en": "", "title": "", "job_req_id": "", "program_name": "", "graduation_year": "", "location": "", "department": "", "responsibilities": "<岗位职责 verbatim, newline separated>", "qualifications": "<任职要求 verbatim, newline separated>", "url": "<the posting url>", "source_url": "<where you found it>", "confidence": "high|medium|low", "notes": "" }
Only real postings; do not invent text. If you cannot find one with verbatim text, return the best candidate with confidence "low" and explain in notes.`;
const { parsed } = await searchJson(prompt, 'gpt-5.6-luna', { tool_name: 'finder', task_name: 'Find JD · 精铸工艺工程师', institution: 'skill-lab seed' });
console.log(JSON.stringify(parsed, null, 2));
