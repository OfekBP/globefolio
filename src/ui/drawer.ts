import { flagUrl, placeKey, search, type City, type Country, type Geo, type Hit } from '../data/geo'
import type { Trip, Wish } from '../store'
import { cname, t } from '../i18n'
import { count, esc, fmtRange } from './format'
import { icons } from './icons'

export type Mode =
  | { k: 'search'; purpose: 'log' | 'home'; iso?: string }
  | { k: 'country'; iso: string }
  | { k: 'city'; city: City }
  | { k: 'form'; iso: string; city?: City; trip?: Trip }
  | { k: 'extra'; render(root: HTMLElement, back: () => void): void }

export type Focus = { country?: Country; city?: City } | null

interface Deps {
  root: HTMLElement
  geo: Geo
  trips(): Trip[]
  homeKey(): string | undefined
  focus(f: Focus): void
  save(t: Omit<Trip, 'id'> & { id?: string }): Promise<void>
  remove(id: string): Promise<void>
  setHome(key: string): Promise<void>
  wishes(): Wish[]
  toggleWish(iso: string, city?: City): Promise<void>
  /** true when the person is signed in, so the trip form offers "hide from friends" */
  canShare?(): boolean
}

const popText = (k: number) => (k >= 1000 ? t('city.peopleM', { n: (k / 1000).toFixed(1).replace(/\.0$/, '') }) : k > 0 ? t('city.peopleK', { n: k }) : '')

