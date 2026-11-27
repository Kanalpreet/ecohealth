import { Area, AreaChart, CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

/*
 * Next-24-hours chart (Recharts; loaded lazily with React.lazy, own chunk).
 * - The five person-risk level bands are soft background colours (risk-* tokens; hex
 *   because SVG attributes can't read CSS variables) AND named on the Y axis.
 * - Safe windows are shaded mint; a dashed line marks "now".
 * - Decorative for screen readers: the page renders a visually hidden table of the same
 *   values next to it (aria-hidden on the chart avoids reading SVG noise).
 */
const BANDS = [
  { from: 0, to: 20, label: 'Low', fill: '#dcfce7' },
  { from: 20, to: 40, label: 'Moderate', fill: '#fef3c7' },
  { from: 40, to: 60, label: 'High', fill: '#ffedd5' },
  { from: 60, to: 80, label: 'Very High', fill: '#fee2e2' },
  { from: 80, to: 100, label: 'Dangerous', fill: '#f3e8ff' },
]
const BAND_TICKS = BANDS.map((b) => (b.from + b.to) / 2)
const bandLabel = (v) => BANDS.find((b) => (b.from + b.to) / 2 === v)?.label || ''

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-control border border-line bg-surface px-3 py-2 text-xs shadow-raised">
      <p className="font-semibold text-ink">{d.label}</p>
      <p className="text-ink">
        Score {d.score} · {d.level}
      </p>
    </div>
  )
}

/** points: [{ index, label, score, level }]; safeRanges: [{ from, to }] indices; nowIndex: number | null */
export default function HourlyChart({ points, safeRanges = [], nowIndex = null }) {
  return (
    <div aria-hidden="true" className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          {BANDS.map((b) => (
            <ReferenceArea key={b.label} y1={b.from} y2={b.to} fill={b.fill} fillOpacity={0.9} strokeOpacity={0} ifOverflow="extendDomain" />
          ))}
          {safeRanges.map((r) => (
            <ReferenceArea key={`${r.from}-${r.to}`} x1={r.from} x2={r.to} fill="#86d29e" fillOpacity={0.35} stroke="#15803d" strokeDasharray="3 3" strokeOpacity={0.6} />
          ))}
          <CartesianGrid vertical={false} stroke="#ffffff" strokeOpacity={0.7} />
          <XAxis
            dataKey="index"
            type="number"
            domain={[0, Math.max(points.length - 1, 1)]}
            ticks={points.filter((p) => p.index % 3 === 0).map((p) => p.index)}
            tickFormatter={(i) => points[i]?.short || ''}
            tick={{ fontSize: 11, fill: '#4a5d52' }}
            tickLine={false}
            axisLine={{ stroke: '#dbe8df' }}
          />
          <YAxis
            domain={[0, 100]}
            ticks={BAND_TICKS}
            tickFormatter={bandLabel}
            width={78}
            tick={{ fontSize: 11, fill: '#10241a' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#10241a', strokeOpacity: 0.3 }} />
          {nowIndex !== null && (
            <ReferenceLine x={nowIndex} stroke="#10241a" strokeDasharray="4 3" label={{ value: 'Now', position: 'insideTopLeft', fill: '#10241a', fontSize: 11 }} />
          )}
          <Area type="monotone" dataKey="score" stroke="#14532d" strokeWidth={2.5} fill="#14532d" fillOpacity={0.12} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
