import Papa from 'papaparse'
import type { Order, ReportDefinition } from '@/db/models'

/** Trigger a browser download for a text payload. */
export function downloadText(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/** Report definition → CSV (raw row values, unformatted). */
export function reportToCsv(def: ReportDefinition): string {
  const header = def.columns.map((c) => c.label)
  const rows = def.rows.map((r) => def.columns.map((c) => r[c.key] ?? ''))
  return Papa.unparse({ fields: header, data: rows as (string | number)[][] })
}

/** Filtered orders list → CSV. */
export function ordersToCsv(orders: Order[]): string {
  return Papa.unparse(
    orders.map((o) => ({
      'Order ID': o.id,
      'Order Number': o.orderNumber ?? '',
      Date: new Date(o.date).toISOString().slice(0, 10),
      Status: o.status ?? '',
      'Buyer Name': o.buyerName ?? '',
      Country: o.shipCountry || o.buyerCountry || '',
      Currency: o.currency ?? '',
      'Items Total': o.itemTotal,
      Shipping: o.shippingCollected,
      Tax: o.taxTotal,
      Discounts: o.discounts,
      'Order Total': o.orderTotal,
      'Net Payout': o.netAmount ?? '',
      Notes: o.notes ?? '',
    })),
  )
}

export function exportReportCsv(def: ReportDefinition): void {
  downloadText(reportToCsv(def), `${def.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`, 'text/csv')
}

export function exportOrdersCsv(orders: Order[], suffix = 'filtered'): void {
  downloadText(ordersToCsv(orders), `orders-${suffix}-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv')
}
