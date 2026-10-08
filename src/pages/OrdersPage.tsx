import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { ChevronRight, Download, FileText, Search, X } from 'lucide-react'
import { db } from '@/db/db'
import { useSettings } from '@/hooks/useSettings'
import { formatMoney } from '@/utils/money'
import { toDateInput, fromDateInputStart, fromDateInput } from '@/utils/dates'
import { exportOrdersCsv } from '@/reports/csv'
import { ordersToPdf, downloadPdf } from '@/reports/pdf'
import { logoToDataUrl } from '@/hooks/useSettings'
import { cn } from '@/utils/cn'

const PAGE_SIZE = 50

export default function OrdersPage() {
  const settings = useSettings()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [country, setCountry] = useState('')
  const [product, setProduct] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [showFilters, setShowFilters] = useState(false)
  const [busy, setBusy] = useState(false)

  const orders = useLiveQuery(() => db.orders.orderBy('date').reverse().toArray(), [], [])!
  const items = useLiveQuery(() => db.orderItems.toArray(), [], [])!

  const statuses = useMemo(
    () => [...new Set(orders.map((o) => o.status).filter(Boolean))].sort() as string[],
    [orders],
  )
  const countries = useMemo(
    () =>
      [...new Set(orders.map((o) => o.shipCountry || o.buyerCountry).filter(Boolean))].sort() as string[],
    [orders],
  )
  const productNames = useMemo(() => {
    const names = new Set(items.map((i) => i.name).filter(Boolean))
    return [...names].sort()
  }, [items])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const fromTs = from ? fromDateInputStart(from) : undefined
    const toTs = to ? fromDateInput(to) : undefined
    // product → order ids owning a matching item
    let productIds: Set<string> | null = null
    if (product) {
      const pl = product.toLowerCase()
      productIds = new Set(
        items.filter((i) => i.name.toLowerCase() === pl || i.sku?.toLowerCase() === pl).map((i) => i.orderId),
      )
    }
    return orders.filter((o) => {
      if (fromTs != null && o.date < fromTs) return false
      if (toTs != null && o.date > toTs) return false
      if (status && o.status !== status) return false
      if (country && (o.shipCountry || o.buyerCountry) !== country) return false
      if (productIds && !productIds.has(o.id)) return false
      if (q) {
        const hay = `${o.id} ${o.orderNumber ?? ''} ${o.buyerName ?? ''} ${o.buyerEmail ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [orders, items, query, status, country, product, from, to])

  const shown = filtered.slice(0, page * PAGE_SIZE)
  const filtersActive = Boolean(status || country || product || from || to)

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const exportBulkPdf = async () => {
    setBusy(true)
    try {
      const ids = selected.size ? [...selected] : shown.map((o) => o.id)
      const target = orders.filter((o) => ids.includes(o.id))
      const itemsByOrder = new Map<string, typeof items>()
      for (const it of items) {
        if (ids.includes(it.orderId)) {
          const arr = itemsByOrder.get(it.orderId) ?? []
          arr.push(it)
          itemsByOrder.set(it.orderId, arr)
        }
      }
      const products = await db.products.toArray()
      const logoDataUrl = await logoToDataUrl(settings.logo)
      const doc = ordersToPdf(target, itemsByOrder, settings, logoDataUrl, products)
      downloadPdf(doc, selected.size ? `orders-selected-${target.length}.pdf` : `orders-${target.length}.pdf`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(1)
            }}
            placeholder="Search order ID, buyer…"
            className="field pl-9"
            aria-label="Search orders"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className={cn('btn-ghost', filtersActive && 'border-brand-600 text-brand-600 dark:text-brand-400')}
        >
          Filters{filtersActive ? ' •' : ''}
        </button>
      </div>

      {showFilters && (
        <div className="card grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-medium text-slate-500">
            Status
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="field mt-1">
              <option value="">All</option>
              {statuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-500">
            Country
            <select value={country} onChange={(e) => { setCountry(e.target.value); setPage(1) }} className="field mt-1">
              <option value="">All</option>
              {countries.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-500">
            Product
            <select value={product} onChange={(e) => { setProduct(e.target.value); setPage(1) }} className="field mt-1">
              <option value="">All</option>
              {productNames.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-medium text-slate-500">
              From
              <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1) }} className="field mt-1" />
            </label>
            <label className="text-xs font-medium text-slate-500">
              To
              <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1) }} className="field mt-1" />
            </label>
          </div>
          {filtersActive && (
            <button
              type="button"
              className="btn-ghost justify-self-start sm:col-span-2"
              onClick={() => {
                setStatus(''); setCountry(''); setProduct(''); setFrom(''); setTo(''); setPage(1)
              }}
            >
              <X size={14} /> Clear filters
            </button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 text-sm text-slate-500">
        <span>
          {filtered.length} order{filtered.length === 1 ? '' : 's'}
          {selected.size > 0 && ` · ${selected.size} selected`}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-ghost !min-h-0 !px-2.5 !py-1.5 text-xs"
            onClick={() => exportOrdersCsv(filtered)}
          >
            <Download size={14} /> CSV
          </button>
          <button
            type="button"
            className="btn-ghost !min-h-0 !px-2.5 !py-1.5 text-xs"
            disabled={busy || shown.length === 0}
            onClick={exportBulkPdf}
          >
            <FileText size={14} /> {selected.size ? 'PDF selected' : 'PDF list'}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {shown.length === 0 && (
          <p className="card text-center text-sm text-slate-400">No orders match.</p>
        )}
        {shown.map((o) => (
          <div key={o.id} className="card flex items-center gap-3 !p-3">
            <input
              type="checkbox"
              checked={selected.has(o.id)}
              onChange={() => toggleSelect(o.id)}
              className="h-5 w-5 shrink-0 accent-brand-600"
              aria-label={`Select order ${o.orderNumber || o.id}`}
            />
            <Link to={`/orders/${encodeURIComponent(o.id)}`} className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-semibold">
                  {o.orderNumber || o.id}
                </span>
                <span className="shrink-0 text-sm font-medium tabular-nums">
                  {formatMoney(o.orderTotal, o.currency || settings.currency)}
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="truncate">
                  {o.buyerName || 'Unknown buyer'} · {o.shipCountry || o.buyerCountry || '—'}
                </span>
                <span className="shrink-0">{toDateInput(o.date)}</span>
              </div>
              {o.status && (
                <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {o.status}
                </span>
              )}
            </Link>
            <ChevronRight size={16} className="shrink-0 text-slate-400" />
          </div>
        ))}
      </div>

      {shown.length < filtered.length && (
        <button type="button" className="btn-ghost w-full" onClick={() => setPage((p) => p + 1)}>
          Load more ({filtered.length - shown.length} remaining)
        </button>
      )}
    </div>
  )
}
