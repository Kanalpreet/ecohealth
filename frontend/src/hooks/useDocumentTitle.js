import { useEffect } from 'react'
import { DEFAULT_DESCRIPTION, SITE_TITLE } from '../lib/seo'

function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

/**
 * Sets the browser tab title ("Log in · EcoHealth") and, for sharing/SEO, the meta
 * description plus og:title / og:description / og:url. Pass a description on public pages;
 * app pages fall back to the site default (they are behind login and not indexed).
 */
export function useDocumentTitle(title, description = DEFAULT_DESCRIPTION) {
  useEffect(() => {
    const full = title ? `${title} · EcoHealth` : SITE_TITLE
    document.title = full
    setMeta('name', 'description', description)
    setMeta('property', 'og:title', full)
    setMeta('property', 'og:description', description)
    setMeta('property', 'og:url', window.location.origin + window.location.pathname)
  }, [title, description])
}
