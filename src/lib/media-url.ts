/**
 * lab-media 桶（真活的附件、整屏截图、录屏，学院实验室上传的材料）文件对外的网址。
 * 默认就是 Supabase 给的地址；浏览器打不开 Supabase 的部署（国内测试站：阿里云 RDS 的公网地址外网不通），
 * 设 NEXT_PUBLIC_LAB_MEDIA_URL = 本站转发过去的桶前缀（如 https://<站点>/storage/v1/object/public/lab-media），重新打镜像即可，不用改代码。
 * 和 lab-art 桶的 NEXT_PUBLIC_LAB_ART_URL 一个路数。已经存进库的旧网址也能拿它换前缀（按 /storage/v1/object/public/lab-media/ 认）。
 */
export function labMediaUrl(url: string): string {
  const base = (process.env.NEXT_PUBLIC_LAB_MEDIA_URL || '').replace(/\/$/, '');
  if (!base || !url) return url;
  const m = url.match(/\/storage\/v1\/object\/public\/lab-media\/(.+)$/);
  return m ? `${base}/${m[1]}` : url;
}
