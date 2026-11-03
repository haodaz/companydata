/**
 * 《百业学院怎样培养一位科研 AI》（2026-11-03 第二支，约 2.5 分钟）：封面 → 通用模型替你补空白 → 陈老师来订 → 三层课 → 博士第一周 → 实验方法课一闪
 *   → 四道考题 → 论文自己对不上（复算）→ 三个学科 → 盲测校准 → 三个学员的脾气 → 人只做校正 → 导师校正页 → 实验室入口 → 私域课对比 → 片尾。
 *   ADMIN_TOKEN_FILE=… REVIEW_TOKEN_FILE=… LAB_TOKEN_FILE=… node scripts/video/drive.mjs out/v-college-research scripts/video/v-college-research.scenes.mjs --width=1600 --height=900 --dsf=2 --out=3200x1800
 */
import fs from 'node:fs';
import { run as labRun } from './lab-surgeon.scenes.mjs';
import { run, BASE, cover as cov } from './_rec-helpers.mjs';

const rd = k => fs.readFileSync(process.env[k], 'utf8').trim().split('\n').pop();
const TOKEN = rd('ADMIN_TOKEN_FILE'), REVIEW = rd('REVIEW_TOKEN_FILE'), LAB = rd('LAB_TOKEN_FILE');
const SPACE = 'd742fcf4-bea0-487e-bfb7-b3f7d0bf1a24';
const cover = (line, sub, size) => `${cov(line, sub, size)}&badge=0&brand=${encodeURIComponent('百业学院 · 一所 AI 学院')}`;
const chart = id => `${BASE}/video/chart-research.html?id=${id}`;
const card = (id, note, hold) => [{ pause: true }, { go: chart(id), wait: 1500 }, { resume: true }, { note }, { hold }];

export default [
  { cookie: { name: 'auth_token', value: TOKEN, url: BASE } },
  { pause: true }, { go: cover('百业学院//|怎样培养一位科研 AI', '从博士第一年，到你课题组的私域课', 92), wait: 2500 }, { resume: true }, { note: 'cover' }, { hold: 5 },
  ...card('gap', 'ch_gap', 12),
  // 陈老师来订
  { pause: true }, { go: `${BASE}/college/hire?for=research`, wait: 5000 },
  { eval: run(`const el = document.getElementById('apply'); window.scrollTo(0, L.top(el, 20)); return 1;`), timeout: 20 }, { resume: true }, { note: 'hire' }, { hold: 1.5 },
  // 只打字不提交
  { eval: run(`const ta = document.querySelector('#apply textarea'); await L.type(ta, '我们组做硫化物固态电池的界面，要一位会读 EIS 和 XPS 数据、能帮我初审稿件、拿不准时会直说的科研助手。', 70); return 1;`), timeout: 30 }, { hold: 2 },
  ...card('layers', 'ch_layers', 10),
  // 博士第一周
  { pause: true }, { go: `${BASE}/lab/${SPACE}?m=test`, wait: 6000 },
  { local: { 'lab:visitor': 'v:demo-college-research-video', 'lab:rookie': { name: '小周', note: '环境科学 · 博一', location: '南京' }, 'lab:rookie:asked': '1' }, wait: 8000 },
  { resume: true }, { note: 'core_day' }, { hold: 3 }, { scroll: 650, over: 3.5 }, { hold: 1 },
  { pause: true }, { go: `${BASE}/admin/db-method?id=1`, wait: 5000 }, { resume: true }, { note: 'methods' }, { hold: 5 },
  ...card('exams4', 'ch_exams', 13),
  ...card('catch', 'ch_catch', 14),
  ...card('fields', 'ch_fields', 8),
  ...card('brier', 'ch_brier', 10),
  ...card('traits', 'ch_traits', 12),
  ...card('human', 'ch_human', 9),
  // 导师校正页：滚到 D 复算（就是那道「论文自己对不上」的题）
  { pause: true }, { go: `${BASE}/college/review/${REVIEW}`, wait: 5000 }, { resume: true }, { note: 'review' }, { hold: 2.5 },
  { eval: run(`const h = [...document.querySelectorAll('h2')].find(x => x.textContent.includes('复算')); await L.glide(L.top(h, 30), 4000); return 1;`), timeout: 20 }, { hold: 4 },
  // 实验室入口
  { pause: true }, { go: `${BASE}/college/lab/${LAB}`, wait: 5000 }, { local: { 'college:lab-who': '张老师' }, wait: 5000 }, { resume: true }, { note: 'lab' }, { hold: 4 },
  { scroll: 1150, over: 4 }, { hold: 3 }, { scroll: 2600, over: 4 }, { hold: 3 },
  ...card('private', 'ch_private', 11),
  { pause: true }, { go: cover('先学会说「不知道」//|再学做研究', '百业学院 · 科研 AI', 88), wait: 2500 }, { resume: true }, { note: 'end' }, { hold: 5 },
];
