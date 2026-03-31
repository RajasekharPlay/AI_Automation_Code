/**
 * Centralized design tokens for the AI Test Automation Platform
 * Values use CSS custom properties so they respond to dark/light theme toggle.
 * Accent / status colors stay static — they look good on both backgrounds.
 */

import type { ThemeMode } from './context/ThemeContext';

// ── Colors — CSS variable references ────────────────────────────────────────
export const colors = {
  // Core backgrounds (resolved via CSS vars in index.css)
  bgDeepest:   'var(--bg-deepest)',
  bgBase:      'var(--bg-base)',
  bgSurface:   'var(--bg-surface)',
  bgCard:      'var(--bg-card)',
  bgCardHover: 'var(--bg-card-hover)',
  bgElevated:  'var(--bg-elevated)',

  // Borders
  border:       'var(--border)',
  borderLight:  'var(--border-light)',
  borderAccent: '#6366f133',

  // Text
  textPrimary:   'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  textMuted:     'var(--text-muted)',

  // Accents — static, work on both light & dark
  primary:     '#6366f1',
  primaryLight:'#818cf8',
  violet:      '#8b5cf6',
  purple:      '#a855f7',
  cyan:        '#22d3ee',
  teal:        '#14b8a6',

  // Status — static
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

// ── Gradients ───────────────────────────────────────────────────────────────
export const gradients = {
  primary:  'linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7)',
  success:  'linear-gradient(135deg, #10b981, #34d399)',
  danger:   'linear-gradient(135deg, #ef4444, #f87171)',
  info:     'linear-gradient(135deg, #3b82f6, #60a5fa)',
  header:   'var(--header-gradient)',
  surface:  'var(--surface-gradient)',
  accentBar:'linear-gradient(90deg, #6366f1, #8b5cf6, #a855f7, #6366f1)',
} as const;

// ── Status colors (unchanged) ───────────────────────────────────────────────
export const STATUS_COLORS: Record<string, string> = {
  passed:  colors.success,
  failed:  colors.danger,
  running: colors.running,
  queued:  colors.warning,
  error:   colors.dangerLight,
};

// ── Ant Design v5 theme tokens — mode-aware ────────────────────────────────
export function getAntThemeTokens(mode: ThemeMode) {
  const isDark = mode === 'dark';
  return {
    colorPrimary: '#6366f1',
    colorBgContainer: isDark ? '#141c2b' : '#ffffff',
    colorBgElevated:  isDark ? '#1e293b' : '#f8fafc',
    colorBgLayout:    isDark ? '#06090f' : '#f0f2f5',
    colorBorder:          isDark ? '#1e293b' : '#e2e8f0',
    colorBorderSecondary: isDark ? '#1e293b' : '#e2e8f0',
    colorText:          isDark ? '#f1f5f9' : '#0f172a',
    colorTextSecondary: isDark ? '#94a3b8' : '#475569',
    colorTextTertiary:  isDark ? '#64748b' : '#94a3b8',
    borderRadius: 8,
    colorSuccess: colors.success,
    colorError: colors.danger,
    colorWarning: colors.warning,
    colorInfo: colors.info,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  };
}

export function getAntComponentTokens(mode: ThemeMode) {
  const isDark = mode === 'dark';
  return {
    Card: {
      colorBgContainer: isDark ? '#141c2b' : '#ffffff',
      colorBorderSecondary: isDark ? '#1e293b' : '#e2e8f0',
    },
    Table: {
      colorBgContainer: isDark ? '#141c2b' : '#ffffff',
      headerBg:    isDark ? '#111827' : '#f8fafc',
      rowHoverBg:  isDark ? '#1a2438' : '#f1f5f9',
      borderColor: isDark ? '#1e293b' : '#e2e8f0',
    },
    Tabs: {
      inkBarColor: 'transparent',
      itemActiveColor:   isDark ? '#f1f5f9' : '#0f172a',
      itemSelectedColor: isDark ? '#f1f5f9' : '#0f172a',
      itemHoverColor:    isDark ? '#f1f5f9' : '#0f172a',
      itemColor:         isDark ? '#64748b' : '#94a3b8',
    },
    Select: {
      colorBgContainer: isDark ? '#111827' : '#ffffff',
      optionSelectedBg: '#6366f122',
    },
    Button: {
      primaryColor: '#fff',
    },
    Input: {
      colorBgContainer: isDark ? '#111827' : '#ffffff',
    },
    Tag: {
      colorBorder: 'transparent',
    },
    Statistic: {
      contentFontSize: 32,
    },
  };
}

// ── Legacy exports (kept for backward compat, not used by new code) ─────────
export const antThemeTokens = getAntThemeTokens('dark');
export const antComponentTokens = getAntComponentTokens('dark');
