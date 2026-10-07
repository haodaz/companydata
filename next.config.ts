import type { NextConfig } from "next";

// 数字职人的立绘和场景图存在 Supabase Storage 的 lab-art 桶里。
// 立绘原图平均 200KB、最大 650KB，页面上却只显示 50–100px——走 next/image 按需缩小。
// 只放这一个桶；环境变量缺了就退回已知的项目地址，免得线上图片全 400。
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jextsfzlbchbnsnxwgeu.supabase.co";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [new URL(`${SUPABASE.replace(/\/$/, "")}/storage/v1/object/public/lab-art/**`)],
  },
};

export default nextConfig;
