import { useEffect, useRef } from 'react'
import { cn } from '../../lib/cn'

/*
 * PM2.5 particles: small, soft, translucent grey dots drifting slowly upward on a
 * <canvas> (max 60). Lightweight: one pre-rendered soft-dot sprite drawn with
 * drawImage, no per-frame allocations. The loop runs only while the canvas is on
 * screen (IntersectionObserver) and the tab is visible (requestAnimationFrame).
 * The caller must not render this under reduced motion. Decorative: aria-hidden.
 */
const MAX_PARTICLES = 60

function makeSprite() {
  const size = 64
  const sprite = document.createElement('canvas')
  sprite.width = size
  sprite.height = size
  const g = sprite.getContext('2d')
  const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(110, 118, 124, 1)')
  gradient.addColorStop(0.45, 'rgba(110, 118, 124, 0.55)')
  gradient.addColorStop(1, 'rgba(110, 118, 124, 0)')
  g.fillStyle = gradient
  g.fillRect(0, 0, size, size)
  return sprite
}

export function ParticleField({ count = 56, className }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined

    const sprite = makeSprite()
    const n = Math.min(count, MAX_PARTICLES)
    // Positions are fractions of the canvas size; speeds are fractions per second.
    const particles = Array.from({ length: n }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 3 + Math.random() * 7,
      alpha: 0.12 + Math.random() * 0.28,
      vx: (Math.random() - 0.5) * 0.008,
      vy: -(0.004 + Math.random() * 0.01),
      sway: Math.random() * Math.PI * 2,
    }))

    let width = 0
    let height = 0
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)

    let raf = 0
    let last = 0
    const frame = (time) => {
      const dt = last ? Math.min(0.05, (time - last) / 1000) : 0
      last = time
      ctx.clearRect(0, 0, width, height)
      for (const p of particles) {
        p.sway += dt * 0.4
        p.x += (p.vx + Math.sin(p.sway) * 0.002) * dt
        p.y += p.vy * dt
        if (p.y < -0.05) p.y = 1.05
        if (p.x < -0.05) p.x = 1.05
        if (p.x > 1.05) p.x = -0.05
        const d = p.r * 2
        ctx.globalAlpha = p.alpha
        ctx.drawImage(sprite, p.x * width - p.r, p.y * height - p.r, d, d)
      }
      ctx.globalAlpha = 1
      raf = requestAnimationFrame(frame)
    }
    const start = () => {
      if (!raf) {
        last = 0
        raf = requestAnimationFrame(frame)
      }
    }
    const stop = () => {
      cancelAnimationFrame(raf)
      raf = 0
    }

    // Pause when the hero is off screen.
    const io = new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : stop()))
    io.observe(canvas)

    return () => {
      stop()
      io.disconnect()
      resizeObserver.disconnect()
    }
  }, [count])

  return <canvas ref={canvasRef} aria-hidden="true" className={cn('pointer-events-none absolute inset-0 h-full w-full', className)} />
}
