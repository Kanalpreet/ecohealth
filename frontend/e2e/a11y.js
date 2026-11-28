import AxeBuilder from '@axe-core/playwright'

/** WCAG 2.1 A + AA rules. Serious and critical violations fail the test. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const BLOCKING = new Set(['serious', 'critical'])

/**
 * Waits until every finite animation (page enter fade, count-ups, map fly-in) has finished,
 * so axe measures final colours, not a half-faded page. Endless decorative loops
 * (air drift, skeleton shimmer, "now" ping) are ignored.
 */
async function settle(page) {
  await page.waitForFunction(
    () =>
      document
        .getAnimations()
        .every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity),
    null,
    { timeout: 10_000 },
  )
  await page.waitForTimeout(300) // JS-driven springs (Motion) have no Web Animation object
}

/**
 * Runs axe on the current page and returns a readable list of serious/critical problems
 * ("[page] rule-id (impact): help -> selector :: details"). The map canvas is excluded:
 * it is a drawn image whose information is repeated as text next to it.
 */
export async function axeProblems(page, name) {
  await settle(page)
  const results = await new AxeBuilder({ page }).withTags(TAGS).exclude('.maplibregl-canvas').analyze()
  return results.violations
    .filter((v) => BLOCKING.has(v.impact))
    .flatMap((v) =>
      v.nodes.map((n) => {
        const detail = (n.failureSummary || '').split('\n').slice(1).join(' ').trim()
        return `[${name}] ${v.id} (${v.impact}): ${v.help} -> ${n.target.join(' ')}${detail ? ` :: ${detail}` : ''}`
      }),
    )
}
