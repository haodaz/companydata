/**
 * /invest 的省级地图：阿里云 DataV.GeoAtlas 的全国边界（含南海断续线）→ 简化投影成 SVG 路径 src/data/china-map.json。
 *   curl -o <目录>/100000_full.json https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json
 *   node scripts/invest/build-china-map.mjs <目录>/100000_full.json
 */
import fs from 'node:fs';
const geo = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const LON0 = 73.4, LAT_TOP = 53.7, K = 1000 / (135.2 - LON0), my = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * 180 / Math.PI;
const P = ([lon, lat]) => [(lon - LON0) * K, (my(LAT_TOP) - my(lat)) * K];
const r1 = v => Math.round(v * 10) / 10;
function dp(pts, tol) {   // Douglas-Peucker，首尾保留
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  // 闭合的环首尾是同一点，从中间劈成两段再简化
  const mid = Math.floor(pts.length / 2); keep[mid] = 1;
  const st = [[0, mid], [mid, pts.length - 1]];
  while (st.length) { const [a, b] = st.pop(); let m = -1, md = tol; const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / L; if (d > md) { md = d; m = i; } }
    if (m > 0) { keep[m] = 1; st.push([a, m], [m, b]); } }
  return pts.filter((_, i) => keep[i]);
}
const area = r => Math.abs(r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
const ringD = r => 'M' + r.map(p => `${r1(p[0])} ${r1(p[1])}`).join('L') + 'Z';
const short = s => s.replace(/(省|市|壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区)$/, '');
const out = [];
let jd = '';
for (const f of geo.features) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const isJd = !f.properties.name, n = short(f.properties.name || ''), small = ['香港', '澳门', '上海', '天津', '北京', '海南', '台湾'].includes(n);
  let d = '';
  for (const poly of polys) for (const ring of poly) {
    const south = ring[0][1] < 18;   // 南海诸岛：不简化、不丢
    const pr = ring.map(P), s = isJd || south ? pr : dp(pr, small ? .25 : .6);
    if (!isJd && !south && !small && area(s) < 1.2) continue;
    if (s.length >= 3) d += ringD(s);
  }
  if (isJd) { jd = d; continue; }
  const c = P(f.properties.centroid || f.properties.center);
  out.push({ n, d, c: [r1(c[0]), r1(c[1])] });
}
const [, H] = P([100, 17.6]), [ix, iy0] = P([106.2, 24.6]), [ix2, iy1] = P([122.8, 3]);
fs.writeFileSync('src/data/china-map.json', JSON.stringify({ w: 1000, h: Math.ceil(H), inset: `${r1(ix)} ${r1(iy0)} ${r1(ix2 - ix)} ${r1(iy1 - iy0)}`, jd, provinces: out }));
console.log(out.length, 'provinces', fs.statSync('src/data/china-map.json').size, 'bytes', 'h', Math.ceil(H));
