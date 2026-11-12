import { CONTINENTS, flagUrl, placeName, type Country } from '../data/geo'
import { cname, num as fmtNum, t } from '../i18n'
import { inUnits, prefs } from '../prefs'
import type { Trip, Wish } from '../store'
import { count, esc, fmtRange } from './format'
import { icons } from './icons'

export interface StoryModel {
  countries: { country: Country; cities: number; trips: number; whole: boolean; since?: string }[]
  cityCount: number
  tripCount: number
  continents: Set<string>
  km: number
  worldTotal: number
  recent: { trip: Trip; country: Country }[]
  wishes: { wish: Wish; country: Country }[]
  upcoming: { trip: Trip; country: Country; days: number }[]
  farthest?: { name: string; km: number }
  hasHome: boolean
  asOf?: number
  homeName?: string
  theme: 'light' | 'dark'
  /** present only when the app is connected to a backend */
  account?: { handle?: string; name?: string; signedIn: boolean }
}

const EARTH_KM = 40075
const num = (n: number) => fmtNum(Math.round(n))
const mi = () => prefs().units === 'mi'
function upcoming(m: StoryModel) {
  if (!m.upcoming.length) return ''
  const when = (d: number) => (d <= 0 ? t('when.today') : d === 1 ? t('when.tomorrow') : t('when.inDays', { n: d }))
  return `
    <h3 class="section">${t('section.upcoming')}</h3>
    <ul class="log upcoming">${m.upcoming.slice(0, 4).map(({ trip, country, days }) => `
      <li><button class="log-row" data-trip="${esc(trip.id)}" data-country="${esc(country.properties.i)}">
        ${flag(country)}
        <span class="lr-main"><b>${esc(trip.place ? placeName(trip.iso, trip.place) : cname(country))}</b><small>${esc(cname(country))}</small></span>
        <time class="soon">${when(days)}</time>
      </button></li>`).join('')}</ul>`
}

function dreams(m: StoryModel) {
  return `
    <h3 class="section">${t('section.dreams')}</h3>
    ${m.wishes.length ? `<ul class="log dreams">${m.wishes.map(({ wish, country }) => `
      <li class="dream-row">
        <button class="log-row" data-wishgo="${esc(wish.id)}">
          ${flag(country)}
          <span class="lr-main"><b>${esc(wish.place ? placeName(wish.iso, wish.place) : cname(country))}</b><small>${wish.place ? esc(cname(country)) : t('place.whole')}</small></span>
        </button>
        <button class="mini" data-act="plan" data-id="${esc(wish.id)}">${t('dream.plan')}</button>
        <button class="mini ghost" data-act="unwish" data-id="${esc(wish.id)}" aria-label="${t('dream.remove')}">${icons.close}</button>
      </li>`).join('')}</ul>`
      : `<p class="t-note">${t('dream.empty')}</p>`}
    <button class="mini surprise" data-do="surprise">${icons.spark} ${t('dream.surprise')}</button>`
}

const flag = (c: Country) => (flagUrl(c) ? `<img class="flag" src="${flagUrl(c)}" alt="" />` : '')

const hello = () => { const h = new Date().getHours(); return t(h < 5 ? 'hello.night' : h < 12 ? 'hello.morning' : h < 18 ? 'hello.afternoon' : 'hello.evening') }

const QUICK = ['Paris', 'Rome', 'Tokyo', 'New York', 'London', 'Barcelona', 'Istanbul', 'Bangkok']

const settings = () => `
  <ul class="setting settings-row-end">
    <li><button data-act="settings"><span>${icons.cog}</span><b>${t('map.settings')}</b><small>${t('set.rowNote')}</small><i class="go" aria-hidden="true">${icons.chevron}</i></button></li>
  </ul>`

// the same pastels the map paints each continent with, so a chip and its land match
const CONT_COLOR: Record<string, string> = {
  Africa: '#f5be74', Asia: '#f2a2b6', Europe: '#a3c7ec', 'North America': '#9bd5ad', 'South America': '#c3b0ea', Oceania: '#f2d57e',
}

