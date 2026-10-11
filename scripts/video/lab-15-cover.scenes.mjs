/** 只录封面（主片录完后单独录，用 prepend_cover 拼到前面） */
const BASE = process.env.LAB_BASE || 'http://localhost:3003';
export default [
  { go: `${BASE}/video/cover-15.html`, wait: 2500 },
  { note: 'cover' }, { hold: 4 },
];
