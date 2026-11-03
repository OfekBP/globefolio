import { CONTINENTS, flagUrl, type Country } from '../data/geo'
import type { Trip } from '../store'
import { esc, fmtRange, plural } from './format'
import { icons } from './icons'

export interface StoryModel {
  countries: { country: Country; cities: number; trips: number; whole: boolean; since?: string }[]
  cityCount: number
  tripCount: number
  continents: Set<string>
  km: number
  worldTotal: number
  recent: { trip: Trip; country: Country }[]
  upcoming: { trip: Trip; country: Country; days: number }[]
  farthest?: { name: string; km: number }
  hasHome: boolean
  asOf?: number
}

const EARTH_KM = 40075
const num = (n: number) => Math.round(n).toLocaleString('en')
const MILESTONES = [
  { at: 1, label: 'First stamp' }, { at: 5, label: 'Five countries' }, { at: 10, label: 'Double digits' },
  { at: 25, label: 'Quarter century' }, { at: 50, label: 'Fifty and counting' },
]

function renderUpcoming(m: StoryModel) {
  if (!m.upcoming.length) return ''
  const when = (d: number) => (d <= 0 ? 'Today' : d === 1 ? 'Tomorrow' : `In ${d} days`)
  return `
    <h3 class="section">Coming up</h3>
    <ul class="log upcoming">${m.upcoming.slice(0, 4).map(({ trip, country, days }) => `
      <li><button class="log-row" data-trip="${esc(trip.id)}" data-country="${esc(country.properties.i)}">
        ${flag(country)}
        <span class="lr-main"><b>${esc(trip.place?.name ?? country.properties.n)}</b><small>${esc(country.properties.n)}</small></span>
        <time class="soon">${when(days)}</time>
      </button></li>`).join('')}</ul>`
}

function renderStamps(m: StoryModel) {
  const n = m.countries.length
  const done = MILESTONES.filter(x => n >= x.at)
  const next = MILESTONES.find(x => n < x.at)
  const stamps = [...m.countries].sort((a, b) => (a.since ?? '9').localeCompare(b.since ?? '9'))
  const badges = [...done.map(x => x.label), ...(m.continents.size >= CONTINENTS.length ? ['Every continent'] : [])]
  return `
    <h3 class="section">Your passport</h3>
    <ul class="stamps">${stamps.slice(0, 12).map((c, i) => `
      <li class="stamp" style="--tilt:${[-6, 4, -3, 7, -8, 2][i % 6]}deg">
        <span>${esc(c.country.properties.n)}</span>${flag(c.country)}<small>${c.since ? esc(fmtRange(c.since, undefined)) : 'Visited'}</small>
      </li>`).join('')}</ul>
    <p class="t-note passport-note">${badges.length ? badges.map(b => `<span class="badge">${esc(b)}</span>`).join('') : ''}${next ? ` Next stamp goal: ${next.label.toLowerCase()} (${next.at - n} to go).` : ''}</p>`
}

const flag = (c: Country) => (flagUrl(c) ? `<img class="flag" src="${flagUrl(c)}" alt="" />` : '')

export function renderStory(m: StoryModel): string {
  if (!m.tripCount) {
    return `
      <div class="empty">
        <h2 class="headline">Your map is waiting.</h2>
        <p class="sub">Search a city and watch it light up. Every city you add brings its country along.</p>
        <button class="solid" data-act="log">Log your first trip</button>
      </div>`
  }

  const n = m.countries.length
  const pct = Math.round((n / m.worldTotal) * 100)
  const rounds = m.km / EARTH_KM
  const around = rounds >= 1
    ? `That's ${rounds.toFixed(1).replace(/\.0$/, '')}× around the Earth.`
    : m.km > 0 ? `That's ${Math.max(1, Math.round(rounds * 100))}% of the way around the Earth.` : ''
  const lead = m.asOf ? `By ${m.asOf} you'd explored` : "You've explored"

  return `
    <div class="hero-copy">
      <h2 class="headline">${lead} <mark>${plural(n, 'country', 'countries')}</mark>${m.cityCount ? ` and <mark>${plural(m.cityCount, 'city', 'cities')}</mark>` : ''}.</h2>
      <p class="sub">${[around, m.farthest ? `Farthest from home: ${esc(m.farthest.name)}, ${num(m.farthest.km)} km.` : ''].filter(Boolean).join(' ')}</p>
    </div>

    <div class="tiles">
      <div class="tile t-world">
        <span class="t-icon">${icons.globe}</span>
        <p class="t-label">World explored</p>
        <p class="t-big">${pct}<span>%</span></p>
        <div class="bar" role="img" aria-label="${pct}% of the world"><i style="width:${Math.max(2, pct)}%"></i></div>
        <p class="t-note">${n} of ${m.worldTotal} countries</p>
      </div>
      <div class="tile t-cont">
        <span class="t-icon">${icons.compass}</span>
        <p class="t-label">Continents</p>
        <p class="t-big">${m.continents.size}<span> of ${CONTINENTS.length}</span></p>
        <ul class="cont">${CONTINENTS.map(c => `<li class="${m.continents.has(c) ? 'on' : ''}">${c}</li>`).join('')}</ul>
      </div>
      <div class="tile t-km">
        <span class="t-icon">${icons.route}</span>
        <p class="t-label">Distance traveled</p>
        ${m.hasHome
          ? `<p class="t-big">${num(m.km)}<span> km</span></p><p class="t-note">Round trips from home</p>`
          : `<p class="t-note">Set a home city and Trip Track will measure every trip.</p><button class="text" data-act="home-search">Choose home</button>`}
      </div>
      <div class="tile t-trips">
        <span class="t-icon">${icons.pin}</span>
        <p class="t-label">Trips logged</p>
        <p class="t-big">${m.tripCount}</p>
        <p class="t-note">${m.cityCount} ${m.cityCount === 1 ? 'city' : 'cities'} lit</p>
      </div>
    </div>

    <h3 class="section">Places you've lit</h3>
    <ul class="flags">${m.countries.map(c => `
      <li><button class="flagchip" data-country="${esc(c.country.properties.i)}">
        ${flag(c.country)}<span class="fc-name">${esc(c.country.properties.n)}</span>
        <small>${c.whole && !c.cities ? 'Whole country' : plural(c.cities, 'city', 'cities')}</small>
      </button></li>`).join('')}</ul>

    ${renderUpcoming(m)}
    ${renderStamps(m)}
    <h3 class="section">Recent trips</h3>
    <ul class="log">${m.recent.map(({ trip, country }) => `
      <li><button class="log-row" data-trip="${esc(trip.id)}" data-country="${esc(country.properties.i)}">
        ${flag(country)}
        <span class="lr-main"><b>${esc(trip.place?.name ?? country.properties.n)}</b><small>${trip.place ? esc(country.properties.n) : 'Whole country'}</small></span>
        <time>${fmtRange(trip.startDate, trip.endDate)}</time>
        ${trip.notes ? `<span class="lr-note">${esc(trip.notes)}</span>` : ''}
      </button></li>`).join('')}</ul>`
}
