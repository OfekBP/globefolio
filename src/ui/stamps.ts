import { flagUrl, type City, type Country } from '../data/geo'
import { cname, getLocale, t } from '../i18n'
import { esc, stampDate } from './format'

// Ink colours of real passport stamps: blue, red, violet, green, brown. All friendly, none harsh.
const INKS = ['#0e7490', '#d6466a', '#4b4fbf', '#1e8e5a', '#8a3fa0', '#c2761a']
const hash = (s: string) => { let h = 7; for (const ch of s) h = (h * 33 + ch.charCodeAt(0)) >>> 0; return h }
const inkOf = (key: string) => INKS[hash(key) % INKS.length]

/** Letter-spacing breaks the joined letters of Arabic and the flow of Hebrew, Chinese and Japanese, so those scripts stamp tight. */
const tight = () => ['ar', 'he', 'zh', 'ja'].includes(getLocale())
const sp = (v: number) => (tight() ? 0 : v)
const upper = (s: string) => s.toLocaleUpperCase(getLocale())

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/**
 * A country stamp as inline SVG. Three shapes (round, square, oval) are picked per country,
 * so a full passport page looks hand-stamped rather than stamped out of one mould.
 */
export function countryStamp(c: Country, since: string | undefined, uid: string): string {
  const iso = c.properties.i
  const ink = inkOf(iso)
  const shape = hash(iso) % 3
  const flag = flagUrl(c)
  const name = esc(short(upper(cname(c)), shape === 0 ? 20 : 17))
  const date = stampDate(since)
  const img = (x: number, y: number, w: number, h: number, clip = '') =>
    flag ? `<image href="${flag}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"${clip ? ` clip-path="url(#${clip})"` : ''}/>` : ''
  const txt = 'font-family="Nunito Variable, Noto Sans Arabic Variable, Noto Sans Hebrew Variable, system-ui, sans-serif" font-weight="800" fill="currentColor"'

  let body = ''
  if (shape === 0) {
    body = `
      <defs>
        <path id="${uid}t" d="M22 60A38 38 0 0 1 98 60"/>
        <path id="${uid}b" d="M15 60A45 45 0 0 0 105 60"/>
        <clipPath id="${uid}c"><circle cx="60" cy="60" r="25"/></clipPath>
      </defs>
      <circle cx="60" cy="60" r="56" fill="none" stroke="currentColor" stroke-width="3.2"/>
      <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="1.2"/>
      <circle cx="60" cy="60" r="31" fill="none" stroke="currentColor" stroke-width="2"/>
      <text ${txt} font-size="11.5" letter-spacing="${sp(1.6)}" text-anchor="middle"><textPath href="#${uid}t" startOffset="50%">${name}</textPath></text>
      <text ${txt} font-size="9.5" letter-spacing="${sp(1.4)}" text-anchor="middle"><textPath href="#${uid}b" startOffset="50%">${date}</textPath></text>
      ${img(35, 35, 50, 50, `${uid}c`)}
      <circle cx="12" cy="60" r="2.2" fill="currentColor" opacity="0"/>`
  } else if (shape === 1) {
    body = `
      <defs><clipPath id="${uid}c"><rect x="34" y="40" width="52" height="34" rx="5"/></clipPath></defs>
      <rect x="4" y="4" width="112" height="112" rx="18" fill="none" stroke="currentColor" stroke-width="3.2"/>
      <rect x="11" y="11" width="98" height="98" rx="12" fill="none" stroke="currentColor" stroke-width="1.2"/>
      <text ${txt} x="60" y="30" font-size="11" letter-spacing="${sp(1.5)}" text-anchor="middle">${name}</text>
      ${img(34, 40, 52, 34, `${uid}c`)}
      <rect x="34" y="40" width="52" height="34" rx="5" fill="none" stroke="currentColor" stroke-width="1.6"/>
      <text ${txt} x="60" y="91" font-size="9" letter-spacing="${sp(3)}" text-anchor="middle">${t('stamp.arrival')}</text>
      <text ${txt} x="60" y="104" font-size="9.5" letter-spacing="${sp(1.2)}" text-anchor="middle">${date}</text>`
  } else {
    body = `
      <defs><clipPath id="${uid}c"><circle cx="60" cy="65" r="17"/></clipPath></defs>
      <ellipse cx="60" cy="60" rx="57" ry="44" fill="none" stroke="currentColor" stroke-width="3.2"/>
      <ellipse cx="60" cy="60" rx="51" ry="38" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2.4 3"/>
      <text ${txt} x="60" y="38" font-size="10" letter-spacing="${sp(1.2)}" text-anchor="middle">${name}</text>
      ${img(43, 48, 34, 34, `${uid}c`)}
      <circle cx="60" cy="65" r="17" fill="none" stroke="currentColor" stroke-width="1.6"/>
      <text ${txt} x="60" y="94" font-size="9" letter-spacing="${sp(1.2)}" text-anchor="middle">${date}</text>`
  }
  return `<svg class="stamp-svg" viewBox="0 0 120 120" style="color:${ink}" role="img" aria-label="${esc(t('stamp.aria', { name: cname(c) }))}">${body}</svg>`
}

/** A smaller, wide stamp for a single city, like a transit or city-entry stamp. */
export function cityStamp(city: City, country: Country | undefined, since: string | undefined, uid: string): string {
  const ink = inkOf(city.key)
  const flag = country ? flagUrl(country) : ''
  const txt = 'font-family="Nunito Variable, Noto Sans Arabic Variable, Noto Sans Hebrew Variable, system-ui, sans-serif" font-weight="800" fill="currentColor"'
  return `<svg class="stamp-svg wide" viewBox="0 0 160 84" style="color:${ink}" role="img" aria-label="${esc(t('stamp.aria', { name: city.name }))}">
    <defs><clipPath id="${uid}c"><circle cx="34" cy="42" r="19"/></clipPath></defs>
    <rect x="3" y="3" width="154" height="78" rx="14" fill="none" stroke="currentColor" stroke-width="3"/>
    <rect x="8.5" y="8.5" width="143" height="67" rx="10" fill="none" stroke="currentColor" stroke-width="1.1"/>
    ${flag ? `<image href="${flag}" x="15" y="23" width="38" height="38" preserveAspectRatio="xMidYMid slice" clip-path="url(#${uid}c)"/>` : ''}
    <circle cx="34" cy="42" r="19" fill="none" stroke="currentColor" stroke-width="1.6"/>
    <text ${txt} x="62" y="36" font-size="14" letter-spacing="${sp(0.4)}">${esc(short(city.name.toUpperCase(), 11))}</text>
    <text ${txt} x="62" y="50" font-size="7.5" letter-spacing="${sp(1.5)}">${esc(short(upper(country ? cname(country) : ''), 20))}</text>
    <text ${txt} x="62" y="64" font-size="8" letter-spacing="${sp(1)}">${stampDate(since)}</text>
  </svg>`
}
