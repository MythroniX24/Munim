import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import {
  Banknote,
  CreditCard,
  Package,
  Receipt,
  ShoppingBag,
  Truck,
  TrendingUp,
  Upload,
} from 'lucide-react'
import { db } from '@/db/db'
import { useSettings } from '@/hooks/useSettings'
import { useTheme } from '@/hooks/useTheme'
import { formatMoney } from '@/utils/money'
import { resolveRange, type RangePreset } from '@/utils/dates'
import {
  countryStats,
  filterInRange,
  monthlySeries,
  productStats,
  summarize,
  type DateRange,
} from '@/utils/calc'
import StatCard from '@/components/ui/StatCard'
import DateRangeBar from '@/components/ui/DateRangeBar'
import RevenueProfitChart from '@/components/charts/RevenueProfitChart'
import TopProductsChart from '@/components/charts/TopProductsChart'
import CountryChart from '@/components/charts/CountryChart'

export default function DashboardPage() {
  const settings = useSettings()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [preset, setPreset] = useState<RangePreset>(() =>
    new Date().getDate() < 15 ? 'last-30-days' : 'this-month',
  )
  const [range, setRange] = useState<DateRange>(() => resolveRange(preset))

  // Live queries — filtered client-side; Dexie keeps them consistent on import.
  const orders = useLiveQuery(() => db.orders.toArray(), [], undefined) as
    | Awaited<ReturnType<typeof db.orders.toArray>>
    | undefined
  const allItems = useLiveQuery(() => db.orderItems.toArray(), [], undefined)
  const allPayments = useLiveQuery(() => db.payments.toArray(), [], undefined)
  const allExpenses = useLiveQuery(() => db.expenses.toArray(), [], undefined)
  const products = useLiveQuery(() => db.products.toArray(), [], undefined)

  const loaded = orders && allItems && allPayments && allExpenses && products

  const view = useMemo(() => {
    // Narrow each table directly — aliased `loaded` narrowing doesn't survive
    // reliably into the callback's own control-flow analysis.
    if (!orders || !allItems || !allPayments || !allExpenses || !products) return null
    const inR = <T,>(rows: T[], getTs: (r: T) => number | undefined): T[] =>
      filterInRange(rows, range, getTs)
    const rangeOrders = inR(orders, (o) => o.date)
    const rangePayments = inR(allPayments, (p) => p.date)
    const rangeExpenses = inR(allExpenses, (e) => e.date)
    const orderIds = new Set(rangeOrders.map((o) => o.id))
    const rangeItems = allItems.filter((i) => orderIds.has(i.orderId))
    const stats = summarize({
      orders: rangeOrders,
      payments: rangePayments,
      expenses: rangeExpenses,
      items: rangeItems,
      products,
    })
    return {
      stats,
      monthly: monthlySeries({
        orders: rangeOrders,
        payments: rangePayments,
        expenses: rangeExpenses,
        items: rangeItems,
        products,
      }),
      topProducts: productStats(rangeItems, products),
      countries: countryStats(rangeOrders),
      isEmpty: orders.length === 0 && allExpenses.length === 0,
    }
  }, [loaded, orders, allItems, allPayments, allExpenses, products, range])

  const m = (n: number) => formatMoney(n, settings.currency)

  if (!loaded) {
    return <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
  }

  if (view?.isEmpty) {
    return (
      <div className="card py-12 text-center">
        <Upload className="mx-auto mb-3 text-slate-400" size={32} />
        <h1 className="mb-1 text-lg font-semibold">Welcome to Munim</h1>
        <p className="mx-auto mb-5 max-w-sm text-sm text-slate-500 dark:text-slate-400">
          Start by importing your Etsy CSV exports — Sold Orders, Sold Order Items, and the
          Payment Account statement. Everything stays on this device.
        </p>
        <div className="flex flex-col items-center justify-center gap-2 sm:flex-row">
          <Link to="/import" className="btn-primary">
            Import CSV files
          </Link>
          <Link to="/expenses" className="btn-ghost">
            Add expenses
          </Link>
        </div>
      </div>
    )
  }

  const s = view!.stats

  return (
    <div className="space-y-4">
      <DateRangeBar
        value={{ preset, range }}
        onChange={({ preset: nextPreset, range: nextRange }) => {
          setPreset(nextPreset)
          setRange(nextRange)
        }}
      />

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Gross sales" value={m(s.grossSales)} icon={<ShoppingBag size={16} />} />
        <StatCard
          label="Etsy fees"
          value={m(s.etsyFees)}
          tone={s.etsyFees > 0 ? 'negative' : 'neutral'}
          icon={<CreditCard size={16} />}
        />
        <StatCard
          label="Shipping"
          value={m(s.shippingCollected)}
          hint={`cost ${m(s.shippingCost)}`}
          icon={<Truck size={16} />}
        />
        <StatCard
          label="Net revenue"
          value={m(s.netRevenue)}
          tone="positive"
          icon={<TrendingUp size={16} />}
        />
        <StatCard label="Expenses" value={m(s.expenses)} icon={<Receipt size={16} />} />
        <StatCard
          label="Net profit"
          value={m(s.netProfit)}
          tone={s.netProfit >= 0 ? 'positive' : 'negative'}
          icon={<Banknote size={16} />}
        />
        <StatCard label="Orders" value={String(s.orderCount)} icon={<Package size={16} />} />
        <StatCard label="Avg order value" value={m(s.averageOrderValue)} />
      </div>

      {s.etsyFees === 0 && s.grossSales > 0 && (
        <p className="card border-amber-300 bg-amber-50 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          No fee data yet — import your Payment Account statement for exact Etsy fees.{' '}
          <Link to="/import" className="font-semibold underline">
            Import now
          </Link>
        </p>
      )}

      <RevenueProfitChart points={view!.monthly} isDark={isDark} currency={settings.currency} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TopProductsChart stats={view!.topProducts} isDark={isDark} currency={settings.currency} />
        <CountryChart stats={view!.countries} isDark={isDark} currency={settings.currency} />
      </div>
    </div>
  )
}
