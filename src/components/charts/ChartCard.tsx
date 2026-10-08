import { useState, type ReactNode } from 'react'
import { Table2, BarChart3 } from 'lucide-react'

/**
 * Chart card shell: title, chart, and the required table-view twin
 * (accessibility: no value is ever gated behind hover).
 */
export default function ChartCard({
  title,
  children,
  table,
  legend,
}: {
  title: string
  children: ReactNode
  /** Row-shape data for the table view. */
  table: { columns: string[]; rows: (string | number)[][] }
  legend?: ReactNode
}) {
  const [showTable, setShowTable] = useState(false)

  return (
    <section className="card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          aria-pressed={showTable}
        >
          {showTable ? <BarChart3 size={14} /> : <Table2 size={14} />}
          {showTable ? 'Chart' : 'Table'}
        </button>
      </div>

      {showTable ? (
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-white dark:bg-slate-900">
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                {table.columns.map((c, i) => (
                  <th key={c} className={`py-1.5 pr-3 font-medium ${i > 0 ? 'text-right' : ''}`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                  {row.map((cell, j) => (
                    <td
                      key={j}
                      className={`py-1.5 pr-3 tabular-nums ${j > 0 ? 'text-right' : ''}`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {children}
          {legend}
        </>
      )}
    </section>
  )
}

/** Legend row for ≥2 series: colored mark + text-token label. */
export function SeriesLegend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
      {items.map((it) => (
        <span
          key={it.label}
          className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300"
        >
          <span
            className="inline-block h-2.5 w-2.5 rounded-[3px]"
            style={{ backgroundColor: it.color }}
            aria-hidden
          />
          {it.label}
        </span>
      ))}
    </div>
  )
}
