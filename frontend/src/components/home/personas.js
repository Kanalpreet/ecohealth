/*
 * SAMPLE data for the Home hero persona switcher. Illustrative only: not a forecast,
 * not produced by the risk engine, not medical advice. The explanations describe how
 * the real engine weighs people (backend risk_config.py: asthma x1.5 and heart disease
 * x1.4 on air quality; age modifiers for children 5-11 and adults 65+).
 */
export const SAMPLE_AQI = 240 // CPCB "Poor"
export const SAMPLE_NOW = 11 // 11 AM, for the "now" marker

export const PERSONAS = [
  {
    id: 'priya',
    name: 'Priya',
    age: 34,
    detail: 'Asthma',
    level: 'High',
    safe: [{ start: 14, end: 17 }],
    why: 'Asthma makes poor air count more in her score, so today is High for her.',
  },
  {
    id: 'aarav',
    name: 'Aarav',
    age: 6,
    detail: null,
    level: 'Moderate',
    safe: [{ start: 13, end: 17 }],
    why: 'Young children get extra weight in the score, which lifts him to Moderate.',
  },
  {
    id: 'papa',
    name: 'Papa',
    age: 68,
    detail: 'Heart condition',
    level: 'Very High',
    safe: [{ start: 15, end: 16 }],
    why: 'Being over 65 and a heart condition both add weight, so his risk is Very High.',
  },
]
