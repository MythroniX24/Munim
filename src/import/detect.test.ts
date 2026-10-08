import { describe, expect, it } from 'vitest'
import { buildColumnMap, detectCsvType, normalizeHeader, unmappedHeaders } from './detect'
import { classifyPayment, parseOrderItemRows, parseOrderRows, parsePaymentRows } from './parse'

describe('normalizeHeader', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeHeader('Order ID')).toBe('orderid')
    expect(normalizeHeader('  Ship-To Country ')).toBe('shiptocountry')
    expect(normalizeHeader('Date (UTC)')).toBe('dateutc')
  })
})

describe('detectCsvType', () => {
  it('detects Sold Orders', () => {
    const r = detectCsvType([
      'Order ID',
      'Order Number',
      'Date',
      'Buyer Name',
      'Buyer Country',
      'Ship Country',
      'Item Total',
      'Shipping Total',
      'Tax Total',
      'Order Total',
    ])
    expect(r.type).toBe('orders')
  })

  it('detects Sold Order Items', () => {
    const r = detectCsvType([
      'Order ID',
      'Listing ID',
      'Item Name',
      'Quantity',
      'Unit Price',
      'Total Price',
      'SKU',
    ])
    expect(r.type).toBe('order_items')
  })

  it('detects Payment Account statement', () => {
    const r = detectCsvType(['Date', 'Entry Type', 'Description', 'Amount', 'Currency', 'Order ID'])
    expect(r.type).toBe('payments')
  })

  it('handles header spelling variants', () => {
    expect(detectCsvType(['orderid', 'order_total', 'buyer name']).type).toBe('orders')
    expect(detectCsvType(['Transaction Date', 'Transaction Type', 'Net Amount']).type).toBe('payments')
  })

  it('returns null for unknown files', () => {
    expect(detectCsvType(['foo', 'bar', 'baz']).type).toBeNull()
    expect(detectCsvType([]).type).toBeNull()
  })
})

describe('buildColumnMap / unmappedHeaders', () => {
  it('maps aliases to canonical fields', () => {
    const map = buildColumnMap(
      ['Order ID', 'Buyer Name', 'Ship-To Country', 'Order Total', 'Mystery Column'],
      'orders',
    )
    expect(map.orderId).toBe(0)
    expect(map.buyerName).toBe(1)
    expect(map.shipCountry).toBe(2)
    expect(map.orderTotal).toBe(3)
    expect(unmappedHeaders(['Order ID', 'Mystery Column'], 'orders')).toEqual(['Mystery Column'])
  })
})

describe('classifyPayment', () => {
  it('classifies common Etsy entry types', () => {
    expect(classifyPayment('Transaction Fee')).toBe('transaction_fee')
    expect(classifyPayment('Payment Processing Fee')).toBe('processing_fee')
    expect(classifyPayment('Listing Fee')).toBe('listing_fee')
    expect(classifyPayment('Offsite Ads Fee')).toBe('offsite_ads')
    expect(classifyPayment('Etsy Ads')).toBe('etsy_ads')
    expect(classifyPayment('Shipping Label')).toBe('shipping_label')
    expect(classifyPayment('Refund')).toBe('refund')
    expect(classifyPayment('Deposit')).toBe('deposit')
    expect(classifyPayment('Sale')).toBe('sale')
    expect(classifyPayment('Something Odd')).toBe('other')
  })
})

describe('parseOrderRows', () => {
  const headers = [
    'Order ID',
    'Order Number',
    'Date',
    'Buyer Name',
    'Buyer Email',
    'Ship Country',
    'Currency',
    'Item Total',
    'Shipping Total',
    'Tax Total',
    'Discount',
    'Order Total',
  ]

  it('parses valid rows', () => {
    const { records, errors } = parseOrderRows(
      [
        ['123', 'A-1', 'Mar 15, 2024', 'Jane', 'jane@x.com', 'US', 'USD', '100.00', '5.00', '8.00', '0', '113.00'],
      ],
      headers,
    )
    expect(errors).toHaveLength(0)
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      id: '123',
      orderNumber: 'A-1',
      buyerName: 'Jane',
      shipCountry: 'US',
      itemTotal: 100,
      shippingCollected: 5,
      taxTotal: 8,
      orderTotal: 113,
    })
    expect(records[0].date).toBe(Date.UTC(2024, 2, 15))
  })

  it('reports missing id and bad dates', () => {
    const { records, errors } = parseOrderRows(
      [
        ['', 'x', 'Mar 15, 2024'],
        ['999', 'x', 'garbage-date'],
      ],
      headers,
    )
    expect(records).toHaveLength(0)
    expect(errors).toHaveLength(2)
    expect(errors[0].row).toBe(2)
  })
})

describe('parseOrderItemRows', () => {
  const headers = ['Order ID', 'Listing ID', 'SKU', 'Item Name', 'Quantity', 'Unit Price', 'Total Price']

  it('computes line totals and stable ids', () => {
    const { records } = parseOrderItemRows(
      [
        ['100', 'L1', 'SKU1', 'Ring', '2', '50.00', '100.00'],
        ['100', 'L2', 'SKU2', 'Necklace', '1', '30.00', '30.00'],
        ['101', 'L1', 'SKU1', 'Ring', '1', '50.00', '50.00'],
      ],
      headers,
    )
    expect(records.map((r) => r.id)).toEqual(['100:L1:0', '100:L2:1', '101:L1:0'])
    expect(records[0]).toMatchObject({ quantity: 2, unitPrice: 50, lineTotal: 100, sku: 'SKU1' })
  })

  it('derives line total when missing', () => {
    const { records } = parseOrderItemRows([['100', 'L1', '', 'Ring', '3', '10.00', '']], headers)
    expect(records[0].lineTotal).toBe(30)
  })
})

describe('parsePaymentRows', () => {
  const headers = ['Date', 'Entry Type', 'Description', 'Amount', 'Currency', 'Order ID']

  it('parses signed amounts and classifies', () => {
    const { records, errors } = parsePaymentRows(
      [
        ['Mar 15, 2024', 'Transaction Fee', 'Order 123', '-6.60', 'USD', '123'],
        ['Mar 15, 2024', 'Sale', 'Order 123', '100.00', 'USD', '123'],
      ],
      headers,
    )
    expect(errors).toHaveLength(0)
    expect(records[0].entryType).toBe('transaction_fee')
    expect(records[0].amount).toBe(-6.6)
    expect(records[1].entryType).toBe('sale')
    // ids are deterministic and distinct
    const again = parsePaymentRows([['Mar 15, 2024', 'Sale', 'Order 123', '100.00', 'USD', '123']], headers)
    expect(again.records[0].id).toBe(records[1].id)
    expect(records[0].id).not.toBe(records[1].id)
  })

  it('skips zero amounts and bad dates', () => {
    const { records, errors } = parsePaymentRows(
      [
        ['Mar 15, 2024', 'Sale', '', '0', 'USD', ''],
        ['nope', 'Sale', '', '10', 'USD', ''],
      ],
      headers,
    )
    expect(records).toHaveLength(0)
    expect(errors).toHaveLength(2)
  })
})
