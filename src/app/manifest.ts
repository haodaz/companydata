import type { MetadataRoute } from 'next';

/** 添加到手机主屏后像 App 一样打开，直接进虚拟工厂下达任务 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '智能企业数据工厂',
    short_name: '数据工厂',
    description: '给 AI 员工下达任务：企业画像、校招项目与实习岗位的采集',
    start_url: '/office',
    display: 'standalone',
    background_color: '#f5f6fa',
    theme_color: '#6055f5',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
