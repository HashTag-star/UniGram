/**
 * UniGram design tokens — one place for spacing, radii, type and elevation so
 * screens stop inventing their own numbers.
 */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, huge: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, pill: 999 } as const;

export const type = {
  display: { fontSize: 32, fontWeight: '800' as const, letterSpacing: -0.9 },
  title: { fontSize: 24, fontWeight: '800' as const, letterSpacing: -0.6 },
  heading: { fontSize: 18, fontWeight: '700' as const, letterSpacing: -0.3 },
  body: { fontSize: 15, fontWeight: '400' as const, letterSpacing: -0.1 },
  bodyStrong: { fontSize: 15, fontWeight: '600' as const, letterSpacing: -0.1 },
  caption: { fontSize: 13, fontWeight: '500' as const },
  micro: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.3 },
};

/** Brand gradient — also used by the paywall. */
export const brand = {
  gradient: ['#6366f1', '#8b5cf6', '#d946ef'] as const,
  gradientSoft: ['#818cf8', '#6366f1', '#4338ca'] as const,
  indigo: '#6366f1',
  violet: '#8b5cf6',
  magenta: '#d946ef',
  /** Instagram-style story ring. */
  story: ['#feda75', '#fa7e1e', '#d62976', '#962fbf', '#4f5bd5'] as const,
};

export const status = {
  success: '#22c55e',
  danger: '#ff3040',
  warning: '#f59e0b',
  info: '#3b82f6',
};

/** Auth surfaces are always dark, regardless of the app theme. */
export const authPalette = {
  bg: '#06060b',
  field: 'rgba(255,255,255,0.055)',
  fieldBorder: 'rgba(255,255,255,0.09)',
  fieldFocus: 'rgba(139,92,246,0.85)',
  fieldFocusBg: 'rgba(139,92,246,0.09)',
  text: '#ffffff',
  textSub: 'rgba(255,255,255,0.62)',
  textMuted: 'rgba(255,255,255,0.38)',
  placeholder: 'rgba(255,255,255,0.34)',
  link: '#a78bfa',
};

export const shadow = {
  soft: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 4 },
  lift: { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 22, elevation: 12 },
  glow: (color: string) => ({
    shadowColor: color, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.55, shadowRadius: 20, elevation: 14,
  }),
};
