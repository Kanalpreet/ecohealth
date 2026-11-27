import { Check, Clock, Minus, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { SectionTitle } from '../ui/SectionTitle'

/*
 * General, respectful comparison with typical product categories (no brand names).
 * "partly" = some products in the category do it. EcoHealth's Travel plans are
 * "soon" (Travel Mode is built after Home Mode).
 */
const COLUMNS = ['Typical AQI apps', 'Smartwatches', 'EcoHealth']

const ROWS = [
  { feature: 'Personal to health conditions', values: ['no', 'partly', 'yes'] },
  { feature: 'Whole family in one account', values: ['no', 'no', 'yes'] },
  { feature: 'Heat, cold and UV, not just air', values: ['partly', 'partly', 'yes'] },
  { feature: 'Safe-hours planning', values: ['partly', 'no', 'yes'] },
  { feature: 'Explains why risk is high', values: ['no', 'no', 'yes'] },
  { feature: 'Travel health plans', values: ['no', 'no', 'soon'] },
  { feature: 'Free in any browser', values: ['partly', 'no', 'yes'] },
]

const STATUS = {
  yes: { icon: Check, label: 'Yes', className: 'bg-success-soft text-success' },
  partly: { icon: Minus, label: 'Partly', className: 'bg-risk-moderate text-risk-moderate-ink' },
  no: { icon: X, label: 'No', className: 'bg-subtle text-muted' },
  soon: { icon: Clock, label: 'Coming soon', className: 'bg-info-soft text-info' },
}

/** Icon + text. In the table the text is visually hidden (the legend explains the icons). */
function StatusMark({ value, showText = false }) {
  const s = STATUS[value]
  const Icon = s.icon
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full', s.className)}>
        <Icon aria-hidden="true" size={16} strokeWidth={2.5} />
      </span>
      <span className={showText || value === 'soon' ? 'text-sm font-medium text-ink' : 'sr-only'}>{s.label}</span>
    </span>
  )
}

function Legend() {
  return (
    <ul aria-label="Legend" className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
      {['yes', 'partly', 'no'].map((v) => (
        <li key={v}>
          <StatusMark value={v} showText />
        </li>
      ))}
    </ul>
  )
}

/** "Why EcoHealth is different": a table from 768 px, stacked cards below. */
export function ComparisonTable() {
  return (
    <section aria-labelledby="compare-title" className="mx-auto w-full max-w-content px-gutter pt-section sm:px-6">
      <SectionTitle
        id="compare-title"
        eyebrow="Not just another AQI number"
        title="Why EcoHealth is different"
        subtitle="What you typically get from each kind of tool. Individual products vary."
      />
      <div className="mt-8">
        <Legend />
      </div>

      {/* Tablet and desktop: a real table. */}
      <div className="glass mt-6 hidden overflow-hidden rounded-card md:block">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">
            Comparison of typical AQI apps, smartwatches and EcoHealth
          </caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="p-4 text-sm font-semibold text-muted">
                Feature
              </th>
              {COLUMNS.map((c) => (
                <th
                  key={c}
                  scope="col"
                  className={cn('p-4 text-center text-sm font-bold', c === 'EcoHealth' ? 'bg-brand-soft text-brand-hover' : 'text-ink')}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.feature} className="border-b border-line last:border-b-0">
                <th scope="row" className="p-4 text-sm font-semibold text-ink">
                  {row.feature}
                </th>
                {row.values.map((v, i) => (
                  <td key={COLUMNS[i]} className={cn('p-4 text-center', COLUMNS[i] === 'EcoHealth' && 'bg-brand-soft/60')}>
                    <StatusMark value={v} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: one card per feature (the table is display:none here, so nothing is read twice). */}
      <ul className="mt-6 flex flex-col gap-4 md:hidden">
        {ROWS.map((row) => (
          <li key={row.feature} className="glass rounded-card p-4">
            <h3 className="font-bold text-ink">{row.feature}</h3>
            <dl className="mt-3 flex flex-col gap-2">
              {row.values.map((v, i) => (
                <div
                  key={COLUMNS[i]}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-control px-3 py-1.5',
                    COLUMNS[i] === 'EcoHealth' && 'bg-brand-soft',
                  )}
                >
                  <dt className={cn('text-sm', COLUMNS[i] === 'EcoHealth' ? 'font-bold text-brand-hover' : 'text-ink')}>
                    {COLUMNS[i]}
                  </dt>
                  <dd>
                    <StatusMark value={v} showText />
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </section>
  )
}
