import {
  endOfDay,
  endOfMonth,
  endOfYear,
  format,
  startOfDay,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths,
} from 'date-fns'
import type { DateRange } from './calc'

export type RangePreset = 'this-month' | 'last-month' | 'last-30-days' | 'this-year' | 'custom'

export const RANGE_PRESETS: { id: RangePreset; label: string }[] = [
  { id: 'this-month', label: 'This month' },
  { id: 'last-month', label: 'Last month' },
  { id: 'last-30-days', label: 'Last 30 days' },
  { id: 'this-year', label: 'This year' },
  { id: 'custom', label: 'Custom' },
]

export function resolveRange(preset: RangePreset, custom?: { from: Date; to: Date }): DateRange {
  const now = new Date()
  switch (preset) {
    case 'this-month':
      return { from: startOfMonth(now).getTime(), to: endOfMonth(now).getTime() }
    case 'last-month': {
      const prev = subMonths(now, 1)
      return { from: startOfMonth(prev).getTime(), to: endOfMonth(prev).getTime() }
    }
    case 'last-30-days':
      return { from: startOfDay(subDays(now, 29)).getTime(), to: endOfDay(now).getTime() }
    case 'this-year':
      return { from: startOfYear(now).getTime(), to: endOfYear(now).getTime() }
    case 'custom':
      if (custom) return { from: startOfDay(custom.from).getTime(), to: endOfDay(custom.to).getTime() }
      return { from: startOfMonth(now).getTime(), to: endOfMonth(now).getTime() }
  }
}

export function formatRange(range: DateRange): string {
  return `${format(new Date(range.from), 'MMM d, yyyy')} – ${format(new Date(range.to), 'MMM d, yyyy')}`
}

/** Epoch ms → `yyyy-MM-dd` value for `<input type="date">`. */
export function toDateInput(ts: number): string {
  return format(new Date(ts), 'yyyy-MM-dd')
}

/** `yyyy-MM-dd` (or Date) → epoch ms at end of that day. */
export function fromDateInput(value: string): number {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime()
}

export function fromDateInputStart(value: string): number {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime()
}

/**
 * Parse the date formats Etsy uses in exports:
 * ISO (`2024-03-15 12:30:00 UTC`), US (`Mar 15, 2024`), slash formats.
 */
export function parseEtsyDate(raw: string | undefined | null): number | null {
  if (!raw) return null
  const s = raw.trim()
  if (!s) return null
  // "Mar 15, 2024" / "March 15, 2024" first — parse as UTC so results don't
  // shift with the device timezone (date-only exports carry no time component).
  const us = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/)
  if (us) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    const mi = months.indexOf(us[1].slice(0, 3).toLowerCase())
    if (mi !== -1) return Date.UTC(Number(us[3]), mi, Number(us[2]))
  }
  // Try ISO-ish next
  const iso = Date.parse(s.replace(' UTC', 'Z').replace(' ', 'T').replace(/Z$/, 'Z'))
  if (!Number.isNaN(iso)) return iso
  const parsed = Date.parse(s)
  if (!Number.isNaN(parsed)) return parsed
  return null
}
