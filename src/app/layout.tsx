import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { ThemeProvider } from '@/components/ThemeProvider';
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "智能企业数据工厂",
  description: "以企业为个体的 AI 数据工厂：企业画像、校招项目与实习岗位的采集、结构化与审核",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <AntdRegistry>
          <ThemeProvider>{children}</ThemeProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
