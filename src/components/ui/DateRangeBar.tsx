import { useState } from 'react'
import { CalendarRange } from 'lucide-react'
import { cn } from '@/utils/cn'
import { RANGE_PRESETS, resolveRange, toDateInput, type RangePreset } from '@/utils/dates'
import type { DateRange } from '@/utils/calc'

/**
 * Preset + custom date-range filter used by Dashboard and Reports.
 * Controlled: parent owns the resolved range.
 */
export default function DateRangeBar({
  value,
  onChange,
}: {
  value: { preset: RangePreset; range: DateRange }
  onChange: (next: { preset: RangePreset; range: DateRange }) => void
}) {
  const [showCustom, setShowCustom] = useState(value.preset === 'custom')

  const pickPreset = (preset: RangePreset) => {
    if (preset === 'custom') {
      setShowCustom(true)
      onChange({ preset, range: value.range })
      return
    }
    setShowCustom(false)
    onChange({ preset, range: resolveRange(preset) })
  }

  const setCustom = (fromIso: string, toIso: string) => {
    if (!fromIso || !toIso) return
    const [fy, fm, fd] = fromIso.split('-').map(Number)
    const [ty, tm, td] = toIso.split('-').map(Number)
    const range = resolveRange('custom', {
      from: new Date(fy, fm - 1, fd),
      to: new Date(ty, tm - 1, td),
    })
    onChange({ preset: 'custom', range })
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Date range">
        {RANGE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => pickPreset(p.id as RangePreset)}
            className={cn(
              'shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium transition',
              value.preset === p.id
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
            )}
            aria-pressed={value.preset === p.id}
          >
            {p.label}
          </button>
        ))}
      </div>

      {showCustom && (
        <div className="card flex items-end gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500" htmlFor="range-from">
              From
            </label>
            <input
              id="range-from"
              type="date"
              className="field"
              defaultValue={toDateInput(value.range.from)}
              onChange={(e) =>
                setCustom(e.target.value, toDateInput(value.range.to))
              }
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500" htmlFor="range-to">
              To
            </label>
            <input
              id="range-to"
              type="date"
              className="field"
              defaultValue={toDateInput(value.range.to)}
              onChange={(e) =>
                setCustom(toDateInput(value.range.from), e.target.value)
              }
            />
          </div>
          <CalendarRange className="mb-3 hidden text-slate-400 sm:block" size={20} aria-hidden />
        </div>
      )}
    </div>
  )
}
