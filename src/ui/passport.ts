import { CONTINENTS, type City, type Country } from '../data/geo'
import { esc, plural } from './format'
import { icons } from './icons'
import { cityStamp, countryStamp } from './stamps'

export interface PassportModel {
  countries: { country: Country; since?: string }[]
  cities: { city: City; country?: Country; since?: string }[]
  continents: Set<string>
}

const MILESTONES = [
  { at: 1, label: 'First stamp' }, { at: 5, label: 'Five countries' }, { at: 10, label: 'Double digits' },
  { at: 25, label: 'Quarter century' }, { at: 50, label: 'Fifty strong' },
]

const PER_PAGE = 6
const tilt = (i: number) => [-5, 3, -2, 6, -7, 2, 4, -3][i % 8]

function page(title: string, no: number, inner: string) {
  return `<section class="pp">
    <header><span>${title}</span><span>${String(no).padStart(2, '0')}</span></header>
    <div class="pp-grid">${inner}</div>
    <footer><i></i>TRIP TRACK<i></i></footer>
  </section>`
}

export function renderPassport(m: PassportModel): string {
  const n = m.countries.length
  const done = MILESTONES.filter(x => n >= x.at)
  const next = MILESTONES.find(x => n < x.at)
  const badges = [...done.map(x => x.label), ...(m.continents.size >= CONTINENTS.length ? ['Every continent'] : [])]

  const cover = `
    <section class="cover" aria-label="Passport cover">
      <div class="cover-ring">${icons.globe}</div>
      <p class="cover-kicker">TRIP TRACK</p>
      <h2>PASSPORT</h2>
      <p class="cover-sub">${n ? `${plural(n, 'country', 'countries')} · ${plural(m.cities.length, 'city', 'cities')}` : 'Open to stamp your first trip'}</p>
    </section>`

  let pages = ''
  if (!n && !m.cities.length) {
    pages = page('VISAS', 1, [0, 1, 2].map(i => `<div class="ghost" style="--rot:${tilt(i)}deg"><span>${icons.plus}</span></div>`).join('')) +
      `<p class="pp-empty">Log a trip and your first stamp lands right here.</p>`
  } else {
    for (let p = 0; p * PER_PAGE < m.countries.length; p++) {
      const chunk = m.countries.slice(p * PER_PAGE, (p + 1) * PER_PAGE)
      pages += page('VISAS', p + 1, chunk.map((c, i) => `
        <button class="st" data-country="${esc(c.country.properties.i)}" style="--rot:${tilt(i + p)}deg;--i:${p * PER_PAGE + i}" aria-label="${esc(c.country.properties.n)}">
          ${countryStamp(c.country, c.since, `s${p}${i}`)}
        </button>`).join(''))
    }
    for (let p = 0; p * 8 < m.cities.length; p++) {
      const chunk = m.cities.slice(p * 8, (p + 1) * 8)
      pages += page('CITIES', p + 1, chunk.map((c, i) => `
        <button class="st wide" data-city="${esc(c.city.key)}" style="--rot:${tilt(i + 2)}deg;--i:${i}" aria-label="${esc(c.city.name)}">
          ${cityStamp(c.city, c.country, c.since, `c${p}${i}`)}
        </button>`).join(''))
    }
  }

  const goals = `
    <section class="goals">
      ${badges.length ? `<div class="badges">${badges.map(b => `<span class="badge">${esc(b)}</span>`).join('')}</div>` : ''}
      ${next ? `<p class="goal">Next stamp goal: <b>${next.label.toLowerCase()}</b>, ${next.at - n} to go.</p>` : ''}
    </section>`

  return cover + goals + pages
}
