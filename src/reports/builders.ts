import type {
  Expense,
  Order,
  OrderItem,
  Payment,
  Product,
  ReportDefinition,
  ReportKind,
} from '@/db/models'
import type { DateRange } from '@/utils/calc'
import {
  countryStats,
  feesBreakdown,
  productStats,
  monthlySeries,
  profitAndLoss,
  summarize,
} from '@/utils/calc'
import { formatMoney } from '@/utils/money'
import { formatRange } from '@/utils/dates'

export interface ReportInput {
  orders: Order[]
  items: OrderItem[]
  payments: Payment[]
  expenses: Expense[]
  products: Product[]
  range: DateRange
  currency: string
}

const pct = (part: number, whole: number): string =>
  whole ? `${((part / whole) * 100).toFixed(1)}%` : '0%'

/** Build any of the six report types as a pure data definition. */
export function buildReport(kind: ReportKind, input: ReportInput): ReportDefinition {
  switch (kind) {
    case 'sales-summary':
      return salesSummary(input)
    case 'product-wise':
      return productWise(input)
    case 'monthly':
      return monthlyReport(input)
    case 'country-wise':
      return countryWise(input)
    case 'fees-breakdown':
      return feesReport(input)
    case 'profit-loss':
      return pnlReport(input)
  }
}

function salesSummary({ orders, payments, expenses, items, products, range, currency }: ReportInput): ReportDefinition {
  const s = summarize({ orders, payments, expenses, items, products })
  const m = (n: number) => formatMoney(n, currency)
  return {
    kind: 'sales-summary',
    title: 'Sales Summary',
    from: range.from,
    to: range.to,
    columns: [
      { key: 'metric', label: 'Metric' },
      { key: 'value', label: 'Value', align: 'right' },
    ],
    rows: [
      { metric: 'Orders', value: String(s.orderCount) },
      { metric: 'Gross sales', value: m(s.grossSales) },
      { metric: 'Etsy fees', value: m(s.etsyFees) },
      { metric: 'Shipping collected', value: m(s.shippingCollected) },
      { metric: 'Shipping cost', value: m(s.shippingCost) },
      { metric: 'Net revenue', value: m(s.netRevenue) },
      { metric: 'Expenses', value: m(s.expenses) },
      { metric: 'Cost of goods sold', value: m(s.cogs) },
      { metric: 'Net profit', value: m(s.netProfit) },
      { metric: 'Average order value', value: m(s.averageOrderValue) },
    ],
    summary: [
      { label: 'Gross sales', value: m(s.grossSales) },
      { label: 'Net revenue', value: m(s.netRevenue) },
      { label: 'Net profit', value: m(s.netProfit) },
      { label: 'Orders', value: s.orderCount },
    ],
  }
}

function productWise({ items, products, currency }: ReportInput): ReportDefinition {
  const stats = productStats(items, products)
  const m = (n: number) => formatMoney(n, currency)
  const totalRev = stats.reduce((s, r) => s + r.revenue, 0)
  return {
    kind: 'product-wise',
    title: 'Product-wise Sales',
    from: 0,
    to: 0,
    columns: [
      { key: 'name', label: 'Product' },
      { key: 'quantity', label: 'Qty', align: 'right' },
      { key: 'revenue', label: 'Revenue', align: 'right' },
      { key: 'cost', label: 'Cost', align: 'right' },
      { key: 'profit', label: 'Profit', align: 'right' },
      { key: 'share', label: 'Share', align: 'right' },
    ],
    rows: stats.map((r) => ({
      name: r.name,
      quantity: r.quantity,
      revenue: m(r.revenue),
      cost: m(r.cost),
      profit: m(r.profit),
      share: pct(r.revenue, totalRev),
    })),
    summary: [
      { label: 'Products', value: stats.length },
      { label: 'Units', value: stats.reduce((s, r) => s + r.quantity, 0) },
      { label: 'Revenue', value: m(totalRev) },
      { label: 'Profit', value: m(stats.reduce((s, r) => s + r.profit, 0)) },
    ],
  }
}

