/*
 * Editable site details (placeholders). Change them here; every page reads from this file.
 * Nothing here is secret: it ships in public browser code.
 */
export const CONTACT_EMAIL = 'contact@example.com' // TODO: replace with the real project email
export const GITHUB_URL = 'https://github.com/YOUR-USERNAME/ecohealth' // TODO: replace with the real repository

export const TEAM = [
  { name: 'Lovepreet Saini', role: 'Frontend & Design' }, // initials: LS
  { name: 'Kanalpreet Kaur', role: 'Backend & AI' }, // initials: KK
]

/** "Lovepreet Saini" -> "LS" (used instead of photos). */
export function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}