export function renderStory(m: StoryModel): string {
  if (!m.tripCount) {
    return `
      <div class="empty">
        <h2 class="headline">${t('empty.headline')}</h2>
        <p class="sub">${t('empty.sub')}</p>
        <button class="solid" data-act="log">${t('empty.cta')}</button>
        <p class="quick-label">${t('empty.quick')}</p>
        <div class="quick">${QUICK.map(q => `<button class="chip" data-quick="${q}">${q}</button>`).join('')}</div>
        ${m.upcoming.length ? upcoming(m) : ''}
        ${dreams(m)}
      </div>
      ${settings()}`
  }

  const n = m.countries.length
  const pct = Math.round((n / m.worldTotal) * 100)
  const rounds = m.km / EARTH_KM
  const around = rounds >= 1
    ? t('story.aroundFull', { x: rounds.toFixed(1).replace(/\.0$/, '') })
    : m.km > 0 ? t('story.aroundPart', { pct: Math.max(1, Math.round(rounds * 100)) }) : ''
  const cs = `<mark>${count('country', n)}</mark>`
  const ct = `<mark>${count('city', m.cityCount)}</mark>`
  const headline = m.asOf
    ? t(m.cityCount ? 'story.exploredByCities' : 'story.exploredBy', { year: m.asOf, countries: cs, cities: ct })
    : t(m.cityCount ? 'story.exploredCities' : 'story.explored', { countries: cs, cities: ct })

  return `
    <div class="hero-copy">
      <p class="hello">${hello()}${m.account?.name ? `, ${esc(m.account.name.trim().split(/\s+/)[0])}` : ''}</p>
      <h2 class="headline">${headline}</h2>
      <p class="sub">${[around, m.farthest ? (mi() ? t('story.farthestMi', { name: esc(m.farthest.name), mi: num(inUnits(m.farthest.km)) }) : t('story.farthest', { name: esc(m.farthest.name), km: num(m.farthest.km) })) : ''].filter(Boolean).join(' ')}</p>
    </div>

    <div class="tiles">
      <div class="tile t-world">
        <span class="t-icon">${icons.globe}</span>
        <p class="t-label">${t('tile.world')}</p>
        <p class="t-big">${pct}<span>%</span></p>
        <div class="bar" role="img" aria-label="${t('tile.worldAria', { pct })}"><i style="width:${Math.max(2, pct)}%"></i></div>
        <p class="t-note">${t('tile.worldNote', { n, total: m.worldTotal })}</p>
      </div>
      <div class="tile t-cont">
        <span class="t-icon">${icons.compass}</span>
        <p class="t-label">${t('tile.continents')}</p>
        <p class="t-big">${m.continents.size}<span> ${t('tile.contOf', { total: CONTINENTS.length })}</span></p>
        <ul class="cont">${CONTINENTS.map(c => {
          const k = m.countries.filter(x => x.country.properties.c === c).length
          return `<li class="${k ? 'on' : ''}" style="--cc:${CONT_COLOR[c] ?? '#ddd'}" role="button" tabindex="0" data-continent="${c}">${k ? icons.check : ''}<span>${t(`continents.${c}`)}</span>${k ? `<b>${k}</b>` : ''}</li>`
        }).join('')}</ul>
      </div>
      <div class="tile t-km">
        <span class="t-icon">${icons.route}</span>
        <p class="t-label">${t('tile.distance')}</p>
        ${m.hasHome
          ? `<p class="t-big">${num(inUnits(m.km))}<span> ${t(mi() ? 'tile.miUnit' : 'tile.kmUnit')}</span></p><p class="t-note">${t('tile.distanceNote')}</p>`
          : `<p class="t-note">${t('tile.noHome')}</p><button class="text" data-act="home-search">${t('tile.chooseHome')}</button>`}
      </div>
      <div class="tile t-trips">
        <span class="t-icon">${icons.pin}</span>
        <p class="t-label">${t('tile.trips')}</p>
        <p class="t-big">${m.tripCount}</p>
        <p class="t-note">${count('cityLit', m.cityCount)}</p>
      </div>
    </div>

    <h3 class="section">${t('section.lit')}</h3>
    <ul class="flags">${m.countries.map(c => `
      <li><button class="flagchip" data-country="${esc(c.country.properties.i)}">
        ${flag(c.country)}<span class="fc-name">${esc(cname(c.country))}</span>
        <small>${c.whole && !c.cities ? t('place.whole') : count('city', c.cities)}</small>
      </button></li>`).join('')}</ul>

    ${upcoming(m)}
    ${dreams(m)}
    <h3 class="section">${t('section.recent')}</h3>
    <ul class="log">${m.recent.map(({ trip, country }) => `
      <li><button class="log-row" data-trip="${esc(trip.id)}" data-country="${esc(country.properties.i)}">
        ${flag(country)}
        <span class="lr-main"><b>${esc(trip.place ? placeName(trip.iso, trip.place) : cname(country))}</b><small>${trip.place ? esc(cname(country)) : t('place.whole')}</small></span>
        <time>${fmtRange(trip.startDate, trip.endDate)}</time>
        ${trip.notes ? `<span class="lr-note">${esc(trip.notes)}</span>` : ''}
      </button></li>`).join('')}</ul>
    ${settings()}`
}
