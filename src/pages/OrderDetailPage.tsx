import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, FileText, Save } from 'lucide-react'
import { db } from '@/db/db'
import { productTotalCost, type Settings } from '@/db/models'
import { useSettings, logoToDataUrl } from '@/hooks/useSettings'
import { formatMoney } from '@/utils/money'
import { toDateInput } from '@/utils/dates'
import { downloadPdf, orderToPdf } from '@/reports/pdf'
import { round2 } from '@/utils/money'

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const orderId = decodeURIComponent(id ?? '')
  const settings = useSettings()

  // undefined (no default) = still loading; map get()'s undefined → null = not found
  const order = useLiveQuery(
    () => db.orders.get(orderId).then((o) => o ?? null),
    [orderId],
  )
  const items = useLiveQuery(
    () => db.orderItems.where('orderId').equals(orderId).toArray(),
    [orderId],
    [],
  )
  const payments = useLiveQuery(
    () => db.payments.where('orderId').equals(orderId).toArray(),
    [orderId],
    [],
  )

  const [notes, setNotes] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)

  const products = useLiveQuery(() => db.products.toArray(), [], [])

  const costs = useMemo(() => {
    if (!items || !products) return { cogs: 0, rows: [] as { name: string; cost: number }[] }
    const bySku = new Map(products.filter((p) => p.sku).map((p) => [p.sku!, p]))
    const byName = new Map(products.map((p) => [p.name.trim().toLowerCase(), p]))
    let cogs = 0
    const rows = items.map((it) => {
      const product =
        (it.sku ? bySku.get(it.sku) : undefined) ?? byName.get(it.name.trim().toLowerCase())
      const cost = product ? round2(productTotalCost(product) * it.quantity) : 0
      cogs += cost
      return { name: it.name, cost }
    })
    return { cogs: round2(cogs), rows }
  }, [items, products])

  const fees = useMemo(
    () =>
      (payments ?? [])
        .filter((p) => p.amount < 0 && p.entryType !== 'refund')
        .reduce((s, p) => s + Math.abs(p.amount), 0),
    [payments],
  )

  if (!order) {
    return (
      <div className="py-16 text-center text-sm text-slate-400">
        {order === undefined ? 'Loading…' : 'Order not found.'}
      </div>
    )
  }

  const currency = order.currency || settings.currency
  const m = (n: number) => formatMoney(n, currency)
  const effectiveNotes = notes ?? order.notes ?? ''
  const notesDirty = notes !== null && notes !== (order.notes ?? '')

  const saveNotes = async () => {
    setSaving(true)
    try {
      await db.orders.update(orderId, { notes: notes ?? undefined, updatedAt: Date.now() })
      setNotes(null)
    } finally {
      setSaving(false)
    }
  }

  const download = async () => {
    setBusy(true)
    try {
      const logoDataUrl = await logoToDataUrl(settings.logo)
      const doc = orderToPdf(order, items ?? [], settings as Settings, logoDataUrl, products ?? [])
      downloadPdf(doc, `order-${order.orderNumber || order.id}.pdf`)
    } finally {
      setBusy(false)
    }
  }

  const feePayments = (payments ?? []).filter((p) => p.amount < 0)
  const credits = (payments ?? []).filter((p) => p.amount > 0)
  const netFromPayments = round2(
    (payments ?? []).reduce((s, p) => s + p.amount, 0),
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link
          to="/orders"
          className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        >
          <ArrowLeft size={16} /> Orders
        </Link>
        <button type="button" className="btn-primary" onClick={download} disabled={busy}>
          <FileText size={16} /> {busy ? 'Preparing…' : 'PDF'}
        </button>
      </div>

      <header>
        <h1 className="text-xl font-semibold">Order {order.orderNumber || order.id}</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {toDateInput(order.date)}
          {order.status && <> · {order.status}</>} · <span className="font-mono text-xs">{order.id}</span>
        </p>
      </header>

      {/* Items */}
      <section className="card">
        <h2 className="mb-2 text-sm font-semibold">Items</h2>
        <div className="space-y-2">
          {(items ?? []).map((it) => {
            const row = costs.rows.find((r) => r.name === it.name)
            return (
              <div key={it.id} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2 last:border-0 last:pb-0 dark:border-slate-800">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{it.name}</p>
                  <p className="text-xs text-slate-500">
                    {it.quantity} × {m(it.unitPrice)}
                    {it.sku && <> · SKU {it.sku}</>}
                    {it.variation && <> · {it.variation}</>}
                  </p>
                  {row && row.cost > 0 && (
                    <p className="text-xs text-slate-400">COGS {m(row.cost)}</p>
                  )}
                </div>
                <span className="shrink-0 text-sm font-medium tabular-nums">{m(it.lineTotal)}</span>
              </div>
            )
          })}
          {(items ?? []).length === 0 && (
            <p className="text-sm text-slate-400">
              No items — import the <em>Sold Order Items</em> CSV.
            </p>
          )}
        </div>
      </section>

      {/* Buyer */}
      <section className="card">
        <h2 className="mb-2 text-sm font-semibold">Buyer & shipping</h2>
        <div className="grid gap-1 text-sm">
          <p>{order.buyerName || 'Unknown'}</p>
          {order.buyerEmail && <p className="text-slate-500">{order.buyerEmail}</p>}
          <address className="mt-1 not-italic text-slate-500">
            {[order.street, order.shipCity, order.shipState, order.shipZip, order.shipCountry]
              .filter(Boolean)
              .join(', ') || 'No address'}
          </address>
        </div>
      </section>

      {/* Money breakdown */}
      <section className="card">
        <h2 className="mb-2 text-sm font-semibold">Money</h2>
        <dl className="space-y-1.5 text-sm">
          <Row label="Items total" value={m(order.itemTotal)} />
          <Row label="Shipping collected" value={m(order.shippingCollected)} />
          <Row label="Tax" value={m(order.taxTotal)} />
          {order.discounts > 0 && <Row label="Discounts" value={`−${m(order.discounts)}`} />}
          <Row label="Order total" value={m(order.orderTotal)} strong />
          {order.netAmount != null && <Row label="Etsy net payout" value={m(order.netAmount)} strong />}
          {fees > 0 && <Row label="Fees (payment account)" value={`−${m(fees)}`} />}
          {costs.cogs > 0 && <Row label="COGS (from costing)" value={`−${m(costs.cogs)}`} />}
          {fees > 0 || costs.cogs > 0 ? (
            <Row
              label="Profit on this order"
              value={m(round2(order.itemTotal + order.shippingCollected - fees - costs.cogs))}
              strong
            />
          ) : null}
        </dl>
        {feePayments.length > 0 && (
          <div className="mt-3 border-t border-slate-100 pt-2 dark:border-slate-800">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Payment account lines
            </h3>
            <div className="space-y-1 text-xs">
              {[...feePayments, ...credits].map((p) => (
                <div key={p.id} className="flex justify-between gap-2">
                  <span className="truncate text-slate-500">
                    {toDateInput(p.date)} · {p.rawType || p.entryType}
                  </span>
                  <span className={p.amount < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}>
                    {p.amount < 0 ? '' : '+'}
                    {formatMoney(p.amount, currency)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between border-t border-slate-100 pt-1 font-medium dark:border-slate-800">
                <span>Sum</span>
                <span>{formatMoney(netFromPayments, currency)}</span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Notes */}
      <section className="card">
        <h2 className="mb-2 text-sm font-semibold">Notes</h2>
        <textarea
          className="field min-h-24"
          placeholder="Private notes about this order…"
          value={effectiveNotes}
          onChange={(e) => setNotes(e.target.value)}
        />
        {notesDirty && (
          <button type="button" className="btn-primary mt-2" onClick={saveNotes} disabled={saving}>
            <Save size={16} /> {saving ? 'Saving…' : 'Save notes'}
          </button>
        )}
      </section>
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? 'font-semibold' : ''}`}>
      <dt className={strong ? '' : 'text-slate-500'}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}
