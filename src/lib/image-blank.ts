/**
 * 图片是不是占位图（科研产品破图，数据部门 10-22 #25）：内容几乎只有一个颜色（各通道标准差都很小）、基本全透明、解不开。
 * 仅服务端 / 脚本用（sharp）。
 */
import sharp from 'sharp';

export async function isBlankImage(buf: Buffer): Promise<boolean> {
  try {
    const st = await sharp(buf).stats();
    const flat = st.channels.slice(0, 3).every(c => c.stdev < 6);
    const alpha = st.channels[3];
    return flat || (!!alpha && alpha.mean < 8);
  } catch { return true; }
}
