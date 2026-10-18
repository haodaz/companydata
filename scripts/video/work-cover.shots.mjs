const BASE = process.env.LAB_BASE || 'http://localhost:3003';
export default [{ go: `${BASE}/video/cover-work.html`, wait: 3500 }, { shot: 'out/work-cover/cover.png' }];
