import { useRef } from 'react'
import { Bell, BookOpenCheck, Braces, Calculator, Database, MessageSquareText, ScanSearch, ShieldCheck, Sparkles } from 'lucide-react'
import { usePrefersReducedMotion } from '../../hooks/useMotionSafe'
import { useAgentFlow } from '../../hooks/useAgentFlow'
import { cn } from '../../lib/cn'
import { Badge } from '../ui/Badge'
import { GlassCard } from '../ui/GlassCard'
import { RiskBadge } from '../ui/RiskBadge'
import { SectionTitle } from '../ui/SectionTitle'

/*
 * "What happens behind every alert": deterministic code first (data, score), then four
 * AI agents (two in parallel), and nothing reaches the user without the Safety reviewer.
 * Two layouts of the same content: a horizontal flow (>= 1024 px, display:none below)
 * and a vertical one (below 1024 px). Only the visible one is in the accessibility tree.
 */
const NODES = {
  gather: { step: 0, kind: 'code', icon: Database, title: 'Gather data', text: 'Fetches live air quality and weather for your area.' },
  score: {
    step: 1,
    kind: 'code',
    icon: Calculator,
    title: 'Score risk',
    text: "Calculates each person's Climate Health Score with fixed, tested rules – no AI.",
  },
  context: {
    step: 2,
    kind: 'agent',
    icon: ScanSearch,
    title: 'Context analyst',
    text: 'Decides what else to check: forecast, altitude, hospitals.',
  },
  knowledge: {
    step: 2,
    kind: 'agent',
    icon: BookOpenCheck,
    title: 'Health knowledge',
    text: 'Finds relevant guidance from trusted health guidelines.',
  },
  advisor: {
    step: 3,
    kind: 'agent',
    icon: MessageSquareText,
    title: 'Advisor',
    text: 'Writes simple, personal precautions for each family member.',
  },
  safety: {
    step: 4,
    kind: 'agent',
    icon: ShieldCheck,
    title: 'Safety reviewer',
    text: 'Checks every message for safety; sends it back if needed.',
  },
}

const KIND = {
  code: { label: 'Plain code', icon: Braces, box: 'rounded-md border-2 border-solid border-line-strong/45' },
  agent: { label: 'AI agent', icon: Sparkles, box: 'rounded-card border-2 border-dashed border-accent/60' },
}

function KindTag({ kind }) {
  const k = KIND[kind]
  const Icon = k.icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 text-[0.7rem] font-semibold',
        kind === 'agent' ? 'rounded-pill bg-brand-soft text-brand-hover' : 'rounded-sm bg-subtle text-ink',
      )}
    >
      <Icon aria-hidden="true" size={12} />
      {k.label}
    </span>
  )
}

function FlowNode({ id, compact = false }) {
  const node = NODES[id]
  const Icon = node.icon
  return (
    <div
      role="listitem"
      data-node={node.step}
      className={cn('relative bg-surface shadow-card', KIND[node.kind].box, compact ? 'h-full p-3' : 'p-4')}
    >
      {/* "Lit" state: on by default (static / reduced motion); GSAP fades it in step by step. */}
      <span
        data-glow
        aria-hidden="true"
        className="pointer-events-none absolute -inset-0.5 rounded-[inherit] bg-brand-soft/70 shadow-raised ring-2 ring-accent"
      />
      <div className="relative flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex size-9 items-center justify-center rounded-pill bg-surface text-accent ring-1 ring-mint ring-inset">
            <Icon aria-hidden="true" size={18} />
          </span>
          <KindTag kind={node.kind} />
        </div>
        <h3 className="font-bold text-ink">{node.title}</h3>
        <p className={cn('text-muted', compact ? 'text-xs' : 'text-sm')}>{node.text}</p>
      </div>
    </div>
  )
}

/** Connector line that GSAP "draws" (scaleX / scaleY). Drawn by default. */
function Conn({ step, axis = 'x', className, origin }) {
  return (
    <div aria-hidden="true" className={cn('relative bg-line', axis === 'x' ? 'h-0.5' : 'w-0.5', className)}>
      <div
        data-conn={step}
        data-axis={axis}
        className={cn('absolute inset-0 bg-accent', origin || (axis === 'x' ? 'origin-left' : 'origin-top'))}
      />
    </div>
  )
}

function ParallelLabel({ className }) {
  return (
    <span className={cn('rounded-pill bg-surface px-2.5 py-0.5 text-xs font-semibold text-muted ring-1 ring-line', className)}>
      Run in parallel
    </span>
  )
}

