/*
 * Page titles and meta descriptions for the public site (search results and link previews).
 * Keep them short (under ~160 characters) and true to the page; no medical claims.
 */
export const SITE_TITLE = 'EcoHealth: Climate Health for Families'

export const DEFAULT_DESCRIPTION =
  'EcoHealth turns air pollution, heat, cold, UV and altitude into clear, personal risk awareness for every member of your family.'

export const PAGE_DESCRIPTIONS = Object.freeze({
  home: DEFAULT_DESCRIPTION,
  features:
    'Family risk scores, a safe-hours timeline, "why this score?" breakdowns, smart alerts and travel health plans, explained with examples.',
  howItWorks:
    'How EcoHealth works: live environmental data, a deterministic risk score in plain code, AI agents for guidance, and a safety reviewer.',
  forFamilies:
    'The same air affects a child, a parent with asthma and a grandparent differently. See how EcoHealth personalises risk for each person.',
  about: 'About EcoHealth, a final-year B.Tech project on climate and health, the problem it addresses and the data sources it uses.',
  privacy: 'What EcoHealth stores, why, and how to download or delete it. Your home location is rounded to about 1 km.',
  contact: 'Contact the EcoHealth team with questions or feedback.',
  login: 'Log in to see today\'s climate-health picture for your family.',
  register: 'Create a free EcoHealth account and get personal climate-health risk awareness for your family.',
})