export function createDrawer(d: Deps) {
  const { root, geo } = d
  let mode: Mode | null = null
  let opener: HTMLElement | null = null
  let focused = ''

  const flag = (c?: Country) => (c && flagUrl(c) ? `<img class="flag" src="${flagUrl(c)}" alt="" />` : '')
  const countryOf = (iso: string) => geo.byIso.get(iso)!

  function cityOfTrip(t: Trip): City | undefined {
    if (!t.place) return undefined
    return geo.cityByKey.get(placeKey(t.iso, t.place)) ??
      { key: placeKey(t.iso, t.place), name: t.place.name, iso: t.iso, lat: t.place.lat, lng: t.place.lng, pop: 0, cap: false, fold: '' }
  }

  function open(next: Mode) {
    if (!mode) opener = document.activeElement as HTMLElement | null
    mode = next
    const key = next.k === 'search' || next.k === 'extra' ? '' : next.k === 'city' ? next.city.key : next.k === 'form' ? (next.city?.key ?? next.iso) : next.iso
    if (key && key !== focused) {
      focused = key
      if (next.k === 'city') d.focus({ city: next.city })
      else if (next.k === 'form' && next.city) d.focus({ city: next.city })
      else d.focus({ country: countryOf(next.k === 'form' || next.k === 'country' ? next.iso : '') })
    }
    render()
    // places show as a half sheet so the globe stays visible above them
    root.classList.toggle('half', next.k === 'city' || next.k === 'country')
    root.classList.add('open')
    root.setAttribute('aria-hidden', 'false')
    document.body.classList.add('drawer-open')
  }

  function close() {
    mode = null
    focused = ''
    root.classList.remove('open')
    root.setAttribute('aria-hidden', 'true')
    document.body.classList.remove('drawer-open')
    d.focus(null)
    opener?.focus?.()
  }

  const isOpen = () => mode !== null

  function render() {
    if (!mode) return
    if (mode.k === 'search') renderSearch(mode.purpose, mode.iso)
    else if (mode.k === 'country') renderCountry(mode.iso)
    else if (mode.k === 'city') renderCity(mode.city)
    else if (mode.k === 'extra') { root.classList.remove('half'); mode.render(root, close) }
    else renderForm(mode.iso, mode.city, mode.trip)
  }

  const closeBtn = `<button class="x" data-act="close" aria-label="${t('close')}">${icons.close}</button>`

  // ── search ─────────────────────────────────────────────
  function renderSearch(purpose: 'log' | 'home', iso?: string) {
    const home = purpose === 'home'
    const scoped = iso ? countryOf(iso) : undefined
    root.innerHTML = `
      <div class="sheet">
        ${closeBtn}
        <h2 class="title">${home ? t('search.homeTitle') : scoped ? t('search.citiesIn', { country: esc(cname(scoped)) }) : t('search.title')}</h2>
        <p class="lede">${home ? t('search.homeLede') : t('search.lede')}</p>
        <label class="sr" for="q">${t('search.label')}</label>
        <div class="search-field">
          ${icons.search}
          <input id="q" autocomplete="off" spellcheck="false" placeholder="${home ? t('search.phHome') : scoped ? t('search.phCity') : t('search.phAny')}"
            role="combobox" aria-expanded="false" aria-controls="results" />
        </div>
        <ul id="results" class="results" role="listbox"></ul>
      </div>`
    const q = root.querySelector<HTMLInputElement>('#q')!
    const list = root.querySelector<HTMLUListElement>('#results')!
    let hits: Hit[] = []
    let active = 0
    const rowOf = (h: Hit, i: number) => {
      const c = h.kind === 'city' ? countryOf(h.city.iso) : h.country
      const name = h.kind === 'city' ? h.city.name : cname(h.country)
      const sub = h.kind === 'city' ? (c ? cname(c) : '') : t('place.whole')
      return `<li role="option" id="opt-${i}" aria-selected="${i === active}" data-i="${i}">
        ${flag(c)}<span class="r-name">${esc(name)}</span><span class="r-sub">${esc(sub)}</span></li>`
    }
    const draw = () => {
      list.innerHTML = hits.map(rowOf).join('') || (q.value.trim() ? `<li class="none">${t('search.none')}</li>` : '')
      q.setAttribute('aria-expanded', String(hits.length > 0))
      q.setAttribute('aria-activedescendant', hits.length ? `opt-${active}` : '')
    }
    const pick = async (h: Hit) => {
      if (home) {
        if (h.kind !== 'city') return
        await d.setHome(h.city.key)
        open({ k: 'city', city: h.city })
      } else if (h.kind === 'city') open({ k: 'form', iso: h.city.iso, city: h.city })
      else open({ k: 'form', iso: h.country.properties.i })
    }
    q.addEventListener('input', () => {
      hits = search(geo, q.value, { iso, citiesOnly: home })
      active = 0
      draw()
    })
    q.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(hits.length - 1, active + 1); draw() }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); draw() }
      else if (e.key === 'Enter' && hits[active]) { e.preventDefault(); pick(hits[active]) }
    })
    list.addEventListener('click', e => {
      const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-i]')
      if (li) { e.preventDefault(); pick(hits[+li.dataset.i!]) }
    })
    q.focus()
  }

  // ── shared pieces ──────────────────────────────────────
  function entries(list: Trip[], showPlace: boolean) {
    return `<ol class="entries">${list.map(tr => `
      <li class="entry">
        <time>${fmtRange(tr.startDate, tr.endDate)}</time>
        ${showPlace ? `<p class="place">${tr.place ? `<button class="link" data-act="open-city" data-id="${tr.id}">${esc(tr.place.name)}</button>` : t('place.whole')}</p>` : ''}
        ${tr.notes ? `<p class="note">${esc(tr.notes)}</p>` : ''}
        <div class="row-actions">
          <button class="text" data-act="edit" data-id="${tr.id}">${t('entry.edit')}</button>
          <button class="text danger" data-act="delete" data-id="${tr.id}">${t('entry.delete')}</button>
        </div>
      </li>`).join('')}</ol>`
  }

  const wished = (iso: string, city?: City) =>
    d.wishes().some(w => w.iso === iso && (city ? !!w.place && placeKey(iso, w.place) === city.key : !w.place))

  // ── country journal ────────────────────────────────────
  function renderCountry(iso: string) {
    const c = countryOf(iso)
    const mine = d.trips().filter(t => t.iso === iso)
    const litKeys = new Set(mine.filter(t => t.place).map(t => placeKey(iso, t.place!)))
    const suggestions = (geo.citiesByIso.get(iso) ?? []).filter(x => !litKeys.has(x.key)).slice(0, 10)
    const sub = mine.length ? t('country.sub', { cities: count('cityLit', litKeys.size), trips: count('trip', mine.length) }) : t('country.notYet')
    root.innerHTML = `
      <div class="sheet">
        ${closeBtn}
        <div class="head">${flag(c)}<h2 class="title">${esc(cname(c))}</h2></div>
        <p class="lede">${sub}</p>
        ${mine.length ? entries(mine, true) : ''}
        ${suggestions.length ? `
          <h3 class="sub-title">${mine.length ? t('country.another') : t('country.pick')}</h3>
          <div class="chips">${suggestions.map(x => `<button class="chip" data-act="pick-city" data-key="${esc(x.key)}">${icons.plus}${esc(x.name)}</button>`).join('')}</div>` : ''}
        <div class="foot-actions">
          <button class="solid" data-act="search-in">${t('country.searchIn', { country: esc(cname(c)) })}</button>
          <button class="text" data-act="whole">${t('country.whole')}</button>
          <button class="text" data-act="wish">${wished(iso) ? t('wish.on') : t('wish.add')}</button>
        </div>
      </div>`
  }

  // ── city journal ───────────────────────────────────────
  function renderCity(city: City) {
    const c = countryOf(city.iso)
    const mine = d.trips().filter(t => t.iso === city.iso && t.place && placeKey(city.iso, t.place) === city.key)
    const isHome = d.homeKey() === city.key
    root.innerHTML = `
      <div class="sheet">
        ${closeBtn}
        <button class="back" data-act="goto-country">${icons.back}${flag(c)}${esc(cname(c))}</button>
        <h2 class="title">${esc(city.name)}</h2>
        <p class="lede">${[isHome ? t('city.home') : '', mine.length ? count('trip', mine.length) : t('country.notYet'), popText(city.pop)].filter(Boolean).join(' · ')}</p>
        ${mine.length ? entries(mine, false) : ''}
        <div class="foot-actions">
          <button class="solid" data-act="log-city">${mine.length ? t('city.again') : t('city.been')}</button>
          <button class="text" data-act="wish">${wished(city.iso, city) ? t('wish.on') : t('wish.add')}</button>
          ${isHome ? '' : `<button class="text" data-act="home">${t('city.makeHome')}</button>`}
        </div>
      </div>`
  }

  // ── trip form ──────────────────────────────────────────
  function renderForm(iso: string, city?: City, trip?: Trip) {
    const c = countryOf(iso)
    city = city ?? (trip ? cityOfTrip(trip) : undefined)
    root.innerHTML = `
      <form class="sheet" id="trip-form" novalidate>
        ${closeBtn}
        <h2 class="title">${trip ? t('form.edit') : t('form.log')}</h2>
        <p class="where">${flag(c)}<span>${city ? `<b>${esc(city.name)}</b>, ${esc(cname(c))}` : t('form.wholeCountry', { country: `<b>${esc(cname(c))}</b>` })}</span></p>
        ${city ? '' : `<p class="note-box">${t('form.noCity', { link: `<button type="button" class="link" data-act="search-in">${t('form.pickCity')}</button>` })}</p>`}
        <div class="two">
          <div class="field"><label for="f-start">${t('form.from')}</label><input id="f-start" type="date" value="${trip?.startDate ?? ''}" /></div>
          <div class="field"><label for="f-end">${t('form.to')}</label><input id="f-end" type="date" value="${trip?.endDate ?? ''}" /></div>
        </div>
        <p class="status error" id="date-error" role="alert"></p>
        <div class="field">
          <label for="f-notes">${t('form.notes')}</label>
          <textarea id="f-notes" rows="4" placeholder="${t('form.notesPh')}">${esc(trip?.notes ?? '')}</textarea>
        </div>
        ${d.canShare?.() ? `<label class="vis-row hide-row"><input id="f-hide" type="checkbox" ${trip?.hiddenFromFriends ? 'checked' : ''} /><span><b>${t('form.hide')}</b><small>${t('form.hideNote')}</small></span></label>` : ''}
        <div class="foot-actions">
          <button class="solid" type="submit">${t('form.save')}</button>
          <button class="text" type="button" data-act="cancel-form">${t('cancel')}</button>
        </div>
      </form>`
    root.querySelector<HTMLFormElement>('#trip-form')!.addEventListener('submit', async e => {
      e.preventDefault()
      const start = root.querySelector<HTMLInputElement>('#f-start')!.value || undefined
      const end = root.querySelector<HTMLInputElement>('#f-end')!.value || undefined
      const err = root.querySelector<HTMLElement>('#date-error')!
      if (start && end && end < start) { err.textContent = t('form.dateError'); return }
      err.textContent = ''
      await d.save({
        id: trip?.id, iso,
        place: city ? { name: city.name, lat: city.lat, lng: city.lng } : undefined,
        startDate: start, endDate: end,
        hiddenFromFriends: root.querySelector<HTMLInputElement>('#f-hide')?.checked || undefined,
        notes: root.querySelector<HTMLTextAreaElement>('#f-notes')!.value.trim() || undefined,
      })
      open(city ? { k: 'city', city } : { k: 'country', iso })
    })
  }

  // ── delegated actions ──────────────────────────────────
  let armed: { id: string; timer: number } | null = null
  const modeIso = () => (!mode || mode.k === 'search' || mode.k === 'extra' ? undefined : mode.k === 'city' ? mode.city.iso : mode.iso)

  root.addEventListener('click', async e => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')
    if (!btn || !mode) return
    const act = btn.dataset.act
    const iso = modeIso()
    const trip = d.trips().find(t => t.id === btn.dataset.id)
    if (act === 'close') close()
    else if (act === 'goto-country' && iso) open({ k: 'country', iso })
    else if (act === 'search-in' && iso) open({ k: 'search', purpose: 'log', iso })
    else if (act === 'whole' && iso) open({ k: 'form', iso })
    else if (act === 'pick-city') { const city = geo.cityByKey.get(btn.dataset.key!); if (city) open({ k: 'form', iso: city.iso, city }) }
    else if (act === 'log-city' && mode.k === 'city') open({ k: 'form', iso: mode.city.iso, city: mode.city })
    else if (act === 'cancel-form' && mode.k === 'form') open(mode.city ? { k: 'city', city: mode.city } : { k: 'country', iso: mode.iso })
    else if (act === 'wish' && iso) { await d.toggleWish(iso, mode.k === 'city' ? mode.city : undefined); render() }
    else if (act === 'home' && mode.k === 'city') { await d.setHome(mode.city.key); render() }
    else if (act === 'open-city' && trip) { const city = cityOfTrip(trip); if (city) open({ k: 'city', city }) }
    else if (act === 'edit' && trip && iso) open({ k: 'form', iso, trip })
    else if (act === 'delete' && btn.dataset.id) {
      const id = btn.dataset.id
      if (armed?.id === id) {
        clearTimeout(armed.timer); armed = null
        await d.remove(id)
        render()
      } else {
        if (armed) clearTimeout(armed.timer)
        btn.textContent = t('entry.deleteSure')
        armed = { id, timer: window.setTimeout(() => { armed = null; btn.textContent = t('entry.delete') }, 3200) }
      }
    }
  })

  return { open, close, isOpen, rerender: render, current: () => mode }
}