function ExampleAlert() {
  return (
    <GlassCard data-alert as="article" aria-label="Example alert" className="bg-glass-strong">
      <div data-alert-part className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-bold text-ink">
          <span className="flex size-8 items-center justify-center rounded-pill bg-brand text-white">
            <Bell aria-hidden="true" size={16} />
          </span>
          6:00 AM · Priya
        </p>
        <Badge>Example</Badge>
      </div>
      <p data-alert-part className="mt-3 flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
        <RiskBadge level="High" /> risk today
      </p>
      <p data-alert-part className="mt-3 text-ink">
        Skip the 6:30 walk; safest hours today 2–5 PM. Keep your inhaler with you.
      </p>
      <p data-alert-part className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-brand-hover">
        <ShieldCheck aria-hidden="true" size={14} />
        Checked by the Safety reviewer
      </p>
    </GlassCard>
  )
}

function Legend() {
  return (
    <ul aria-label="Legend" className="flex flex-wrap items-center gap-4 text-sm text-muted">
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className={cn('h-6 w-9 bg-surface', KIND.agent.box)} />
        <KindTag kind="agent" /> dashed, rounded
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className={cn('h-6 w-9 bg-surface', KIND.code.box)} />
        <KindTag kind="code" /> solid, square
      </li>
    </ul>
  )
}

export function AgentFlow() {
  const reduce = usePrefersReducedMotion()
  const pinRef = useRef(null)
  const desktopRef = useRef(null)
  const mobileRef = useRef(null)
  useAgentFlow({ enabled: !reduce, pinRef, desktopRef, mobileRef })

  return (
    <section aria-labelledby="flow-title" className="mx-auto w-full max-w-content px-gutter pt-section sm:px-6">
      <SectionTitle
        id="flow-title"
        eyebrow="Agents at work"
        eyebrowIcon={Sparkles}
        title="What happens behind every alert"
        subtitle="Plain code handles the facts. Four AI agents handle the thinking. Nothing reaches you without a safety check."
      />

      <div ref={pinRef} className="mt-8 flex flex-col gap-6 py-4">
        <Legend />

        {/* ---- Desktop: horizontal flow ---- */}
        <div
          ref={desktopRef}
          role="list"
          aria-label="From data to your alert"
          className="hidden grid-cols-[minmax(0,1fr)_1.75rem_minmax(0,1fr)_1.75rem_minmax(0,1.15fr)_1.75rem_minmax(0,1fr)_1.75rem_minmax(0,1fr)] items-center lg:grid"
        >
          <FlowNode id="gather" />
          <Conn step={1} />
          <FlowNode id="score" />
          <Conn step={2} />
          <div role="listitem" aria-label="Run in parallel" className="relative px-5 py-2">
            <ParallelLabel className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap" />
            {/* fork (left) and merge (right) */}
            <Conn step={2} axis="y" origin="origin-center" className="absolute top-1/4 bottom-1/4 left-0" />
            <Conn step={3} axis="y" origin="origin-center" className="absolute top-1/4 right-0 bottom-1/4" />
            <div role="list" className="flex flex-col gap-4">
              {['context', 'knowledge'].map((id) => (
                <div key={id} className="relative">
                  <Conn step={2} className="absolute top-1/2 -left-5 w-5" />
                  <FlowNode id={id} />
                  <Conn step={3} className="absolute top-1/2 -right-5 w-5" />
                </div>
              ))}
            </div>
          </div>
          <Conn step={3} />
          <FlowNode id="advisor" />
          <Conn step={4} />
          <FlowNode id="safety" />

          {/* Safety reviewer -> your alert */}
          <Conn step={5} axis="y" className="col-start-9 h-10 justify-self-center" />
          <div role="listitem" aria-label="Your alert" className="col-span-5 col-start-5 w-full max-w-md justify-self-end">
            <ExampleAlert />
          </div>
        </div>

        {/* ---- Mobile / tablet: vertical flow ---- */}
        <div ref={mobileRef} role="list" aria-label="From data to your alert" className="flex flex-col lg:hidden">
          <FlowNode id="gather" />
          <Conn step={1} axis="y" className="mx-auto h-7" />
          <FlowNode id="score" />
          <Conn step={2} axis="y" className="mx-auto h-7" />
          <div role="listitem" aria-label="Run in parallel" className="flex flex-col items-center">
            <ParallelLabel className="mb-2" />
            <Conn step={2} origin="origin-center" className="w-1/2" />
            <div role="list" className="grid w-full grid-cols-2 gap-3">
              {['context', 'knowledge'].map((id) => (
                <div key={id} className="flex flex-col items-center">
                  <Conn step={2} axis="y" className="h-4" />
                  <div className="w-full flex-1">
                    <FlowNode id={id} compact />
                  </div>
                  <Conn step={3} axis="y" className="h-4" />
                </div>
              ))}
            </div>
            <Conn step={3} origin="origin-center" className="w-1/2" />
          </div>
          <Conn step={3} axis="y" className="mx-auto h-7" />
          <FlowNode id="advisor" />
          <Conn step={4} axis="y" className="mx-auto h-7" />
          <FlowNode id="safety" />
          <Conn step={5} axis="y" className="mx-auto h-7" />
          <div role="listitem" aria-label="Your alert">
            <ExampleAlert />
          </div>
        </div>
      </div>
    </section>
  )
}
