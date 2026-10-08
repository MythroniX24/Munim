/**
 * Pure accounting calculations. No I/O, no React — unit-tested in isolation.
 */
import type { Expense, Order, OrderItem, Payment, Product } from '@/db/models'
import { productTotalCost } from '@/db/models'
import { round2 } from './money'

export interface DateRange {
  from: number
  to: number
}

export function inRange(ts: number | undefined, range: DateRange): boolean {
  if (ts == null) return false
  return ts >= range.from && ts <= range.to
}

export function filterInRange<T>(rows: T[], range: DateRange, getTs: (r: T) => number | undefined): T[] {
  return rows.filter((r) => inRange(getTs(r), range))
}

/** Total fees paid to Etsy (absolute value of all fee-type payments). */
export function totalFees(payments: Payment[]): number {
  const feeTypes = new Set([
    'transaction_fee',
    'processing_fee',
    'listing_fee',
    'offsite_ads',
    'etsy_ads',
  ])
  return round2(
    payments.reduce((s, p) => (feeTypes.has(p.entryType) ? s + Math.abs(p.amount) : s), 0),
  )
}

/** Fees grouped by entry type → {label-ish key: total (positive)}. */
export function feesByType(payments: Payment[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of payments) {
    if (p.amount < 0) {
      out[p.entryType] = round2((out[p.entryType] ?? 0) + Math.abs(p.amount))
    }
  }
  return out
}

export function grossSales(orders: Order[]): number {
  return round2(orders.reduce((s, o) => s + (o.itemTotal || 0), 0))
}

export function shippingCollected(orders: Order[]): number {
  return round2(orders.reduce((s, o) => s + (o.shippingCollected || 0), 0))
}

/** Actual money spent on shipping labels = payments of type shipping_label + expenses in shipping-labels. */
export function shippingCost(payments: Payment[], expenses: Expense[]): number {
  const fromPayments = payments
    .filter((p) => p.entryType === 'shipping_label')
    .reduce((s, p) => s + Math.abs(p.amount), 0)
  const fromExpenses = expenses
    .filter((e) => e.category === 'shipping-labels')
    .reduce((s, e) => s + e.amount, 0)
  return round2(fromPayments + fromExpenses)
}

export function totalExpenses(expenses: Expense[]): number {
  return round2(expenses.reduce((s, e) => s + e.amount, 0))
}

/**
 * Cost of goods sold for a set of order items, using product costing data.
 * Items whose product has no costing entry contribute 0 (and are counted in `unmatched`).
 */
export function totalCogs(items: OrderItem[], products: Product[]): { total: number; matched: number; unmatched: number } {
  const byId = new Map(products.map((p) => [p.id, p]))
  const bySku = new Map(products.filter((p) => p.sku).map((p) => [p.sku!, p]))
  const byName = new Map(products.map((p) => [p.name.trim().toLowerCase(), p]))

  const find = (item: OrderItem): Product | undefined => {
    if (item.sku && bySku.has(item.sku)) return bySku.get(item.sku)
    if (item.listingId && byId.has(item.listingId)) return byId.get(item.listingId)
    if (byId.has(item.id)) return byId.get(item.id)
    return byName.get(item.name.trim().toLowerCase())
  }

  let total = 0
  let matched = 0
  let unmatched = 0
  for (const item of items) {
    const product = find(item)
    if (product) {
      total += productTotalCost(product) * item.quantity
      matched += item.quantity
    } else {
      unmatched += item.quantity
    }
  }
  return { total: round2(total), matched, unmatched }
}

export interface SummaryStats {
  grossSales: number
  etsyFees: number
  shippingCollected: number
  shippingCost: number
  netRevenue: number
  expenses: number
  cogs: number
  netProfit: number
  orderCount: number
  averageOrderValue: number
}

/**
 * Dashboard summary.
 *
 * netRevenue = gross sales − Etsy fees
 * netProfit  = net revenue − shipping cost − expenses − COGS
 */
export function summarize(input: {
  orders: Order[]
  payments: Payment[]
  expenses: Expense[]
  items: OrderItem[]
  products: Product[]
}): SummaryStats {
  const gross = grossSales(input.orders)
  const fees = totalFees(input.payments)
  const shipCollected = shippingCollected(input.orders)
  const shipCost = shippingCost(input.payments, input.expenses)
  const exp = totalExpenses(input.expenses)
  const cogs = totalCogs(input.items, input.products).total
  const netRevenue = round2(gross - fees)
  const netProfit = round2(netRevenue - shipCost - exp - cogs)
  const orderCount = input.orders.length
  return {
    grossSales: gross,
    etsyFees: fees,
    shippingCollected: shipCollected,
    shippingCost: shipCost,
    netRevenue,
    expenses: exp,
    cogs,
    netProfit,
    orderCount,
    averageOrderValue: orderCount ? round2(gross / orderCount) : 0,
  }
}

export interface MonthlyPoint {
  /** `yyyy-MM` */
  key: string
  label: string
  revenue: number
  profit: number
}

