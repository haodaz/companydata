/**
 * 智能企业数据工厂 后台设计令牌（与院校版「全球有数」共用同一套设计语言） + antd 主题
 *
 * 所有页面共享同一套品牌色 / 圆角 / 字体。
 * 页面里写内联样式时，优先从 BRAND 取值，避免再出现第二种紫色。
 */
import type { ThemeConfig } from 'antd';

export const BRAND = {
  primary: '#6055f5',
  primaryHover: '#7a70f7',
  primaryActive: '#4c41d9',
  primarySoft: 'rgba(96,85,245,0.08)',
  primaryBorder: 'rgba(96,85,245,0.20)',
  gradient: 'linear-gradient(135deg, #6055f5 0%, #8b5cf6 100%)',

  pageBg: '#f5f6fa',
  surface: '#ffffff',
  border: '#e8eaf2',
  borderSoft: '#f0f1f7',

  ink: '#1f2233',
  ink2: '#4b5064',
  ink3: '#8a8fa3',
  ink4: '#b4b8c7',

  success: '#16a34a',
  warning: '#d97706',
  danger: '#dc2626',
  info: '#0ea5e9',

  radius: 10,
  radiusLg: 14,
  shadow: '0 1px 2px rgba(20,22,40,0.04), 0 1px 3px rgba(20,22,40,0.03)',
  shadowHover: '0 6px 20px rgba(96,85,245,0.10)',
} as const;

export const FONT_FAMILY =
  "'PingFang SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif";

export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: BRAND.primary,
    colorInfo: BRAND.primary,
    colorSuccess: BRAND.success,
    colorWarning: BRAND.warning,
    colorError: BRAND.danger,
    colorLink: BRAND.primary,
    colorText: BRAND.ink,
    colorTextSecondary: BRAND.ink2,
    colorTextTertiary: BRAND.ink3,
    colorBorder: '#dfe2ec',
    colorBorderSecondary: BRAND.borderSoft,
    colorBgLayout: BRAND.pageBg,
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    borderRadius: 8,
    borderRadiusLG: BRAND.radiusLg,
    borderRadiusSM: 6,
    controlHeight: 34,
    boxShadowTertiary: BRAND.shadow,
    motionDurationMid: '0.18s',
  },
  components: {
    Card: {
      headerFontSize: 15,
      headerHeight: 52,
      paddingLG: 20,
    },
    Table: {
      headerBg: '#f8f9fc',
      headerColor: BRAND.ink2,
      headerSplitColor: 'transparent',
      rowHoverBg: '#f7f6ff',
      rowSelectedBg: '#f1efff',
      rowSelectedHoverBg: '#ebe8ff',
      borderColor: BRAND.borderSoft,
      cellPaddingBlockSM: 10,
    },
    Button: {
      fontWeight: 500,
      primaryShadow: '0 2px 6px rgba(96,85,245,0.25)',
      defaultShadow: 'none',
    },
    Tag: {
      defaultBg: '#f5f6fa',
    },
    Tabs: {
      itemSelectedColor: BRAND.primary,
      inkBarColor: BRAND.primary,
    },
    Drawer: {
      paddingLG: 24,
    },
    Descriptions: {
      labelBg: '#f8f9fc',
    },
    Progress: {
      defaultColor: BRAND.primary,
    },
  },
};
