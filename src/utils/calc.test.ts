import { describe, expect, it } from 'vitest'
import type { Expense, Order, OrderItem, Payment, Product } from '@/db/models'
import {
  countryStats,
  feesBreakdown,
  feesByType,
  grossSales,
  monthlySeries,
  profitAndLoss,
  productStats,
  shippingCollected,
  shippingCost,
  summarize,
  totalCogs,
  totalExpenses,
  totalFees,
} from './calc'
import { convert, parseAmount, round2 } from './money'
import { parseEtsyDate, resolveRange } from './dates'

// ---------- fixtures ----------

const order = (over: Partial<Order> = {}): Order => ({
  id: 'o1',
  date: Date.UTC(2024, 2, 15),
  itemTotal: 100,
  shippingCollected: 5,
  taxTotal: 0,
  discounts: 0,
  orderTotal: 105,
  updatedAt: 0,
  ...over,
})

const item = (over: Partial<OrderItem> = {}): OrderItem => ({
  id: 'o1:listing1:0',
  orderId: 'o1',
  listingId: 'listing1',
  name: 'Silver Ring',
  quantity: 2,
  unitPrice: 50,
  lineTotal: 100,
  ...over,
})

const payment = (over: Partial<Payment> = {}): Payment => ({
  id: 'p1',
  date: Date.UTC(2024, 2, 15),
  entryType: 'transaction_fee',
  amount: -6.6,
  ...over,
})

const expense = (over: Partial<Expense> = {}): Expense => ({
  date: Date.UTC(2024, 2, 15),
  amount: 20,
  category: 'packaging',
  createdAt: 0,
  ...over,
})

const product = (over: Partial<Product> = {}): Product => ({
  id: 'sku1',
  sku: 'sku1',
  name: 'Silver Ring',
  material: 10,
  plating: 2,
  packaging: 1,
  labour: 4,
  updatedAt: 0,
  ...over,
})

// ---------- money ----------

describe('round2', () => {
  it('rounds float noise', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3)
    expect(round2(10.005)).toBe(10.01)
  })
})

describe('parseAmount', () => {
  it('parses plain numbers and strings', () => {
    expect(parseAmount('1234.56')).toBe(1234.56)
    expect(parseAmount('$1,234.56')).toBe(1234.56)
    expect(parseAmount('€1.234,56')).toBe(1234.56)
    expect(parseAmount('-6.6')).toBe(-6.6)
    expect(parseAmount('($12.00)')).toBe(-12)
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('n/a')).toBeNull()
    expect(parseAmount(42)).toBe(42)
    expect(parseAmount(Number.NaN)).toBeNull()
  })
})

describe('convert', () => {
  const rates = { EUR: 0.9 } // 1 USD = 0.9 EUR → 1 EUR = 1/0.9 USD
  it('converts via base currency', () => {
    // 90 EUR → USD: (90 / 0.9) * 1 = 100
    expect(convert(90, 'EUR', 'USD', rates, 'USD')).toBe(100)
    expect(convert(100, 'USD', 'EUR', rates, 'USD')).toBe(90)
    expect(convert(50, 'USD', 'USD', rates, 'USD')).toBe(50)
  })
  it('returns raw amount when a rate is missing', () => {
    expect(convert(10, 'GBP', 'USD', rates, 'USD')).toBe(10)
  })
})

// ---------- fees ----------

describe('totalFees', () => {
  it('sums absolute values of fee entries only', () => {
    const payments = [
      payment({ entryType: 'transaction_fee', amount: -6.6 }),
      payment({ entryType: 'processing_fee', amount: -0.9 }),
      payment({ entryType: 'offsite_ads', amount: -3 }),
      payment({ entryType: 'sale', amount: 100 }),
      payment({ entryType: 'refund', amount: -20 }),
    ]
    expect(totalFees(payments)).toBe(10.5)
  })
  it('is 0 for empty input', () => {
    expect(totalFees([])).toBe(0)
  })
})

