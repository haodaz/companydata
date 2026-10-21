/** 百业大学介绍片第三版 · 补录「3D 工位」和「操作台」两段（加载拉丝那几秒不录），用 splice.py 换回去 */
import S from './college-intro.scenes.mjs';
const i3d = S.findIndex(x => x.note === 'room3d'), ich = S.findIndex(x => x.note === 'chat');
let a = i3d; while (a > 0 && S[a].pause !== true) a--;
let b = ich; while (b > 0 && S[b].pause !== true) b--;
export default S.slice(a, b);
