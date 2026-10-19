import type { NextConfig } from "next";

// 数字职人的立绘和场景图存在 Supabase Storage 的 lab-art 桶里。
// 立绘原图平均 200KB、最大 650KB，页面上却只显示 50–100px——走 next/image 按需缩小。
// 只放这一个桶；环境变量缺了就退回已知的项目地址，免得线上图片全 400。
//
// 注意：这里是「构建期」读的（next.config 只在 build 时跑一次，NEXT_PUBLIC_* 还会被内联进产物），
// 所以换域名后必须重新构建镜像才生效，只改 Pod 的环境变量没用。
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ra-490c9omkad6ajcv-pb.rds.apsaradb.com";
// 公司部署：Supabase 地址是集群内地址或公网地址；桶的公开前缀另外给（见 lab-art.ts labArtPublicUrl）
const LAB_ART = (process.env.NEXT_PUBLIC_LAB_ART_URL || "").replace(/\/$/, "");

// lab-art 桶用过 / 正在用的域名。一起放行，搬迁过渡期图片不中断：
//   ra-490c9omkad6ajcv-pb.rds.apsaradb.com  当前（阿里云 RDS Supabase，2026-10-10 起）
//   jextsfzlbchbnsnxwgeu.supabase.co        历史（海外 Supabase 云项目；库里老网址仍指着它）
// 等库里素材网址全部改指阿里云后，历史那条可以删掉。
const BUCKET_HOSTS = [
  "https://ra-490c9omkad6ajcv-pb.rds.apsaradb.com",
  "https://jextsfzlbchbnsnxwgeu.supabase.co",
];

const patterns = new Set<string>(
  BUCKET_HOSTS.map((h) => `${h}/storage/v1/object/public/lab-art/**`)
);
patterns.add(`${SUPABASE.replace(/\/$/, "")}/storage/v1/object/public/lab-art/**`);
if (LAB_ART) patterns.add(`${LAB_ART}/**`);

const nextConfig: NextConfig = {
  // ffmpeg-static 是个带二进制路径的包，不能被打包进 server bundle（否则路径变成 bundle 里的假路径，真活开放模式录屏抽帧抽到 0 帧）
  serverExternalPackages: ['ffmpeg-static'],
  images: {
    remotePatterns: [...patterns].map((p) => new URL(p)),
  },
};

export default nextConfig;
