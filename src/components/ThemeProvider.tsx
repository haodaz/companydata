'use client';

import React from 'react';
import { ConfigProvider, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { antdTheme } from '@/lib/theme';

/** 全站 antd 主题（品牌紫 / 中文 locale） */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider theme={antdTheme} locale={zhCN}>
      <AntdApp style={{ display: 'contents' }}>{children}</AntdApp>
    </ConfigProvider>
  );
}
