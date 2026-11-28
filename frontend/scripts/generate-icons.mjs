/*
 * Generates the PNG app icons and the social sharing image from the logo mark
 * (public/favicon.svg) using Playwright's Chromium. Run after changing the logo:
 *
 *   node scripts/generate-icons.mjs        (from frontend/)
 *
 * Output (committed): public/icons/*.png and public/og-image.png.
 * No nature imagery: the air-flow mark on the brand gradient only.
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = new URL('../public/', import.meta.url)
const svg = readFileSync(new URL('favicon.svg', root), 'utf8')
mkdirSync(new URL('icons/', root), { recursive: true })

// The mark's lines and dot, without the rounded square (for full-bleed icons).
const MARK_LINES = `
  <g fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7.5 12.5h10a3 3 0 1 0-3-3"/><path d="M7.5 17h15a3 3 0 1 1-3 3"/><path d="M7.5 21.5h6.5" stroke-opacity=".75"/>
  </g><circle cx="24.5" cy="9" r="1.7" fill="#86d29e"/>`
const GRADIENT = 'linear-gradient(45deg, #14532d, #1f9150)'

// Full-bleed square (iOS rounds the corners itself; maskable icons keep the mark in the
// central 80% "safe zone").
const fullBleed = (scale) => `
  <div style="width:100vw;height:100vh;background:${GRADIENT};display:flex;align-items:center;justify-content:center">
    <svg viewBox="0 0 32 32" style="width:${scale}%;height:${scale}%">${MARK_LINES}</svg>
  </div>`

const ICONS = [
  { file: 'icons/icon-192.png', size: 192, html: `<div style="width:100vw;height:100vh">${svg.replace('<svg ', '<svg style="width:100%;height:100%" ')}</div>` },
  { file: 'icons/icon-512.png', size: 512, html: `<div style="width:100vw;height:100vh">${svg.replace('<svg ', '<svg style="width:100%;height:100%" ')}</div>` },
  { file: 'icons/icon-maskable-512.png', size: 512, html: fullBleed(62) },
  { file: 'icons/apple-touch-icon.png', size: 180, html: fullBleed(78) },
]

const OG = `
  <div style="width:1200px;height:630px;box-sizing:border-box;padding:72px 80px;display:flex;flex-direction:column;justify-content:space-between;
    font-family:'Segoe UI',system-ui,sans-serif;color:#10241a;
    background:radial-gradient(60% 70% at 85% 10%, #ffffff 0%, transparent 70%), radial-gradient(50% 60% at 10% 90%, #cdeed7 0%, transparent 70%), linear-gradient(135deg,#f5faf6,#e2f0fa)">
    <div style="display:flex;align-items:center;gap:20px">
      ${svg.replace('<svg ', '<svg style="width:88px;height:88px" ')}
      <span style="font-size:44px;font-weight:800;letter-spacing:-0.02em">EcoHealth</span>
    </div>
    <div>
      <div style="font-size:72px;font-weight:800;line-height:1.05;letter-spacing:-0.03em">Stay healthy in a<br><span style="color:#15803d">changing climate.</span></div>
      <div style="margin-top:24px;font-size:30px;color:#4a5d52">Personal air, heat, UV and altitude risk for every member of your family.</div>
    </div>
  </div>`

const browser = await chromium.launch()
const page = await browser.newPage()
for (const { file, size, html } of ICONS) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<body style="margin:0">${html}</body>`)
  await page.screenshot({ path: fileURLToPath(new URL(file, root)), omitBackground: true })
  console.log('wrote public/' + file)
}
await page.setViewportSize({ width: 1200, height: 630 })
await page.setContent(`<body style="margin:0">${OG}</body>`)
await page.screenshot({ path: fileURLToPath(new URL('og-image.png', root)) })
console.log('wrote public/og-image.png')
await browser.close()
