/**
 * Domain models for Munim — personal Etsy accounting.
 *
 * All monetary amounts are numbers in the order's currency (as exported by Etsy).
 * Timestamps are epoch milliseconds (UTC).
 */

/** Primary key = Etsy Order ID (guarantees dedupe across re-imports). */
export interface Order {
  id: string
  orderNumber?: string
  /** Sale date (epoch ms). */
  date: number
  createdAt?: number
  status?: string
  quantity?: number
  buyerName?: string
  buyerEmail?: string
  buyerCountry?: string
  shipCountry?: string
  shipCity?: string
  shipState?: string
  shipZip?: string
  street?: string
  currency?: string
  /** Merchandise total, before shipping/tax (gross sales). */
  itemTotal: number
  shippingCollected: number
  taxTotal: number
  discounts: number
  /** Order total as charged (items + shipping + tax − discounts). */
  orderTotal: number
  /** Net payout recorded by Etsy, when present in the export. */
  netAmount?: number
  paymentType?: string
  notes?: string
  updatedAt: number
}

export interface OrderItem {
  /** `${orderId}:${listingId ?? ''}:${lineIndex}` — stable across re-imports. */
  id: string
  orderId: string
  listingId?: string
  receiptId?: string
  sku?: string
  name: string
  quantity: number
  unitPrice: number
  /** lineTotal = quantity * unitPrice (as reported by Etsy when present). */
  lineTotal: number
  currency?: string
  variation?: string
}

export type PaymentEntryType =
  | 'sale'
  | 'transaction_fee'
  | 'processing_fee'
  | 'listing_fee'
  | 'offsite_ads'
  | 'etsy_ads'
  | 'shipping'
  | 'shipping_label'
  | 'refund'
  | 'deposit'
  | 'other'

/** Row from an Etsy Payment Account / Deposits statement. */
export interface Payment {
  /** Deterministic hash of date+type+amount+orderId+description → idempotent imports. */
  id: string
  date: number
  orderId?: string
  entryType: PaymentEntryType
  /** Raw entry type / description text from the statement. */
  rawType?: string
  description?: string
  /** Signed amount: fees are negative, sales positive. */
  amount: number
  currency?: string
}

export const EXPENSE_CATEGORIES = [
  'silver-materials',
  'gold-plating',
  'packaging',
  'shipping-labels',
  'etsy-ads',
  'tools',
  'photography',
  'other',
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface RecurringRule {
  frequency: RecurringFrequency
  /** Every N periods (1 = every period). */
  interval: number
  /** Stop generating after this date (epoch ms). */
  endDate?: number
}

export interface Expense {
  id?: number
  date: number
  amount: number
  currency?: string
  category: ExpenseCategory
  vendor?: string
  notes?: string
  /** Receipt photo, stored directly in IndexedDB. */
  receipt?: Blob
  recurring?: RecurringRule
  /** Set on auto-generated instances of a recurring template. */
  templateId?: number
  createdAt: number
}

/** Per-product cost of goods. */
export interface Product {
  /** sku when available, else `name:<lowercased name>`. */
  id: string
  name: string
  sku?: string
  material: number
  plating: number
  packaging: number
  labour: number
  updatedAt: number
}

export function productTotalCost(p: Product): number {
  return p.material + p.plating + p.packaging + p.labour
}

export interface Settings {
  id: 'app'
  /** Currency for manually entered expenses & display preference. */
  currency: string
  /** Base currency used for conversion (manual rates). */
  baseCurrency: string
  /** Manual rates: units of the key code per 1 base-currency unit (USD: 0.9 → 1 USD = 0.9 EUR). */
  rates: Record<string, number>
  shopName?: string
  address?: string
  logo?: Blob
  /** SHA-256 hex of the PIN salted with `pinSalt`. Absent = lock disabled. */
  pinHash?: string
  pinSalt?: string
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  currency: 'USD',
  baseCurrency: 'USD',
  rates: {},
}

/** Result of a CSV import run. */
export interface ImportSummary {
  fileName: string
  detectedType: CsvType | null
  total: number
  created: number
  updated: number
  skipped: number
  errors: ImportError[]
}

export interface ImportError {
  row: number
  message: string
}

export type CsvType = 'orders' | 'order_items' | 'payments'

/** Shape consumed by the report/PDF layer — one table + a summary block. */
export interface ReportColumn {
  key: string
  label: string
  align?: 'left' | 'right'
}

export interface ReportRow {
  [key: string]: string | number
}

export type ReportKind =
  | 'sales-summary'
  | 'product-wise'
  | 'monthly'
  | 'country-wise'
  | 'fees-breakdown'
  | 'profit-loss'

export interface ReportDefinition {
  kind: ReportKind
  title: string
  from: number
  to: number
  columns: ReportColumn[]
  rows: ReportRow[]
  summary: { label: string; value: string | number }[]
}