describe('feesByType', () => {
  it('groups negative amounts by entry type', () => {
    const payments = [
      payment({ entryType: 'transaction_fee', amount: -6.6 }),
      payment({ entryType: 'transaction_fee', amount: -1.4 }),
      payment({ entryType: 'sale', amount: 100 }),
    ]
    expect(feesByType(payments)).toEqual({ transaction_fee: 8 })
  })
})

// ---------- shipping ----------

describe('shipping', () => {
  it('collects shipping from orders', () => {
    expect(shippingCollected([order(), order({ id: 'o2', shippingCollected: 7 })])).toBe(12)
  })
  it('costs from label payments + label expenses', () => {
    const payments = [payment({ entryType: 'shipping_label', amount: -4.5 })]
    const expenses = [expense({ category: 'shipping-labels', amount: 10 })]
    expect(shippingCost(payments, expenses)).toBe(14.5)
  })
})

// ---------- COGS ----------

describe('totalCogs', () => {
  it('matches by sku and multiplies by quantity', () => {
    const { total, matched, unmatched } = totalCogs([item()], [product()])
    expect(total).toBe(34) // (10+2+1+4) * 2
    expect(matched).toBe(2)
    expect(unmatched).toBe(0)
  })
  it('falls back to name matching, reports unmatched', () => {
    const noSku = item({ sku: undefined, name: 'silver ring' })
    const p = product({ sku: undefined })
    const { total, unmatched } = totalCogs([noSku, item({ id: 'x', name: 'Unknown thing' })], [p])
    expect(total).toBe(34)
    expect(unmatched).toBe(2) // quantity-based, same as `matched` above (item qty = 2)
  })
  it('zero when no costing exists', () => {
    expect(totalCogs([item()], []).total).toBe(0)
  })
})

// ---------- summarize ----------

describe('summarize', () => {
  it('computes the dashboard numbers', () => {
    const s = summarize({
      orders: [order(), order({ id: 'o2', itemTotal: 50, shippingCollected: 0, orderTotal: 50 })],
      payments: [payment({ amount: -6.6 }), payment({ amount: -0.9 })],
      expenses: [expense({ amount: 20 }), expense({ amount: 5 })],
      items: [item()],
      products: [product()],
    })
    expect(s.grossSales).toBe(150)
    expect(s.etsyFees).toBe(7.5)
    expect(s.netRevenue).toBe(142.5)
    expect(s.expenses).toBe(25)
    expect(s.cogs).toBe(34)
    expect(s.netProfit).toBe(round2(142.5 - 0 - 25 - 34)) // no shipping cost here
    expect(s.orderCount).toBe(2)
    expect(s.averageOrderValue).toBe(75)
  })
  it('handles empty input', () => {
    const s = summarize({ orders: [], payments: [], expenses: [], items: [], products: [] })
    expect(s).toMatchObject({ grossSales: 0, netProfit: 0, orderCount: 0, averageOrderValue: 0 })
  })
  it('netProfit subtracts shipping cost', () => {
    const s = summarize({
      orders: [order()],
      payments: [payment({ entryType: 'shipping_label', amount: -4.5 })],
      expenses: [],
      items: [],
      products: [],
    })
    // gross 100 − 0 fees − 4.5 shipping
    expect(s.netProfit).toBe(95.5)
  })
})

// ---------- aggregates ----------

describe('productStats', () => {
  it('aggregates qty/revenue/cost/profit and sorts by profit', () => {
    const stats = productStats(
      [item(), item({ id: 'o2:l2:0', orderId: 'o2', name: 'Gold Hoop', quantity: 1, lineTotal: 60 })],
      [product()],
    )
    expect(stats).toHaveLength(2)
    const ring = stats.find((s) => s.name === 'Silver Ring')!
    expect(ring.quantity).toBe(2)
    expect(ring.revenue).toBe(100)
    expect(ring.cost).toBe(34)
    expect(ring.profit).toBe(66)
    const hoop = stats.find((s) => s.name === 'Gold Hoop')!
    expect(hoop.profit).toBe(60) // no costing → cost 0
    expect(stats[0].name).toBe('Silver Ring') // 66 > 60
  })
})

