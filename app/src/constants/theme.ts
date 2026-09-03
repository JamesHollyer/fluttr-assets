/**
 * App-wide design tokens. Colors are defined for light and dark mode; every
 * component reads them through useTheme() so both schemes stay in sync.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1B241C',
    textSecondary: '#5E6A60',
    background: '#FFFFFF',
    backgroundElement: '#F2F5F0',
    backgroundSelected: '#E2E9E0',
    border: '#D6DED7',
    accent: '#2F5F4E',
    accentText: '#FFFFFF',
    highlight: '#D9A400',
    highlightSoft: '#FBF1CC',
    danger: '#A33A2E',
  },
  dark: {
    text: '#E6EBE3',
    textSecondary: '#A6B1A8',
    background: '#0F1512',
    backgroundElement: '#1A2320',
    backgroundSelected: '#24352E',
    border: '#2A3630',
    accent: '#8CC3AB',
    accentText: '#0F1512',
    highlight: '#E9BD2A',
    highlightSoft: '#3A3416',
    danger: '#E08A7E',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
/** Height reserved for the floating tab bar on web. */
export const WebTabBarInset = 72;
export const MaxContentWidth = 800;
