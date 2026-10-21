/** 百业大学介绍片第三版 · 补录开头三段（首屏 / 关于 / 化成万千数字职人）：首页文案改过之后重录，用 splice.py 换回去 */
import S from './college-intro.scenes.mjs';
const end = S.findIndex((x, i) => i > 0 && x.pause === true && S.slice(0, i).some(y => y.note === 'become'));
export default S.slice(0, end);
