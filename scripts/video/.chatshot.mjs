const TOK = 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImQzMGEzNjBiLTY5MjQtNGFjNS05YTI0LTc5YzhjODZhMTI5ZSIsImVtYWlsIjoiaGFvejIxNEBnbWFpbC5jb20iLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3OTI3NjM0OTksImV4cCI6MTc5NTM1NTQ5OX0.QjNVSPPab9Cf-gTIEn65eg4xiD1o0Nt_eVg6ZP-9Gp4'; const U = process.env.SHOT_URL, OUT = process.env.SHOT_OUT, WAIT = process.env.SHOT_EVAL || '';
export default [
  { cookie: { name: 'auth_token', value: TOK, url: 'http://localhost:3003' } },
  { go: U, wait: 5000 },
  { eval: `async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); for (let i = 0; i < 60; i++) { if (document.querySelector('.wc-thread, .wc-hero')) break; await sleep(500); } ${WAIT} const box = document.querySelector('.wc-thread'); if (box) box.scrollTop = box.scrollHeight; await sleep(2500); return 1; }` },
  { shot: OUT },
];
