/** Centralized design tokens for the AI Test Automation Platform */

export const colors = {
  // ── Core backgrounds ───────────────────────────────────────────────────────
  bgDeepest:   '#06090f',
  bgBase:      '#0b1120',
  bgSurface:   '#111827',
  bgCard:      '#141c2b',
  bgCardHover: '#1a2438',
  bgElevated:  '#1e293b',

  // ── Borders ────────────────────────────────────────────────────────────────
  border:       '#1e293b',
  borderLight:  '#2d3a4f',
  borderAccent: '#6366f133',

  // ── Text ───────────────────────────────────────────────────────────────────
  textPrimary:   '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted:     '#64748b',

  // ── Accents ────────────────────────────────────────────────────────────────
  primary:     '#6366f1',   // indigo
  primaryLight:'#818cf8',
  violet:      '#8b5cf6',
  purple:      '#a855f7',
  cyan:        '#22d3ee',
  teal:        '#14b8a6',

  // ── Status ─────────────────────────────────────────────────────────────────
  success:     '#10b981',
  successLight:'#34d399',
  danger:      '#ef4444',
  dangerLight: '#f87171',
  warning:     '#f59e0b',
  warningLight:'#fbbf24',
  info:        '#3b82f6',
  infoLight:   '#60a5fa',
  running:     '#6366f1',
} as const;

export const gradients = {
  primary:  'linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7)',
  success:  'linear-gradient(135deg, #10b981, #34d399)',
  danger:   'linear-gradient(135deg, #ef4444, #f87171)',
  info:     'linear-gradient(135deg, #3b82f6, #60a5fa)',
  header:   'linear-gradient(135deg, #0b1120 0%, #111827 50%, #0f172a 100%)',
  surface:  'linear-gradient(180deg, #111827 0%, #0f172a 100%)',
  accentBar:'linear-gradient(90deg, #6366f1, #8b5cf6, #a855f7, #6366f1)',
} as const;

export const STATUS_COLORS: Record<string, string> = {
  passed:  colors.success,
  failed:  colors.danger,
  running: colors.running,
  queued:  colors.warning,
  error:   colors.dangerLight,
};

/** Ant Design v5 theme token overrides */
export const antThemeTokens = {
  colorPrimary: '#6366f1',
  colorBgContainer: colors.bgCard,
  colorBgElevated: colors.bgElevated,
  colorBgLayout: colors.bgDeepest,
  colorBorder: colors.border,
  colorBorderSecondary: colors.border,
  colorText: colors.textPrimary,
  colorTextSecondary: colors.textSecondary,
  colorTextTertiary: colors.textMuted,
  borderRadius: 8,
  colorSuccess: colors.success,
  colorError: colors.danger,
  colorWarning: colors.warning,
  colorInfo: colors.info,
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};

export const antComponentTokens = {
  Card: {
    colorBgContainer: colors.bgCard,
    colorBorderSecondary: colors.border,
  },
  Table: {
    colorBgContainer: colors.bgCard,
    headerBg: colors.bgSurface,
    rowHoverBg: colors.bgCardHover,
    borderColor: colors.border,
  },
  Tabs: {
    inkBarColor: colors.primary,
    itemActiveColor: colors.primaryLight,
    itemSelectedColor: colors.primaryLight,
    itemHoverColor: colors.textPrimary,
    itemColor: colors.textMuted,
  },
  Select: {
    colorBgContainer: colors.bgSurface,
    optionSelectedBg: '#6366f122',
  },
  Button: {
    primaryColor: '#fff',
  },
  Input: {
    colorBgContainer: colors.bgSurface,
  },
  Tag: {
    colorBorder: 'transparent',
  },
  Statistic: {
    contentFontSize: 32,
  },
};
