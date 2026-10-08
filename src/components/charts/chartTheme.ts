/**
 * Chart palette — the validated reference instance from the dataviz skill
 * (first three categorical slots, both modes selected, validated all-pairs).
 *
 * Slots are assigned to series in fixed order and never cycled:
 *   slot 1 blue  → revenue / primary magnitude
 *   slot 2 orange → profit
 *   slot 3 aqua   → spare third series (country/product accents if ever needed)
 */
export interface ChartPalette {
  series1: string
  series2: string
  series3: string
  grid: string
  axis: string
  axisText: string
  surface: string
  textSecondary: string
}

const LIGHT: ChartPalette = {
  series1: '#2a78d6',
  series2: '#eb6834',
  series3: '#1baf7a',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  axisText: '#898781',
  surface: '#ffffff',
  textSecondary: '#52514e',
}

const DARK: ChartPalette = {
  series1: '#3987e5',
  series2: '#d95926',
  series3: '#199e70',
  grid: '#2c2c2a',
  axis: '#383835',
  axisText: '#898781',
  surface: '#0f172a',
  textSecondary: '#c3c2b7',
}

export function chartPalette(isDark: boolean): ChartPalette {
  return isDark ? DARK : LIGHT
}

/** Compact axis/tooltip money format: 1.2K / 4.5M. */
export function compactMoney(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`
  return `${sign}${abs.toFixed(abs % 1 === 0 ? 0 : 2)}`
}
