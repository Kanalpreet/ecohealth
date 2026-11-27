import { useEffect } from 'react'

/**
 * How it Works signature animation "Agents at work" (docs/frontend.md §8).
 * GSAP + ScrollTrigger load via dynamic import (lazy chunks, public pages only).
 * Scrubbed to scroll, step by step: connectors draw (scaleX / scaleY from 0), then the
 * next node lights up (glow layer opacity + a tiny scale), the two agents in parallel
 * light up together, and finally the example alert card builds in.
 *  - Desktop (>= 1024 px): the horizontal flow is pinned while the steps play.
 *  - Mobile/tablet: the vertical flow plays as it scrolls past; no pinning.
 * Targets use data attributes: data-conn="<step>" data-axis="x|y", data-node="<step>",
 * data-glow, data-alert, data-alert-part. Only transform and opacity animate.
 * Not called under reduced motion: the markup's default state is the complete flow.
 */
const STEPS = 5 // node steps 0..4; the alert is step 5

export function useAgentFlow({ enabled, pinRef, desktopRef, mobileRef }) {
  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    let mm = null

    Promise.all([import('gsap'), import('gsap/ScrollTrigger')])
      .then(([{ gsap }, { ScrollTrigger }]) => {
        if (cancelled) return
        gsap.registerPlugin(ScrollTrigger)

        const build = (tree, scrollTrigger) => {
          if (!tree) return
          const q = gsap.utils.selector(tree)
          const tl = gsap.timeline({ defaults: { ease: 'none', duration: 1 }, scrollTrigger })
          for (let s = 0; s <= STEPS; s++) {
            const at = `step${s}`
            tl.addLabel(at)
            const x = q(`[data-conn="${s}"][data-axis="x"]`)
            const y = q(`[data-conn="${s}"][data-axis="y"]`)
            if (x.length) tl.fromTo(x, { scaleX: 0 }, { scaleX: 1 }, at)
            if (y.length) tl.fromTo(y, { scaleY: 0 }, { scaleY: 1 }, at)
            const drawn = x.length || y.length ? '>' : at
            if (s < STEPS) {
              const nodes = q(`[data-node="${s}"]`)
              tl.fromTo(nodes, { scale: 0.97 }, { scale: 1, duration: 0.6 }, drawn)
              tl.fromTo(q(`[data-node="${s}"] [data-glow]`), { opacity: 0 }, { opacity: 1, duration: 0.6 }, '<')
            } else {
              tl.fromTo(q('[data-alert]'), { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.8 }, drawn)
              tl.fromTo(
                q('[data-alert-part]'),
                { opacity: 0, y: 8 },
                { opacity: 1, y: 0, duration: 0.5, stagger: 0.25 },
                '>-0.2',
              )
            }
          }
          // Short hold so the finished alert stays on screen before the pin releases.
          tl.to({}, { duration: 1.2 })
        }

        mm = gsap.matchMedia()
        mm.add('(min-width: 1024px)', () => {
          build(desktopRef.current, {
            trigger: pinRef.current,
            start: 'center center',
            end: '+=1300',
            pin: true,
            scrub: 0.6,
          })
        })
        mm.add('(max-width: 1023.98px)', () => {
          build(mobileRef.current, {
            trigger: mobileRef.current,
            start: 'top 75%',
            end: 'bottom 65%',
            scrub: 0.6,
          })
        })
      })
      .catch(() => {
        // Chunk failed to load: the markup already shows the complete, static flow.
      })

    return () => {
      cancelled = true
      mm?.revert()
    }
  }, [enabled, pinRef, desktopRef, mobileRef])
}
