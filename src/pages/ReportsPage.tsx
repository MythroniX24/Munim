import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import { db } from '@/db/db'
import { useSettings, logoToDataUrl } from '@/hooks/useSettings'
import { useTheme } from '@/hooks/useTheme'
import { filterInRange, type DateRange } from '@/utils/calc'
import { resolveRange, type RangePreset } from '@/utils/dates'
import { buildReport, REPORT_KINDS, type ReportInput } from '@/reports/builders'
import { exportReportCsv } from '@/reports/csv'
import { downloadPdf, reportToPdf } from '@/reports/pdf'
import DateRangeBar from '@/components/ui/DateRangeBar'
import { cn } from '@/utils/cn'
import type { ReportKind } from '@/db/models'

export default function ReportsPage() {
  const settings = useSettings()
  const { theme } = useTheme()
  const [kind, setKind] = useState<ReportKind>('sales-summary')
  const [preset, setPreset] = useState<RangePreset>('this-month')
  const [range, setRange] = useState<DateRange>(() => resolveRange('this-month'))
  const [downloading, setDownloading] = useState<'pdf' | 'csv' | null>(null)

  const orders = useLiveQuery(() => db.orders.toArray(), [], [])
  const items = useLiveQuery(() => db.orderItems.toArray(), [], [])
  const payments = useLiveQuery(() => db.payments.toArray(), [], [])
  const expenses = useLiveQuery(() => db.expenses.toArray(), [], [])
  const products = useLiveQuery(() => db.products.toArray(), [], [])

  const input: ReportInput = useMemo(() => {
    const rangeOrders = filterInRange(orders, range, (o) => o.date)
    const orderIds = new Set(rangeOrders.map((o) => o.id))
    return {
      orders: rangeOrders,
      items: items.filter((i) => orderIds.has(i.orderId)),
      payments: filterInRange(payments, range, (p) => p.date),
      expenses: filterInRange(expenses, range, (e) => e.date),
      products,
      range,
      currency: settings.currency,
    }
  }, [orders, items, payments, expenses, products, range, settings.currency])

  const def = useMemo(() => buildReport(kind, input), [kind, input])

  const downloadPdf_ = async () => {
    setDownloading('pdf')
    try {
      const logoDataUrl = await logoToDataUrl(settings.logo)
      const doc = reportToPdf(def, { settings, logoDataUrl })
      downloadPdf(doc, `${def.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`)
    } finally {
      setDownloading(null)
    }
  }

  const downloadCsv = () => {
    setDownloading('csv')
    try {
      exportReportCsv(def)
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Sales reports</h1>

      <DateRangeBar
        value={{ preset, range }}
        onChange={({ preset: p, range: r }) => {
          setPreset(p)
          setRange(r)
        }}
      />

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Report type">
        {REPORT_KINDS.map((r) => (
          <button
            key={r.id}
            type="button"
            role="tab"
            aria-selected={kind === r.id}
            onClick={() => setKind(r.id)}
            className={cn(
              'shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium transition',
              kind === r.id
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className="btn-primary flex-1"
          onClick={downloadPdf_}
          disabled={downloading !== null || def.rows.length === 0}
        >
          <FileText size={16} />
          {downloading === 'pdf' ? 'Preparing…' : 'Download PDF'}
        </button>
        <button
          type="button"
          className="btn-ghost flex-1"
          onClick={downloadCsv}
          disabled={downloading !== null || def.rows.length === 0}
        >
          <FileSpreadsheet size={16} />
          {downloading === 'csv' ? 'Preparing…' : 'Download CSV'}
        </button>
      </div>

      {/* Summary strip */}
      {def.summary.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {def.summary.map((s) => (
            <div key={s.label} className="card !p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">{s.label}</div>
              <div className="mt-0.5 truncate text-sm font-semibold tabular-nums">{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Table preview — scrollable on mobile */}
      <div className="card overflow-hidden">
        <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
          <Download size={14} />
          Preview of “{def.title}”
        </div>
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
                {def.columns.map((c) => (
                  <th
                    key={c.key}
                    className={cn('px-1 py-2 font-medium', c.align === 'right' && 'text-right')}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {def.rows.map((row, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                  {def.columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        'px-1 py-2',
                        c.align === 'right' && 'text-right tabular-nums',
                        typeof row[c.key] === 'string' && c.align !== 'right' && 'max-w-[16rem] truncate',
                      )}
                    >
                      {row[c.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {def.rows.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">
              No data in this period — adjust the date range or import data.
            </p>
          )}
        </div>
      </div>

      <p className="text-center text-[11px] text-slate-400">
        {theme === 'dark' ? 'Dark' : 'Light'} mode · PDFs always render with light styling for print.
      </p>
    </div>
  )
}
