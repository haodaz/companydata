/** 补录片一的 room 段（3D 手套箱间换成 v5 之后），splice.py 换进成片 */
import all from './lab-research-lxm.scenes.mjs';
const i = all.findIndex(s => s.note === 'room');
export default [all[i - 3], all[i - 2], all[i - 1], all[i], all[i + 1], all[i + 2], { note: 'room_end' }, { hold: 1 }];