/** Aggregate orders+payments+expenses into a month→{revenue, profit} series. */
export function monthlySeries(input: {
  orders: Order[]
  payments: Payment[]
  expenses: Expense[]
  items: OrderItem[]
  products: Product[]
}): MonthlyPoint[] {
  const byMonth = new Map<string, { orders: Order[]; payments: Payment[]; expenses: Expense[]; items: OrderItem[] }>()
  const monthOf = (ts: number) => new Date(ts).toISOString().slice(0, 7)

  for (const o of input.orders) push(o.date, 'orders', o)
  for (const p of input.payments) push(p.date, 'payments', p)
  for (const e of input.expenses) push(e.date, 'expenses', e)

  const orderIds = new Set(input.orders.map((o) => o.id))
  for (const item of input.items) {
    if (!orderIds.has(item.orderId)) continue
    const order = input.orders.find((o) => o.id === item.orderId)
    if (order) push(order.date, 'items', item)
  }

  function push(ts: number, kind: 'orders' | 'payments' | 'expenses' | 'items', row: unknown) {
    const key = monthOf(ts)
    let bucket = byMonth.get(key)
    if (!bucket) {
      bucket = { orders: [], payments: [], expenses: [], items: [] }
      byMonth.set(key, bucket)
    }
    ;(bucket[kind] as unknown[]).push(row)
  }

  const points: MonthlyPoint[] = []
  for (const [key, b] of [...byMonth.entries()].sort(([a], [c]) => a.localeCompare(c))) {
    const stats = summarize({
      orders: b.orders,
      payments: b.payments,
      expenses: b.expenses,
      items: b.items,
      products: input.products,
    })
    points.push({
      key,
      label: new Date(`${key}-02`).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
      revenue: stats.netRevenue,
      profit: stats.netProfit,
    })
  }
  return points
}

export interface ProductStat {
  name: string
  quantity: number
  revenue: number
  cost: number
  profit: number
}

/** Per-product aggregate: qty, revenue, cost (from costing), profit. */
export function productStats(items: OrderItem[], products: Product[]): ProductStat[] {
  const byId = new Map(products.map((p) => [p.id, p]))
  const bySku = new Map(products.filter((p) => p.sku).map((p) => [p.sku!, p]))
  const byName = new Map(products.map((p) => [p.name.trim().toLowerCase(), p]))

  const map = new Map<string, ProductStat>()
  for (const item of items) {
    const product =
      (item.sku ? bySku.get(item.sku) : undefined) ??
      byId.get(item.listingId ?? '') ??
      byName.get(item.name.trim().toLowerCase())

    const key = product?.name ?? item.name
    let stat = map.get(key)
    if (!stat) {
      stat = { name: key, quantity: 0, revenue: 0, cost: 0, profit: 0 }
      map.set(key, stat)
    }
    stat.quantity += item.quantity
    stat.revenue = round2(stat.revenue + item.lineTotal)
    if (product) stat.cost = round2(stat.cost + productTotalCost(product) * item.quantity)
  }
  for (const s of map.values()) s.profit = round2(s.revenue - s.cost)
  return [...map.values()].sort((a, b) => b.profit - a.profit)
}

export interface CountryStat {
  country: string
  orders: number
  revenue: number
}

/** Sales by ship country (falls back to buyer country, then "Unknown"). */
export function countryStats(orders: Order[]): CountryStat[] {
  const map = new Map<string, CountryStat>()
  for (const o of orders) {
    const key = o.shipCountry?.trim() || o.buyerCountry?.trim() || 'Unknown'
    let stat = map.get(key)
    if (!stat) {
      stat = { country: key, orders: 0, revenue: 0 }
      map.set(key, stat)
    }
    stat.orders += 1
    stat.revenue = round2(stat.revenue + (o.itemTotal || 0))
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue)
}

/**
 * Fees breakdown rows: negative payment entries grouped by entry type,
 * plus counts. Returns sorted by amount desc.
 */
export function feesBreakdown(payments: Payment[]): { type: string; count: number; total: number }[] {
  const map = new Map<string, { count: number; total: number }>()
  for (const p of payments) {
    if (p.amount >= 0) continue
    const e = map.get(p.entryType) ?? { count: 0, total: 0 }
    e.count += 1
    e.total = round2(e.total + Math.abs(p.amount))
    map.set(p.entryType, e)
  }
  return [...map.entries()]
    .map(([type, v]) => ({ type, count: v.count, total: v.total }))
    .sort((a, b) => b.total - a.total)
}

/** Profit & loss for a period: revenue → deductions → net. */
export function profitAndLoss(input: {
  orders: Order[]
  payments: Payment[]
  expenses: Expense[]
  items: OrderItem[]
  products: Product[]
}): {
  lines: { label: string; value: number; negative?: boolean }[]
  net: number
} {
  const s = summarize(input)
  const lines = [
    { label: 'Gross sales', value: s.grossSales },
    { label: 'Etsy fees', value: -s.etsyFees, negative: true },
    { label: 'Net revenue', value: s.netRevenue },
    { label: 'Shipping cost', value: -s.shippingCost, negative: true },
    { label: 'Cost of goods sold', value: -s.cogs, negative: true },
    { label: 'Expenses', value: -s.expenses, negative: true },
    { label: 'Net profit', value: s.netProfit },
  ]
  return { lines, net: s.netProfit }
}
