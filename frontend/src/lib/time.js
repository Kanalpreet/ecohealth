/** 14 -> "2 PM", 0 -> "12 AM", 14.5 -> "2:30 PM". Hours are local clock hours. */
export function formatHour(hour) {
  const h = ((Math.floor(hour) % 24) + 24) % 24
  const minutes = Math.round((hour - Math.floor(hour)) * 60)
  const suffix = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return minutes ? `${h12}:${String(minutes).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`
}

/** (14, 17) -> "2–5 PM"; (11, 14) -> "11 AM–2 PM". */
export function formatHourRange(start, end) {
  const a = formatHour(start)
  const b = formatHour(end)
  const [aTime, aSuffix] = a.split(' ')
  const [, bSuffix] = b.split(' ')
  return aSuffix === bSuffix ? `${aTime}–${b}` : `${a}–${b}`
}
