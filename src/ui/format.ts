import { getLocale, t } from '../i18n'

/** Today as YYYY-MM-DD in the phone's own timezone (toISOString would be UTC and flip a day early or late). */
export const localToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(`${getLocale()}-u-nu-latn`, { timeZone: 'UTC', ...o })
const at = (d: string) => new Date(`${d}T00:00:00Z`)

/** "3-9 Apr 2024" style ranges from ISO dates, worded and ordered the way the chosen language writes them. */
export function fmtRange(start?: string, end?: string): string {
  if (!start && !end) return t('date.undated')
  const f = fmt({ day: 'numeric', month: 'short', year: 'numeric' })
  try {
    if (!start || !end || start === end) return f.format(at((start ?? end)!))
    return f.formatRange(at(start), at(end))
  } catch { return start ?? end ?? '' }
}

/** A stamp date such as 03 APR 2024, in the chosen language. */
export function stampDate(d?: string): string {
  if (!d) return t('stamp.visited')
  return fmt({ day: '2-digit', month: 'short', year: 'numeric' }).format(at(d)).replace(/,/g, '').toLocaleUpperCase(getLocale())
}

export const yearOf = (d?: string) => (d ? Number(d.slice(0, 4)) : undefined)

/** "3 countries", "1 city", ... with the right plural form for the language. */
export const count = (kind: 'country' | 'city' | 'trip' | 'cityLit', n: number) => t(`n.${kind}`, { n })
