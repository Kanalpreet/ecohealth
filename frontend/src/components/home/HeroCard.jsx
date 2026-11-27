import { MapPin } from 'lucide-react'
import { AqiGauge } from '../ui/AqiGauge'
import { Badge } from '../ui/Badge'
import { GlassCard } from '../ui/GlassCard'
import { PersonaSwitcher } from './PersonaSwitcher'
import { SAMPLE_AQI } from './personas'

/** Hero card: an EXAMPLE (never "Live") air reading and the persona switcher. */
export function HeroCard() {
  return (
    <GlassCard as="section" aria-labelledby="hero-card-title" className="relative w-full max-w-md p-5 sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <h2 id="hero-card-title" className="flex items-center gap-2 text-base font-bold">
          <MapPin aria-hidden="true" size={18} className="text-accent" />
          Same air, different risk
        </h2>
        <Badge>Example</Badge>
      </div>

      <AqiGauge value={SAMPLE_AQI} className="mt-5" />

      <div className="mt-6 border-t border-line pt-5">
        <PersonaSwitcher />
      </div>

      <p className="mt-5 text-xs text-muted">Sample data for illustration only: not a forecast and not medical advice.</p>
    </GlassCard>
  )
}
