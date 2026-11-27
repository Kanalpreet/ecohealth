/**
 * Return `next` only if it is a same-site path, otherwise `fallback`.
 * Prevents open redirects such as /login?next=https://evil.example or //evil.example.
 */
export function safeNext(next, fallback = '/dashboard') {
  if (typeof next !== 'string' || next.length === 0 || next.length > 2048) return fallback
  // Must start with exactly one "/" (not "//" or "/\", which browsers treat as another host).
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback
  // No control characters or backslashes at all (browsers strip tabs/newlines, so
  // "/\t/evil.example" would become "//evil.example").
  for (const char of next) {
    const code = char.charCodeAt(0)
    if (code < 0x20 || code === 0x7f || char === '\\') return fallback
  }
  try {
    const url = new URL(next, window.location.origin)
    if (url.origin !== window.location.origin) return fallback
    // Don't bounce back into the auth pages themselves.
    if (url.pathname === '/login' || url.pathname === '/register') return fallback
    return url.pathname + url.search + url.hash
  } catch {
    return fallback
  }
}

/** Build /login?next=<current page> for a redirect from a protected route. */
export function loginPathFor(location) {
  const here = location.pathname + location.search + location.hash
  return here && here !== '/' ? `/login?next=${encodeURIComponent(here)}` : '/login'
}