describe('countryStats', () => {
  it('groups by ship country with fallbacks', () => {
    const stats = countryStats([
      order({ shipCountry: 'US' }),
      order({ id: 'o2', shipCountry: 'US', itemTotal: 50 }),
      order({ id: 'o3', shipCountry: '', buyerCountry: 'DE', itemTotal: 30 }),
      order({ id: 'o4', shipCountry: '', buyerCountry: '', itemTotal: 10 }),
    ])
    expect(stats).toEqual([
      { country: 'US', orders: 2, revenue: 150 },
      { country: 'DE', orders: 1, revenue: 30 },
      { country: 'Unknown', orders: 1, revenue: 10 },
    ])
  })
})

describe('monthlySeries', () => {
  it('buckets by month with revenue and profit', () => {
    const points = monthlySeries({
      orders: [
        order({ id: 'a', date: Date.UTC(2024, 0, 10), itemTotal: 100 }),
        order({ id: 'b', date: Date.UTC(2024, 1, 10), itemTotal: 200 }),
      ],
      payments: [payment({ date: Date.UTC(2024, 0, 10), amount: -10 })],
      expenses: [expense({ date: Date.UTC(2024, 1, 10), amount: 20 })],
      items: [],
      products: [],
    })
    expect(points).toHaveLength(2)
    expect(points[0]).toMatchObject({ key: '2024-01', revenue: 90, profit: 90 })
    expect(points[1]).toMatchObject({ key: '2024-02', revenue: 200, profit: 180 })
  })
})

describe('feesBreakdown', () => {
  it('groups negatives with counts, sorted desc', () => {
    const rows = feesBreakdown([
      payment({ entryType: 'transaction_fee', amount: -6.6 }),
      payment({ entryType: 'transaction_fee', amount: -1.4 }),
      payment({ entryType: 'offsite_ads', amount: -5 }),
      payment({ entryType: 'sale', amount: 100 }),
    ])
    expect(rows).toEqual([
      { type: 'transaction_fee', count: 2, total: 8 },
      { type: 'offsite_ads', count: 1, total: 5 },
    ])
  })
})

describe('profitAndLoss', () => {
  it('produces ordered lines that reconcile to net', () => {
    const { lines, net } = profitAndLoss({
      orders: [order({ itemTotal: 100 })],
      payments: [payment({ amount: -10 })],
      expenses: [expense({ amount: 20 })],
      items: [item()],
      products: [product()],
    })
    expect(net).toBe(36) // 100 − 10 − 20 − 34
    expect(lines.at(-1)!.value).toBe(net)
    expect(lines.map((l) => l.label)).toEqual([
      'Gross sales',
      'Etsy fees',
      'Net revenue',
      'Shipping cost',
      'Cost of goods sold',
      'Expenses',
      'Net profit',
    ])
  })
})

describe('grossSales / totalExpenses', () => {
  it('sums straightforwardly', () => {
    expect(grossSales([order(), order({ id: 'x', itemTotal: 40 })])).toBe(140)
    expect(totalExpenses([expense(), expense({ amount: 7.5 })])).toBe(27.5)
  })
})

// ---------- dates ----------

describe('resolveRange', () => {
  it('this-year spans Jan 1 → Dec 31', () => {
    const r = resolveRange('this-year')
    const from = new Date(r.from)
    const to = new Date(r.to)
    expect(from.getMonth()).toBe(0)
    expect(from.getDate()).toBe(1)
    expect(to.getMonth()).toBe(11)
    expect(to.getFullYear()).toBe(from.getFullYear())
  })
  it('last-30-days ends today end-of-day', () => {
    const r = resolveRange('last-30-days')
    const to = new Date(r.to)
    expect(to.getHours()).toBe(23)
    expect((r.to - r.from) / 86400000).toBeGreaterThan(29.9)
  })
})

describe('parseEtsyDate', () => {
  it('parses ISO and human dates', () => {
    expect(parseEtsyDate('2024-03-15')).toBe(Date.UTC(2024, 2, 15))
    expect(parseEtsyDate('Mar 15, 2024')).toBeGreaterThan(0)
    expect(parseEtsyDate('')).toBeNull()
    expect(parseEtsyDate(undefined)).toBeNull()
    expect(parseEtsyDate('not a date')).toBeNull()
  })
})
