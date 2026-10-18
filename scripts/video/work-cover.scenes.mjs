/** 只录封面（主片录完后用 prepend_cover 拼到前面） */
const BASE = process.env.LAB_BASE || 'http://localhost:3003';
export default [
  { go: `${BASE}/video/cover-work.html`, wait: 2500 },
  { note: 'cover' }, { hold: 4 },
];
