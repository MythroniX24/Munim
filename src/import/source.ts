import type { CsvType, ImportSummary, Order, OrderItem, Payment } from '@/db/models'
import { db } from '@/db/db'
import { detectCsvType, unmappedHeaders } from './detect'
import { Papa, parseRows } from './parse'
import { yieldToUI } from '@/utils/async'

/**
 * Data-source abstraction. Today: CSV files. Tomorrow: Etsy API v3 —
 * implement `DataSource` with the same `load()` contract and the importer
 * handles persistence/dedupe identically.
 */
export interface RawChunk {
  headers: string[]
  rows: unknown[][]
}

export interface DataSource {
  readonly kind: string
  /** Detect the payload type, or null if unrecognised. */
  detect(headers: string[]): CsvType | null
  /** Stream parsed chunks (chunked so 10k+ row files never block the UI). */
  load(onProgress?: (processed: number) => void): AsyncIterable<RawChunk>
}

/** CSV file source. */
export class CsvFileSource implements DataSource {
  readonly kind = 'csv-file'
  private readonly file: File
  constructor(file: File) {
    this.file = file
  }

  detect(headers: string[]): CsvType | null {
    return detectCsvType(headers).type
  }

  async *load(onProgress?: (processed: number) => void): AsyncGenerator<RawChunk, void, unknown> {
    let headers: string[] | null = null
    let processed = 0
    // Papa's chunked parse keeps the main thread free on large files.
    const queue: RawChunk[] = []
    let done = false
    let notify: (() => void) | null = null

    const parsePromise = new Promise<void>((resolve, reject) => {
      Papa.parse(this.file, {
        header: false,
        skipEmptyLines: true,
        chunkSize: 1024 * 1024,
        chunk(results, parser) {
          if (results.errors.length && !results.data.length) {
            parser.abort()
            reject(new Error(results.errors[0].message))
            return
          }
          const rows = results.data as unknown[][]
          if (!headers && rows.length) {
            headers = rows[0].map((h) => String(h ?? ''))
            queue.push({ headers, rows: rows.slice(1) })
            processed += rows.length - 1
          } else if (headers) {
            queue.push({ headers, rows })
            processed += rows.length
          }
          notify?.()
          onProgress?.(processed)
        },
        complete() {
          done = true
          notify?.()
          resolve()
        },
        error(err) {
          done = true
          notify?.()
          reject(err)
        },
      })
    })

    while (!done || queue.length) {
      if (queue.length === 0) {
        await new Promise<void>((r) => {
          notify = r
        })
        notify = null
        continue
      }
      const chunk = queue.shift()!
      yield chunk
    }
    await parsePromise
    if (!headers) throw new Error('Empty file')
  }
}

/**
 * Persist chunks with dedupe:
 * - orders: upsert by Order ID (re-import never duplicates)
 * - order items: replace all items belonging to each touched order
 * - payments: skip ids that already exist (statements are append-only)
 */
export async function importFromSource(
  source: DataSource,
  fileName: string,
  onProgress?: (processed: number) => void,
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    fileName,
    detectedType: null,
    total: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  }

  let type: CsvType | null = null
  let columnNote: string | null = null
  let prevOrderIds: string[] = []

  for await (const chunk of source.load(onProgress)) {
    if (!type) {
      type = source.detect(chunk.headers)
      summary.detectedType = type
      if (!type) {
        const det = detectCsvType(chunk.headers)
        throw new Error(
          `Unrecognised CSV. Best guess scores: ${Object.entries(det.scores)
            .map(([k, v]) => `${k}=${v.toFixed(2)}`)
            .join(', ')}`,
        )
      }
      const unmapped = unmappedHeaders(chunk.headers, type)
      if (unmapped.length) {
        columnNote = `Ignored columns: ${unmapped.slice(0, 8).join(', ')}${unmapped.length > 8 ? '…' : ''}`
      }
    }

    const { records, errors } = parseRows(type, chunk.rows, chunk.headers)
    summary.errors.push(...errors.slice(0, 50))
    summary.total += chunk.rows.length

    if (type === 'orders') {
      const orders = records as Order[]
      const ids = orders.map((o) => o.id)
      const existing = await db.orders.bulkGet(ids)
      const toPut: Order[] = []
      orders.forEach((o, i) => {
        if (existing[i]) {
          summary.updated++
          toPut.push(o) // preserve imported-over notes? no — keep import authoritative for financials
        } else {
          summary.created++
          toPut.push(o)
        }
      })
      await db.orders.bulkPut(toPut)
      prevOrderIds = [...prevOrderIds, ...ids]
    } else if (type === 'order_items') {
      const items = records as OrderItem[]
      const orderIds = [...new Set(items.map((i) => i.orderId))]
      // Replace this batch's orders' items entirely (id contains line index → stable)
      await db.orderItems.where('orderId').anyOf(orderIds).delete()
      await db.orderItems.bulkPut(items)
      summary.created += items.length
      prevOrderIds = [...prevOrderIds, ...orderIds]
    } else {
      const payments = records as Payment[]
      const existing = await db.payments.bulkGet(payments.map((p) => p.id))
      const toPut = payments.filter((_, i) => !existing[i])
      summary.created += toPut.length
      summary.skipped += payments.length - toPut.length
      await db.payments.bulkPut(toPut)
    }

    await yieldToUI()
  }

  if (columnNote) summary.errors.push({ row: 0, message: columnNote })
  void prevOrderIds
  return summary
}
