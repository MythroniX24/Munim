import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ProductStat } from '@/utils/calc'
import { chartPalette, compactMoney } from './chartTheme'
import ChartCard from './ChartCard'

/**
 * Top products by revenue — horizontal bars.
 * One series → single hue (slot 1) for every bar; the top product gets the
 * accent (emphasis pattern) — no value-ramp on nominal categories.
 * Product names are the identity channel (direct-labeled on the axis).
 */
export default function TopProductsChart({
  stats,
  isDark,
  currency,
  limit = 6,
}: {
  stats: ProductStat[]
  isDark: boolean
  currency: string
  limit?: number
}) {
  const p = chartPalette(isDark)
  const top = stats.slice(0, limit)
  const data = [...top].reverse().map((s) => ({
    name: s.name.length > 22 ? `${s.name.slice(0, 21)}…` : s.name,
    revenue: s.revenue,
    full: s.name,
  }))

  return (
    <ChartCard
      title="Top products by revenue"
      table={{
        columns: ['Product', 'Qty', 'Revenue', 'Profit'],
        rows: top.map((s) => [s.name, s.quantity, s.revenue, s.profit]),
      }}
    >
      <div className="h-56 w-full">
        {data.length === 0 ? (
          <p className="flex h-full items-center justify-center text-sm text-slate-400">
            No product data yet — import order items
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 4, right: 12, bottom: 0, left: 0 }}
              barCategoryGap={6}
            >
              <CartesianGrid stroke={p.grid} strokeWidth={1} horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: p.axisText, fontSize: 11 }}
                axisLine={{ stroke: p.axis, strokeWidth: 1 }}
                tickLine={false}
                tickFormatter={compactMoney}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: p.axisText, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={110}
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
                formatter={(value) => [
                  `${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 })} ${currency}`,
                  'Revenue',
                ]}
                labelFormatter={(_l, payload) => payload?.[0]?.payload?.full ?? ''}
              />
              <Bar
                dataKey="revenue"
                fill={p.series1}
                radius={[0, 4, 4, 0]}
                maxBarSize={18}
                isAnimationActive={false}
              >
                {data.map((_, i) => (
                  <Cell
                    key={i}
                    fill={p.series1}
                    fillOpacity={i === data.length - 1 ? 1 : 0.75}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </ChartCard>
  )
}
