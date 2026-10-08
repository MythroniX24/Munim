import Dexie, { type EntityTable } from 'dexie'
import type { Expense, Order, OrderItem, Payment, Product, Settings } from './models'
import { DEFAULT_SETTINGS } from './models'

/**
 * Local-first database. Everything lives in IndexedDB on this device —
 * nothing is ever sent anywhere.
 */
export class MunimDB extends Dexie {
  orders!: EntityTable<Order, 'id'>
  orderItems!: EntityTable<OrderItem, 'id'>
  payments!: EntityTable<Payment, 'id'>
  expenses!: EntityTable<Expense, 'id'>
  products!: EntityTable<Product, 'id'>
  settings!: EntityTable<Settings, 'id'>

  constructor() {
    super('munim')

    this.version(1).stores({
      orders: 'id, date, status, shipCountry, buyerCountry, buyerName, orderNumber, updatedAt',
      orderItems: 'id, orderId, sku, name',
      payments: 'id, date, orderId, entryType',
      expenses: '++id, date, category, templateId',
      products: 'id, sku, name',
      settings: 'id',
    })
  }
}

export const db = new MunimDB()

/** Seed the single settings row on first launch. */
export async function ensureSettings(): Promise<Settings> {
  const existing = await db.settings.get('app')
  if (existing) return existing
  await db.settings.put({ ...DEFAULT_SETTINGS })
  return { ...DEFAULT_SETTINGS }
}

/** Wipe every table (used by "Clear all data"). */
export async function clearAllData(): Promise<void> {
  await db.transaction(
    'rw',
    db.orders,
    db.orderItems,
    db.payments,
    db.expenses,
    db.products,
    db.settings,
    async () => {
      await Promise.all([
        db.orders.clear(),
        db.orderItems.clear(),
        db.payments.clear(),
        db.expenses.clear(),
        db.products.clear(),
      ])
      await db.settings.clear()
      await db.settings.put({ ...DEFAULT_SETTINGS })
    },
  )
}
