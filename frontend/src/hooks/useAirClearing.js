import { useEffect } from 'react'

/**
 * Home hero signature animation "the air clears" (docs/frontend.md §8).
 * GSAP + ScrollTrigger are loaded with a dynamic import (their own lazy chunks, only
 * on the Home page). Scrubbed to scroll through the hero: the PM2.5 particle layer
 * fades out and drifts up, the grey haze wash fades, and a brighter clean-air
 * gradient fades in. Only opacity and transform are animated. When `enabled` is false
 * (reduced motion) nothing is loaded and the caller renders the clear version.
 */
export function useAirClearing({ enabled, triggerRef, particlesRef, hazeRef, brightRef }) {
  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    let ctx = null

    Promise.all([import('gsap'), import('gsap/ScrollTrigger')])
      .then(([{ gsap }, { ScrollTrigger }]) => {
        if (cancelled || !triggerRef.current) return
        gsap.registerPlugin(ScrollTrigger)
        ctx = gsap.context(() => {
          gsap
            .timeline({
              defaults: { ease: 'none' },
              scrollTrigger: { trigger: triggerRef.current, start: 'top top', end: 'bottom 35%', scrub: 0.6 },
            })
            .fromTo(particlesRef.current, { opacity: 1, yPercent: 0 }, { opacity: 0, yPercent: -8 }, 0)
            .fromTo(hazeRef.current, { opacity: 1 }, { opacity: 0 }, 0)
            .fromTo(brightRef.current, { opacity: 0 }, { opacity: 1 }, 0)
        }, triggerRef)
      })
      .catch(() => {
        // If the chunk can't load, show clear air rather than leaving the haze.
        if (particlesRef.current) particlesRef.current.style.opacity = '0'
        if (hazeRef.current) hazeRef.current.style.opacity = '0'
        if (brightRef.current) brightRef.current.style.opacity = '1'
      })

    return () => {
      cancelled = true
      ctx?.revert()
    }
  }, [enabled, triggerRef, particlesRef, hazeRef, brightRef])
}
