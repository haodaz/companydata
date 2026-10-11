import type { NextConfig } from "next";

// 数字职人的立绘和场景图存在 Supabase Storage 的 lab-art 桶里。
// 立绘原图平均 200KB、最大 650KB，页面上却只显示 50–100px——走 next/image 按需缩小。
// 只放这一个桶；环境变量缺了就退回已知的项目地址，免得线上图片全 400。
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jextsfzlbchbnsnxwgeu.supabase.co";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [new URL(`${SUPABASE.replace(/\/$/, "")}/storage/v1/object/public/lab-art/**`)],
  },
  // 爱百业的独立域名 aisimjob.com：根路径直接显示 /lab（地址栏保持 aisimjob.com），里面的链接本来就是 /lab/…，照常能用
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", has: [{ type: "host", value: "(www\\.)?aisimjob\\.com" }], destination: "/lab" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
