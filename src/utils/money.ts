/**
 * Money helpers. Amounts are plain numbers (2-decimal currency values).
 */

/** Round to 2 decimals — the single source of truth for float cleanup. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Parse a monetary string like `"$1,234.56"`, `"−$12"`, `"1234,56"` → number. */
export function parseAmount(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw !== 'string') return null
  let s = raw.trim()
  if (!s) return null
  // Strip currency symbols & codes, spaces (incl. NBSP), and thousands separators.
  s = s.replace(/[$€£¥₹₽¢¤₣]/g, '').replace(/ | | |\s/g, '')
  // Parenthesised negatives: (12.34) → -12.34
  let neg = false
  if (/^\(.*\)$/.test(s)) {
    neg = true
    s = s.slice(1, -1)
  }
  // Handle both "1,234.56" and "1.234,56"
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      s = s.replace(/,/g, '')
    }
  } else if (s.includes(',')) {
    // "1,234" (thousands) vs "12,34" (decimals)
    const parts = s.split(',')
    if (parts.length === 2 && parts[1].length === 2) {
      s = s.replace(',', '.')
    } else {
      s = s.replace(/,/g, '')
    }
  }
  s = s.replace(/[^0-9.\-]/g, '')
  const n = parseFloat(s)
  if (!Number.isFinite(n)) return null
  return neg ? -n : n
}

const formatterCache = new Map<string, Intl.NumberFormat>()

export function formatMoney(n: number, currency = 'USD', withSymbol = true): string {
  const key = `${currency}:${withSymbol}`
  let fmt = formatterCache.get(key)
  if (!fmt) {
    fmt = new Intl.NumberFormat(undefined, {
      style: withSymbol ? 'currency' : 'decimal',
      currency: withSymbol ? currency : undefined,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    formatterCache.set(key, fmt)
  }
  return fmt.format(n)
}

/** Convert `amount` from `from` currency to `to` using manual rates (base = 1 unit of baseCurrency = rates[code] ... see Settings.rates: code → units of base). */
export function convert(
  amount: number,
  from: string,
  to: string,
  rates: Record<string, number>,
  baseCurrency: string,
): number {
  if (from === to) return amount
  const rateOf = (code: string): number => {
    if (code === baseCurrency) return 1
    const r = rates[code]
    if (typeof r === 'number' && r > 0) return r
    return 0 // unknown rate → caller decides (we return raw and flag)
  }
  const fromRate = rateOf(from)
  const toRate = rateOf(to)
  if (fromRate === 0 || toRate === 0) return amount
  // rates: 1 unit of base = rates[code] units of `code`
  const base = (amount / fromRate) * toRate
  return round2(base)
}
