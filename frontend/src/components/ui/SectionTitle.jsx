import { cn } from '../../lib/cn'
import { Pill } from './Pill'

/**
 * Section heading: optional eyebrow pill, title (h2 by default) and subtitle.
 * `title` may contain <Highlight> for the mint marker effect from the inspiration.
 */
export function SectionTitle({ eyebrow, eyebrowIcon, title, subtitle, as: Heading = 'h2', align = 'left', id, className }) {
  const centered = align === 'center'
  return (
    <div className={cn('flex flex-col gap-3', centered ? 'items-center text-center' : 'items-start', className)}>
      {eyebrow && <Pill icon={eyebrowIcon}>{eyebrow}</Pill>}
      <Heading id={id} className="text-h2 font-extrabold">
        {title}
      </Heading>
      {subtitle && <p className={cn('text-lead text-muted', centered && 'max-w-2xl')}>{subtitle}</p>}
    </div>
  )
}

/** Mint highlighter behind a few words of a heading. */
export function Highlight({ children }) {
  return <span className="rounded-[0.4em] bg-brand-soft box-decoration-clone px-[0.18em]">{children}</span>
}