function monthlyReport(input: ReportInput): ReportDefinition {
  const points = monthlySeries(input)
  const m = (n: number) => formatMoney(n, input.currency)
  return {
    kind: 'monthly',
    title: 'Monthly Sales',
    from: input.range.from,
    to: input.range.to,
    columns: [
      { key: 'month', label: 'Month' },
      { key: 'revenue', label: 'Net revenue', align: 'right' },
      { key: 'profit', label: 'Net profit', align: 'right' },
    ],
    rows: points.map((p) => ({ month: p.key, revenue: m(p.revenue), profit: m(p.profit) })),
    summary: [
      { label: 'Months', value: points.length },
      { label: 'Revenue', value: m(points.reduce((s, p) => s + p.revenue, 0)) },
      { label: 'Profit', value: m(points.reduce((s, p) => s + p.profit, 0)) },
    ],
  }
}

function countryWise({ orders, currency }: ReportInput): ReportDefinition {
  const stats = countryStats(orders)
  const m = (n: number) => formatMoney(n, currency)
  const total = stats.reduce((s, c) => s + c.revenue, 0)
  return {
    kind: 'country-wise',
    title: 'Sales by Country',
    from: 0,
    to: 0,
    columns: [
      { key: 'country', label: 'Country' },
      { key: 'orders', label: 'Orders', align: 'right' },
      { key: 'revenue', label: 'Revenue', align: 'right' },
      { key: 'share', label: 'Share', align: 'right' },
    ],
    rows: stats.map((c) => ({
      country: c.country,
      orders: c.orders,
      revenue: m(c.revenue),
      share: pct(c.revenue, total),
    })),
    summary: [
      { label: 'Countries', value: stats.length },
      { label: 'Orders', value: orders.length },
      { label: 'Revenue', value: m(total) },
    ],
  }
}

function feesReport({ payments, currency }: ReportInput): ReportDefinition {
  const rows = feesBreakdown(payments)
  const m = (n: number) => formatMoney(n, currency)
  const total = rows.reduce((s, r) => s + r.total, 0)
  return {
    kind: 'fees-breakdown',
    title: 'Etsy Fees Breakdown',
    from: 0,
    to: 0,
    columns: [
      { key: 'type', label: 'Fee type' },
      { key: 'count', label: 'Count', align: 'right' },
      { key: 'total', label: 'Total', align: 'right' },
      { key: 'share', label: 'Share', align: 'right' },
    ],
    rows: rows.map((r) => ({
      type: r.type.replace(/_/g, ' '),
      count: r.count,
      total: m(r.total),
      share: pct(r.total, total),
    })),
    summary: [
      { label: 'Fee lines', value: rows.reduce((s, r) => s + r.count, 0) },
      { label: 'Total fees', value: m(total) },
    ],
  }
}

function pnlReport(input: ReportInput): ReportDefinition {
  const { lines, net } = profitAndLoss(input)
  const m = (n: number) => formatMoney(n, input.currency)
  return {
    kind: 'profit-loss',
    title: 'Profit & Loss',
    from: input.range.from,
    to: input.range.to,
    columns: [
      { key: 'label', label: 'Line item' },
      { key: 'value', label: 'Amount', align: 'right' },
    ],
    rows: lines.map((l) => ({
      label: l.negative ? `  ${l.label}` : l.label,
      value: m(l.value),
    })),
    summary: [
      { label: 'Period', value: formatRange(input.range) },
      { label: 'Net profit', value: m(net) },
    ],
  }
}

export const REPORT_KINDS: { id: ReportKind; label: string }[] = [
  { id: 'sales-summary', label: 'Sales summary' },
  { id: 'product-wise', label: 'Product-wise' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'country-wise', label: 'Country-wise' },
  { id: 'fees-breakdown', label: 'Fees breakdown' },
  { id: 'profit-loss', label: 'Profit & Loss' },
]
