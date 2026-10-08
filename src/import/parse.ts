import Papa from 'papaparse'
import type { CsvType, ImportError, Order, OrderItem, Payment } from '@/db/models'
import { parseAmount } from '@/utils/money'
import { parseEtsyDate } from '@/utils/dates'
import { buildColumnMap } from './detect'
import type { PaymentEntryType } from '@/db/models'

/**
 * Row parsing: raw Papa rows → typed records.
 * Pure functions over parsed arrays (Papa does the CSV mechanics).
 */

const FEE_TYPE_RULES: [RegExp, PaymentEntryType][] = [
  [/transaction\s*fee/i, 'transaction_fee'],
  [/processing\s*fee|payment\s*processing/i, 'processing_fee'],
  [/listing\s*fee|renewal/i, 'listing_fee'],
  [/offsite\s*ads/i, 'offsite_ads'],
  [/\betsy\s*ads?\b/i, 'etsy_ads'],
  [/shipping\s*label|postage|label\s*purchase/i, 'shipping_label'],
  [/refund|cancellation/i, 'refund'],
  [/deposit|payout/i, 'deposit'],
  // ^sale\b (not ^sale$): classifyPayment tests "rawType description" as one
  // string, so "Sale Order 123" must still match the Sale rule.
  [/^sale\b|order\s*payment|sales?\s*tax\s*collected/i, 'sale'],
  [/shipping/i, 'shipping'],
]

export function classifyPayment(rawType: string | undefined, description?: string): PaymentEntryType {
  const text = `${rawType ?? ''} ${description ?? ''}`
  for (const [re, type] of FEE_TYPE_RULES) {
    if (re.test(text)) return type
  }
  return 'other'
}

const cell = (row: unknown[], map: Record<string, number>, field: string): string => {
  const idx = map[field]
  if (idx === undefined) return ''
  const v = row[idx]
  return v == null ? '' : String(v).trim()
}

const num = (row: unknown[], map: Record<string, number>, field: string): number => {
  const v = parseAmount(cell(row, map, field))
  return v ?? 0
}

export interface ParseRowsResult<T> {
  records: T[]
  errors: ImportError[]
}

/** Stable payment id: dedupes re-imports of the same statement line. */
function paymentId(date: number, type: string, amount: number, orderId: string, desc: string): string {
  const s = `${date}|${type}|${amount}|${orderId}|${desc}`
  // FNV-1a — small, fast, deterministic
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `pay_${(h >>> 0).toString(36)}_${date.toString(36)}`
}

export function parseOrderRows(rows: unknown[][], headers: string[]): ParseRowsResult<Order> {
  const map = buildColumnMap(headers, 'orders')
  const now = Date.now()
  const records: Order[] = []
  const errors: ImportError[] = []

  if (map.orderId === undefined) {
    errors.push({ row: 0, message: 'No "Order ID" column found' })
    return { records, errors }
  }

  rows.forEach((row, i) => {
    const id = cell(row, map, 'orderId')
    if (!id) {
      errors.push({ row: i + 2, message: 'Missing Order ID' })
      return
    }
    const date = parseEtsyDate(cell(row, map, 'date'))
    if (date == null) {
      errors.push({ row: i + 2, message: `Unparseable date for order ${id}` })
      return
    }
    records.push({
      id,
      orderNumber: cell(row, map, 'orderNumber') || undefined,
      date,
      status: cell(row, map, 'status') || undefined,
      quantity: map.quantity !== undefined ? num(row, map, 'quantity') || undefined : undefined,
      buyerName: cell(row, map, 'buyerName') || undefined,
      buyerEmail: cell(row, map, 'buyerEmail') || undefined,
      buyerCountry: cell(row, map, 'buyerCountry') || undefined,
      shipCountry: cell(row, map, 'shipCountry') || undefined,
      shipCity: cell(row, map, 'shipCity') || undefined,
      shipState: cell(row, map, 'shipState') || undefined,
      shipZip: cell(row, map, 'shipZip') || undefined,
      street: cell(row, map, 'street') || undefined,
      currency: cell(row, map, 'currency') || undefined,
      itemTotal: num(row, map, 'itemTotal'),
      shippingCollected: num(row, map, 'shippingCollected'),
      taxTotal: num(row, map, 'taxTotal'),
      discounts: num(row, map, 'discounts'),
      orderTotal: num(row, map, 'orderTotal'),
      netAmount: map.netAmount !== undefined ? num(row, map, 'netAmount') || undefined : undefined,
      paymentType: cell(row, map, 'paymentType') || undefined,
      updatedAt: now,
    })
  })

  return { records, errors }
}

