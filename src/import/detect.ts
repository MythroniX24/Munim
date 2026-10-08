import type { CsvType } from '@/db/models'

/**
 * CSV header detection & flexible column mapping for Etsy exports.
 *
 * Etsy header names drift between export versions and locales, so we
 * normalise headers (lowercase, strip punctuation) and match against
 * alias lists.
 */

export function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/^﻿/, '')
    .replace(/[^a-z0-9]/g, '')
}

/** Column alias table: canonical field → accepted normalised headers. */
const ORDER_COLUMNS: Record<string, string[]> = {
  orderId: ['orderid', 'etsyorderid', 'receiptid'],
  orderNumber: ['ordernumber', 'ordersuccessnumber'],
  date: ['date', 'saledate', 'ordersoldat', 'soldat', 'createdat', 'orderdate'],
  status: ['status', 'orderstatus'],
  quantity: ['quantity', 'qty'],
  buyerName: ['buyername', 'customername', 'buyer'],
  buyerEmail: ['buyeremail', 'customeremail', 'email'],
  buyerCountry: ['buyercountry', 'country', 'buyercountrycode'],
  shipCountry: ['shipcountry', 'shiptocountry', 'shipcountrycode'],
  shipCity: ['shiptocity', 'shipcity', 'city'],
  shipState: ['shiptostate', 'shipstate', 'state'],
  shipZip: ['shiptozipcode', 'shiptozip', 'shipzip', 'zipcode', 'zip'],
  street: ['street1', 'shiptostreet1', 'address1', 'street'],
  currency: ['ordercurrency', 'currency', 'currencycode'],
  itemTotal: ['itemtotal', 'merchandisetotal', 'subtotal', 'salepricetotal', 'itemsales'],
  shippingCollected: ['shippingtotal', 'shipping', 'shiptotal', 'shippingcollected'],
  taxTotal: ['taxtotal', 'tax', 'salestax'],
  discounts: ['discount', 'discountamount', 'coupondiscount', 'promodiscount'],
  orderTotal: ['ordertotal', 'total', 'ordervalue'],
  netAmount: ['netamount', 'netproceeds', 'amount'],
  paymentType: ['paymenttype', 'paymentmethod'],
}

const ITEM_COLUMNS: Record<string, string[]> = {
  orderId: ['orderid', 'etsyorderid'],
  listingId: ['listingid', 'itemlistingid'],
  receiptId: ['receiptid'],
  sku: ['sku', 'productsku'],
  name: ['itemname', 'productname', 'title', 'listingtitle'],
  quantity: ['quantity', 'qty'],
  unitPrice: ['unitprice', 'price', 'saleprice'],
  lineTotal: ['totalprice', 'linetotal', 'itemtotal', 'total'],
  currency: ['currency', 'pricecurrency', 'currencycode'],
  variation: ['variation', 'variationoptions', 'variationdetails'],
  date: ['date', 'soldat', 'ordersoldat', 'createdat'],
}

const PAYMENT_COLUMNS: Record<string, string[]> = {
  date: ['date', 'transactiondate', 'entrydate', 'postingdate'],
  entryType: ['entrytype', 'type', 'transactiontype', 'descriptiontype', 'category'],
  description: ['description', 'details', 'memo', 'entrydescription'],
  amount: ['amount', 'netamount', 'value'],
  currency: ['currency', 'currencycode'],
  orderId: ['orderid', 'etsyorderid', 'referencorderid', 'referencenumber', 'receiptid'],
}

export const COLUMN_ALIASES: Record<CsvType, Record<string, string[]>> = {
  orders: ORDER_COLUMNS,
  order_items: ITEM_COLUMNS,
  payments: PAYMENT_COLUMNS,
}

/**
 * Signature per type: which CANONICAL fields (post-alias) must/bonus-appear.
 * Scoring = matched/required; best score ≥ 0.5 wins; ambiguity below → null.
 * Matching runs through COLUMN_ALIASES so header spelling variants
 * ("Transaction Date", "Net Amount", …) count for the fields they map to.
 */
const SIGNATURES: Record<CsvType, { required: string[]; bonus: string[] }> = {
  orders: {
    required: ['orderId', 'orderTotal'],
    bonus: ['buyerName', 'shipCountry', 'shippingCollected', 'itemTotal', 'orderNumber'],
  },
  order_items: {
    required: ['orderId', 'name'],
    bonus: ['listingId', 'quantity', 'unitPrice', 'lineTotal', 'sku'],
  },
  payments: {
    required: ['date', 'amount'],
    bonus: ['entryType', 'description', 'currency'],
  },
}

export interface DetectionResult {
  type: CsvType | null
  score: number
  scores: Record<CsvType, number>
}

/** Detect which Etsy CSV this is from its header row. */
export function detectCsvType(headers: string[]): DetectionResult {
  const scores = {} as Record<CsvType, number>

  for (const type of Object.keys(SIGNATURES) as CsvType[]) {
    const { required, bonus } = SIGNATURES[type]
    const map = buildColumnMap(headers, type)
    const has = (field: string) => map[field] !== undefined
    const requiredHits = required.filter(has).length
    const bonusHits = bonus.filter(has).length
    const hasAllRequired = requiredHits === required.length
    scores[type] = hasAllRequired
      ? 0.6 + (bonusHits / bonus.length) * 0.4
      : (requiredHits / required.length) * 0.5 + (bonusHits / bonus.length) * 0.1
  }

  const ranked = (Object.entries(scores) as [CsvType, number][]).sort((a, b) => b[1] - a[1])
  const [bestType, bestScore] = ranked[0]
  const second = ranked[1]?.[1] ?? 0
  const ok = bestScore >= 0.5 && bestScore - second >= 0.15
  return { type: ok ? bestType : null, score: bestScore, scores }
}

/** Map a raw CSV header row → { canonicalField: columnIndex }. */
export function buildColumnMap(headers: string[], type: CsvType): Record<string, number> {
  const aliases = COLUMN_ALIASES[type]
  const norm = headers.map(normalizeHeader)
  const map: Record<string, number> = {}
  for (const [field, options] of Object.entries(aliases)) {
    for (const opt of options) {
      const idx = norm.indexOf(opt)
      if (idx !== -1) {
        map[field] = idx
        break
      }
    }
  }
  return map
}

/** Headers in the file that didn't map to any known field (shown in summary). */
export function unmappedHeaders(headers: string[], type: CsvType): string[] {
  const map = buildColumnMap(headers, type)
  const used = new Set(Object.values(map))
  return headers.filter((_, i) => !used.has(i) && headers[i]?.trim())
}
