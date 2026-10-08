import { useMemo, useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Calculator, Plus, Search, X } from 'lucide-react'
import { db } from '@/db/db'
import { productTotalCost, type Product } from '@/db/models'
import { useSettings } from '@/hooks/useSettings'
import { formatMoney } from '@/utils/money'
import { productStats } from '@/utils/calc'

interface Draft {
  id: string
  name: string
  sku: string
  material: string
  plating: string
  packaging: string
  labour: string
}

const numOr0 = (s: string) => {
  const n = parseFloat(s)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

export default function CostingPage() {
  const settings = useSettings()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [query, setQuery] = useState('')

  const products = useLiveQuery(() => db.products.orderBy('name').toArray(), [], [])!
  const items = useLiveQuery(() => db.orderItems.toArray(), [], [])!

  // Per-product sales performance (lifetime)
  const stats = useMemo(() => productStats(items, products), [items, products])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return products
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q),
    )
  }, [products, query])

  /** Pull products from imported order items that don't have costing yet. */
  const discover = async () => {
    const seen = new Map<string, { name: string; sku?: string; listingId?: string }>()
    for (const it of items) {
      const key = (it.sku || it.name).toLowerCase()
      if (!seen.has(key)) {
        seen.set(key, { name: it.name, sku: it.sku, listingId: it.listingId })
      }
    }
    const existing = new Set(products.map((p) => p.id.toLowerCase()))
    const existingSkus = new Set(products.filter((p) => p.sku).map((p) => p.sku!.toLowerCase()))
    const now = Date.now()
    const fresh: Product[] = []
    for (const [key, v] of seen) {
      if (existing.has(key) || (v.sku && existingSkus.has(v.sku.toLowerCase()))) continue
      fresh.push({
        id: v.sku || v.listingId || key,
        name: v.name,
        sku: v.sku,
        material: 0,
        plating: 0,
        packaging: 0,
        labour: 0,
        updatedAt: now,
      })
    }
    if (fresh.length) await db.products.bulkPut(fresh)
  }

  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!draft) return
    const product: Product = {
      id: draft.id,
      name: draft.name.trim(),
      sku: draft.sku.trim() || undefined,
      material: numOr0(draft.material),
      plating: numOr0(draft.plating),
      packaging: numOr0(draft.packaging),
      labour: numOr0(draft.labour),
      updatedAt: Date.now(),
    }
    if (!product.name) return
    await db.products.put(product)
    setDraft(null)
  }

  const openNew = () =>
    setDraft({ id: '', name: '', sku: '', material: '', plating: '', packaging: '', labour: '' })

  const openEdit = (p: Product) =>
    setDraft({
      id: p.id,
      name: p.name,
      sku: p.sku ?? '',
      material: String(p.material),
      plating: String(p.plating),
      packaging: String(p.packaging),
      labour: String(p.labour),
    })

  const pricedCount = products.filter((p) => productTotalCost(p) > 0).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Product costing</h1>
        <button type="button" className="btn-primary" onClick={openNew}>
          <Plus size={16} /> Add
        </button>
      </div>

      <p className="text-xs text-slate-500">
        <Calculator size={13} className="mr-1 inline" />
        {pricedCount} of {products.length} products have costs — used for per-order & per-product
        profit.
      </p>

      {products.length === 0 && (
        <div className="card text-center">
          <p className="mb-3 text-sm text-slate-500">
            No products yet. Import order items first, then pull product names from them.
          </p>
          <button type="button" className="btn-primary" onClick={discover} disabled={items.length === 0}>
            Discover products from orders ({items.length} items)
          </button>
        </div>
      )}

      {products.length > 0 && (
        <>
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              className="field pl-9"
              placeholder="Search products…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search products"
            />
          </div>

          <div className="space-y-2">
            {filtered.map((p) => {
              const perf = stats.find((s) => s.name === p.name)
              const total = productTotalCost(p)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openEdit(p)}
                  className="card flex w-full items-center gap-3 !p-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-medium">{p.name}</span>
                      {p.sku && (
                        <span className="shrink-0 font-mono text-[10px] text-slate-400">{p.sku}</span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      M {formatMoney(p.material, settings.currency)} · P{' '}
                      {formatMoney(p.plating, settings.currency)} · K{' '}
                      {formatMoney(p.packaging, settings.currency)} · L{' '}
                      {formatMoney(p.labour, settings.currency)}
                      {perf && <> · sold {perf.quantity} (rev {formatMoney(perf.revenue, settings.currency)})</>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold tabular-nums">
                      {formatMoney(total, settings.currency)}
                    </div>
                    <div
                      className={`text-xs ${perf ? (perf.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400') : 'text-slate-400'}`}
                    >
                      {perf ? `profit ${formatMoney(perf.profit, settings.currency)}` : 'no sales'}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* Editor sheet */}
      {draft && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center">
          <form
            onSubmit={submit}
            className="max-h-[92vh] w-full max-w-md space-y-3 overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl dark:bg-slate-900 sm:rounded-3xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">
                {draft.id ? 'Edit' : 'New'} product cost
              </h2>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <label className="block text-xs font-medium text-slate-500">
              Product name *
              <input
                required
                className="field mt-1"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label className="block text-xs font-medium text-slate-500">
              SKU (optional — enables matching by SKU)
              <input
                className="field mt-1 font-mono"
                value={draft.sku}
                onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ['material', 'Material'],
                  ['plating', 'Plating'],
                  ['packaging', 'Packaging'],
                  ['labour', 'Labour'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block text-xs font-medium text-slate-500">
                  {label}
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    className="field mt-1"
                    value={draft[key]}
                    onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                    placeholder="0.00"
                  />
                </label>
              ))}
            </div>

            <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
              <div className="flex justify-between">
                <span className="text-slate-500">Unit cost</span>
                <span className="font-semibold tabular-nums">
                  {formatMoney(
                    numOr0(draft.material) +
                      numOr0(draft.plating) +
                      numOr0(draft.packaging) +
                      numOr0(draft.labour),
                    settings.currency,
                  )}
                </span>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button type="button" className="btn-ghost flex-1" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary flex-1">
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