export function parseOrderItemRows(rows: unknown[][], headers: string[]): ParseRowsResult<OrderItem> {
  const map = buildColumnMap(headers, 'order_items')
  const records: OrderItem[] = []
  const errors: ImportError[] = []

  if (map.orderId === undefined) {
    errors.push({ row: 0, message: 'No "Order ID" column found' })
    return { records, errors }
  }

  const seen = new Map<string, number>() // orderId → running line index

  rows.forEach((row, i) => {
    const orderId = cell(row, map, 'orderId')
    if (!orderId) {
      errors.push({ row: i + 2, message: 'Missing Order ID' })
      return
    }
    const lineIndex = seen.get(orderId) ?? 0
    seen.set(orderId, lineIndex + 1)

    const listingId = cell(row, map, 'listingId')
    const quantity = map.quantity !== undefined ? num(row, map, 'quantity') || 1 : 1
    const unitPrice = num(row, map, 'unitPrice')
    const lineTotalRaw = map.lineTotal !== undefined ? num(row, map, 'lineTotal') : NaN
    const lineTotal = Number.isFinite(lineTotalRaw) && lineTotalRaw !== 0 ? lineTotalRaw : unitPrice * quantity

    records.push({
      id: `${orderId}:${listingId}:${lineIndex}`,
      orderId,
      listingId: listingId || undefined,
      receiptId: cell(row, map, 'receiptId') || undefined,
      sku: cell(row, map, 'sku') || undefined,
      name: cell(row, map, 'name') || '(item)',
      quantity,
      unitPrice,
      lineTotal,
      currency: cell(row, map, 'currency') || undefined,
      variation: cell(row, map, 'variation') || undefined,
    })
  })

  return { records, errors }
}

export function parsePaymentRows(rows: unknown[][], headers: string[]): ParseRowsResult<Payment> {
  const map = buildColumnMap(headers, 'payments')
  const records: Payment[] = []
  const errors: ImportError[] = []

  if (map.date === undefined || map.amount === undefined) {
    errors.push({ row: 0, message: 'Need "Date" and "Amount" columns' })
    return { records, errors }
  }

  rows.forEach((row, i) => {
    const date = parseEtsyDate(cell(row, map, 'date'))
    const amount = num(row, map, 'amount')
    if (date == null) {
      errors.push({ row: i + 2, message: 'Unparseable date' })
      return
    }
    if (!amount) {
      errors.push({ row: i + 2, message: 'Zero or missing amount' })
      return
    }
    const rawType = cell(row, map, 'entryType')
    const description = cell(row, map, 'description')
    const orderId = cell(row, map, 'orderId')
    records.push({
      id: paymentId(date, rawType, amount, orderId, description),
      date,
      orderId: orderId || undefined,
      entryType: classifyPayment(rawType, description),
      rawType: rawType || undefined,
      description: description || undefined,
      amount,
      currency: cell(row, map, 'currency') || undefined,
    })
  })

  return { records, errors }
}

/** Dispatch to the right row parser based on detected type. */
export function parseRows(
  type: CsvType,
  rows: unknown[][],
  headers: string[],
): ParseRowsResult<Order | OrderItem | Payment> {
  switch (type) {
    case 'orders':
      return parseOrderRows(rows, headers)
    case 'order_items':
      return parseOrderItemRows(rows, headers)
    case 'payments':
      return parsePaymentRows(rows, headers)
  }
}

export { Papa }
