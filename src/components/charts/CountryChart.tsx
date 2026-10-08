import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { CountryStat } from '@/utils/calc'
import { chartPalette, compactMoney } from './chartTheme'
import ChartCard from './ChartCard'

/**
 * Sales by country — horizontal bars, one series → slot 1 for every bar.
 * Country names on the category axis carry identity (no per-bar hue).
 */
export default function CountryChart({
  stats,
  isDark,
  currency,
  limit = 6,
}: {
  stats: CountryStat[]
  isDark: boolean
  currency: string
  limit?: number
}) {
  const p = chartPalette(isDark)
  const top = stats.slice(0, limit)
  const data = [...top].reverse().map((s) => ({
    name: s.country,
    revenue: s.revenue,
    orders: s.orders,
  }))

  return (
    <ChartCard
      title="Sales by country"
      table={{
        columns: ['Country', 'Orders', 'Revenue'],
        rows: top.map((s) => [s.country, s.orders, s.revenue]),
      }}
    >
      <div className="h-52 w-full">
        {data.length === 0 ? (
          <p className="flex h-full items-center justify-center text-sm text-slate-400">
            No orders in this range
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
                width={72}
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
                  name === 'revenue'
                    ? `${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 })} ${currency}`
                    : String(value),
                  name === 'revenue' ? 'Revenue' : 'Orders',
                ]}
              />
              <Bar
                dataKey="revenue"
                fill={p.series1}
                radius={[0, 4, 4, 0]}
                maxBarSize={18}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </ChartCard>
  )
}
