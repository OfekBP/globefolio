import { CONTINENTS, type City, type Country } from '../data/geo'
import { cname, t } from '../i18n'
import { count, esc } from './format'
import { icons } from './icons'
import { cityStamp, countryStamp } from './stamps'

export interface PassportModel {
  countries: { country: Country; since?: string }[]
  cities: { city: City; country?: Country; since?: string }[]
  continents: Set<string>
}

const MILESTONES = [1, 5, 10, 25, 50]

const PER_PAGE = 6
const tilt = (i: number) => [-5, 3, -2, 6, -7, 2, 4, -3][i % 8]

function page(title: string, no: number, inner: string) {
  return `<section class="pp">
    <header><span>${title}</span><span>${String(no).padStart(2, '0')}</span></header>
    <div class="pp-grid">${inner}</div>
    <footer><i></i>${t('pp.brand')}<i></i></footer>
  </section>`
}

export function renderPassport(m: PassportModel): string {
  const n = m.countries.length
  const done = MILESTONES.filter(at => n >= at)
  const next = MILESTONES.find(at => n < at)
  const badges = [...done.map(at => t(`pp.m${at}`)), ...(m.continents.size >= CONTINENTS.length ? [t('pp.allContinents')] : [])]

  const cover = `
    <section class="cover" aria-label="${t('pp.cover')}">
      <svg class="cv-emblem" viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="54" fill="#FFC93C"/>
        <g fill="none" stroke="#0E7490" stroke-width="3" stroke-linecap="round" opacity=".55">
          <ellipse cx="60" cy="60" rx="54" ry="20"/><ellipse cx="60" cy="60" rx="22" ry="54"/><path d="M6 60h108"/>
        </g>
        <path d="M60 24c-12.4 0-22 9.3-22 21 0 15.4 22 40 22 40s22-24.6 22-40c0-11.7-9.6-21-22-21z" fill="#FF6F8E" stroke="#FFF8EC" stroke-width="5" stroke-linejoin="round"/>
        <circle cx="60" cy="45" r="8" fill="#FFF8EC"/>
      </svg>
      <h2>${t('pp.title')}</h2>
      <p class="cover-kicker">GlobeFolio</p>
      <p class="cover-sub">${n ? `<span>${count('country', n)}</span><span>${count('city', m.cities.length)}</span>` : `<span>${t('pp.empty')}</span>`}</p>
    </section>`

  let pages = ''
  if (!n && !m.cities.length) {
    pages = page(t('pp.visas'), 1, [0, 1, 2].map(i => `<div class="ghost" style="--rot:${tilt(i)}deg"><span>${icons.plus}</span></div>`).join('')) +
      `<p class="pp-empty">${t('pp.emptyPage')}</p>`
  } else {
    for (let p = 0; p * PER_PAGE < m.countries.length; p++) {
      const chunk = m.countries.slice(p * PER_PAGE, (p + 1) * PER_PAGE)
      pages += page(t('pp.visas'), p + 1, chunk.map((c, i) => `
        <button class="st" data-country="${esc(c.country.properties.i)}" style="--rot:${tilt(i + p)}deg;--i:${p * PER_PAGE + i}" aria-label="${esc(cname(c.country))}">
          ${countryStamp(c.country, c.since, `s${p}${i}`)}
        </button>`).join(''))
    }
    for (let p = 0; p * 8 < m.cities.length; p++) {
      const chunk = m.cities.slice(p * 8, (p + 1) * 8)
      pages += page(t('pp.cities'), p + 1, chunk.map((c, i) => `
        <button class="st wide" data-city="${esc(c.city.key)}" style="--rot:${tilt(i + 2)}deg;--i:${i}" aria-label="${esc(c.city.name)}">
          ${cityStamp(c.city, c.country, c.since, `c${p}${i}`)}
        </button>`).join(''))
    }
  }

  const goals = `
    <section class="goals">
      ${badges.length ? `<div class="badges">${badges.map(b => `<span class="badge">${esc(b)}</span>`).join('')}</div>` : ''}
      ${next ? `<p class="goal">${t('pp.next', { label: `<b>${t(`pp.m${next}`)}</b>`, n: next - n })}</p>` : ''}
    </section>`

  return cover + goals + pages
}
