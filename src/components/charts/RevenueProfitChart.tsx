import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { MonthlyPoint } from '@/utils/calc'
import { chartPalette, compactMoney } from './chartTheme'
import ChartCard, { SeriesLegend } from './ChartCard'

/** Monthly revenue vs profit — composed chart (bars + line), one value axis. */
export default function RevenueProfitChart({
  points,
  isDark,
  currency,
}: {
  points: MonthlyPoint[]
  isDark: boolean
  currency: string
}) {
  const p = chartPalette(isDark)

  return (
    <ChartCard
      title="Monthly revenue vs profit"
      legend={
        points.length > 0 ? (
          <SeriesLegend
            items={[
              { color: p.series1, label: 'Net revenue' },
              { color: p.series2, label: 'Net profit' },
            ]}
          />
        ) : undefined
      }
      table={{
        columns: ['Month', 'Net revenue', 'Net profit'],
        rows: points.map((pt) => [pt.label, pt.revenue, pt.profit]),
      }}
    >
      <div className="h-56 w-full">
        {points.length === 0 ? (
          <p className="flex h-full items-center justify-center text-sm text-slate-400">
            No data in this range
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
              <CartesianGrid stroke={p.grid} strokeWidth={1} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: p.axisText, fontSize: 11 }}
                axisLine={{ stroke: p.axis, strokeWidth: 1 }}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                tick={{ fill: p.axisText, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={compactMoney}
                width={44}
              />
              <Tooltip
                cursor={{ fill: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.05)' }}
                contentStyle={{
                  background: p.surface,
                  border: `1px solid ${p.grid}`,
                  borderRadius: 10,
                  fontSize: 12,
                  color: isDark ? '#f1f5f9' : '#0f172a',
                }}
                formatter={(value, name) => [
                  `${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 })} ${currency}`,
                  name === 'revenue' ? 'Net revenue' : 'Net profit',
                ]}
              />
              {/* Bars ≤24px, 4px rounded top, square baseline; 2px gap via barGap */}
              <Bar
                dataKey="revenue"
                fill={p.series1}
                radius={[4, 4, 0, 0]}
                maxBarSize={24}
                barGap={2}
                isAnimationActive={false}
              />
              <Line
                dataKey="profit"
                stroke={p.series2}
                strokeWidth={2}
                dot={{ r: 4, fill: p.series2, stroke: p.surface, strokeWidth: 2 }}
                activeDot={{ r: 5, fill: p.series2, stroke: p.surface, strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </ChartCard>
  )
}
