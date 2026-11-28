import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The browser only calls same-origin /api/* URLs (docs/frontend.md §2).
// In development this proxy forwards them to FastAPI and removes the /api prefix
// (backend routes are /auth/..., /me, ...). DEV_API_TARGET has no VITE_ prefix on
// purpose: it is read here in Node only and never bundled into browser code.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.DEV_API_TARGET || 'http://localhost:8000'

  return {
    plugins: [react(), tailwindcss()],
    // Dependencies that are only reached through lazy imports (MapLibre via the lazy
    // MapView) are otherwise discovered mid-session: Vite then re-optimizes, the old
    // optimized file answers "504 Outdated Optimize Dep" and the dynamic import fails.
    // Pre-bundling them when the dev server starts avoids that. Dev only; no effect on builds.
    optimizeDeps: {
      include: ['maplibre-gl'],
    },
    // Long-lived vendor chunks for the libraries every page needs. They change far less
    // often than our code, so after a deploy browsers keep them cached and only download
    // the small app chunks again. Heavy optional libraries (MapLibre, Recharts, GSAP, zod,
    // react-hook-form) are NOT listed: they stay in the lazy chunks of the pages that use them.
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 3 },
              { name: 'vendor-router', test: /node_modules[\\/]react-router[\\/]/, priority: 2 },
              { name: 'vendor-motion', test: /node_modules[\\/](motion|framer-motion|motion-dom|motion-utils)[\\/]/, priority: 2 },
              { name: 'vendor-query', test: /node_modules[\\/]@tanstack[\\/]/, priority: 2 },
            ],
          },
        },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: false,
          xfwd: true, // adds X-Forwarded-For so the backend's per-IP login limit sees the client
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  }
})
