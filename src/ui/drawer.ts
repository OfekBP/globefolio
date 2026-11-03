import { searchCountries, type Country } from '../data/countries'
import { searchPlaces } from '../data/geocode'
import type { Place, Trip } from '../store'
import { esc, fmtRange, plural } from './format'

export type Mode =
  | { k: 'search'; purpose: 'log' | 'home' }
  | { k: 'country'; iso: string }
  | { k: 'form'; iso: string; trip?: Trip }

interface Deps {
  root: HTMLElement
  countries: Country[]
  byIso: Map<string, Country>
  trips(): Trip[]
  home(): string | undefined
  /** Called when the drawer wants the globe to focus a country (or nothing). */
  focus(c: Country | null): void
  save(t: Omit<Trip, 'id'> & { id?: string }): Promise<void>
  remove(id: string): Promise<void>
  setHome(iso: string): Promise<void>
}

export function createDrawer(d: Deps) {
  const { root } = d
  let mode: Mode | null = null
  let opener: HTMLElement | null = null

  let focused: string | null = null

  function open(next: Mode) {
    if (!mode) opener = document.activeElement as HTMLElement | null
    mode = next
    if (next.k !== 'search' && next.iso !== focused) {
      focused = next.iso
      d.focus(d.byIso.get(next.iso) ?? null)
    }
    render()
    root.classList.add('open')
    root.setAttribute('aria-hidden', 'false')
    document.body.classList.add('drawer-open')
  }

  function close() {
    mode = null
    focused = null
    root.classList.remove('open')
    root.setAttribute('aria-hidden', 'true')
    document.body.classList.remove('drawer-open')
    d.focus(null)
    opener?.focus?.()
  }

  const isOpen = () => mode !== null

  function render() {
    if (!mode) return
    if (mode.k === 'search') renderSearch(mode.purpose)
    else if (mode.k === 'country') renderCountry(mode.iso)
    else renderForm(mode.iso, mode.trip)
  }

  const closeBtn = `<button class="x" data-act="close" aria-label="Close journal">Close</button>`

  // ── search ─────────────────────────────────────────────
  function renderSearch(purpose: 'log' | 'home') {
    const first = purpose === 'home'
    root.innerHTML = `
      <div class="sheet">
        ${closeBtn}
        <h2 class="title">${first ? 'Where is home?' : 'Where did you go?'}</h2>
        <p class="lede">${first ? 'Light trails will run from here to every place you log.' : 'Start typing a country. Enter to choose.'}</p>
        <label class="sr" for="q">Country</label>
        <input id="q" class="big-input" autocomplete="off" spellcheck="false" placeholder="Country" role="combobox" aria-expanded="false" aria-controls="results" />
        <ul id="results" class="results" role="listbox"></ul>
      </div>`
    const q = root.querySelector<HTMLInputElement>('#q')!
    const list = root.querySelector<HTMLUListElement>('#results')!
    let hits: Country[] = []
    let active = 0
    const draw = () => {
      list.innerHTML = hits.map((c, i) =>
        `<li role="option" id="opt-${i}" aria-selected="${i === active}" data-i="${i}">${esc(c.properties.n)}</li>`).join('')
      q.setAttribute('aria-expanded', String(hits.length > 0))
      q.setAttribute('aria-activedescendant', hits.length ? `opt-${active}` : '')
    }
    const pick = async (c: Country) => {
      if (purpose === 'home') { await d.setHome(c.properties.i); open({ k: 'country', iso: c.properties.i }) }
      else open({ k: 'form', iso: c.properties.i })
    }
    q.addEventListener('input', () => { hits = searchCountries(d.countries, q.value); active = 0; draw() })
    q.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(hits.length - 1, active + 1); draw() }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); draw() }
      else if (e.key === 'Enter' && hits[active]) { e.preventDefault(); pick(hits[active]) }
    })
    list.addEventListener('mousedown', e => {
      const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-i]')
      if (li) { e.preventDefault(); pick(hits[+li.dataset.i!]) }
    })
    q.focus()
  }

  // ── country journal ────────────────────────────────────
  function renderCountry(iso: string) {
    const c = d.byIso.get(iso)!
    const mine = d.trips().filter(t => t.iso === iso)
    const isHome = d.home() === iso
    const sub = mine.length ? plural(mine.length, 'trip') : 'Not lit yet'
    root.innerHTML = `
      <div class="sheet">
        ${closeBtn}
        <h2 class="title">${esc(c.properties.n)}</h2>
        <p class="lede">${sub}${isHome ? ' · Home' : ''}</p>
        <ol class="entries">
          ${mine.map(t => `
            <li class="entry" data-id="${t.id}">
              <time>${fmtRange(t.startDate, t.endDate)}</time>
              ${t.place ? `<p class="place">${esc(t.place.name)}</p>` : ''}
              ${t.notes ? `<p class="note">${esc(t.notes)}</p>` : ''}
              <div class="row-actions">
                <button class="text" data-act="edit" data-id="${t.id}">Edit</button>
                <button class="text danger" data-act="delete" data-id="${t.id}">Delete</button>
              </div>
            </li>`).join('')}
        </ol>
        <div class="foot-actions">
          <button class="solid" data-act="log">${mine.length ? 'Log another trip' : 'Log a trip here'}</button>
          ${isHome ? '' : `<button class="text" data-act="home">Make this home</button>`}
        </div>
      </div>`
    root.querySelector<HTMLElement>('[data-act="log"]')!.focus()
  }

  // ── trip form ──────────────────────────────────────────
  function renderForm(iso: string, trip?: Trip) {
    const c = d.byIso.get(iso)!
    root.innerHTML = `
      <form class="sheet" id="trip-form" novalidate>
        ${closeBtn}
        <h2 class="title">${trip ? 'Edit trip' : 'Log a trip'}</h2>
        <p class="lede">${esc(c.properties.n)}</p>
        <div class="field">
          <label for="f-place">City or place <span class="opt">optional</span></label>
          <input id="f-place" autocomplete="off" spellcheck="false" placeholder="Kyoto, Lisbon, Patagonia…" value="${esc(trip?.place?.name ?? '')}" />
          <ul id="place-results" class="results" role="listbox"></ul>
          <p class="status" id="place-status" aria-live="polite"></p>
        </div>
        <div class="two">
          <div class="field"><label for="f-start">From</label><input id="f-start" type="date" value="${trip?.startDate ?? ''}" /></div>
          <div class="field"><label for="f-end">To</label><input id="f-end" type="date" value="${trip?.endDate ?? ''}" /></div>
        </div>
        <p class="status error" id="date-error" role="alert"></p>
        <div class="field">
          <label for="f-notes">What do you want to remember?</label>
          <textarea id="f-notes" rows="4" placeholder="The meal, the people, the weather…">${esc(trip?.notes ?? '')}</textarea>
        </div>
        <div class="foot-actions">
          <button class="solid" type="submit">Save trip</button>
          <button class="text" type="button" data-act="cancel-form">Cancel</button>
        </div>
      </form>`

    let place: Place | undefined = trip?.place
    const input = root.querySelector<HTMLInputElement>('#f-place')!
    const results = root.querySelector<HTMLUListElement>('#place-results')!
    const status = root.querySelector<HTMLElement>('#place-status')!
    let timer = 0
    let ctl: AbortController | undefined
    let found: Place[] = []

    input.addEventListener('input', () => {
      place = undefined
      clearTimeout(timer)
      ctl?.abort()
      results.innerHTML = ''
      status.textContent = ''
      const text = input.value.trim()
      if (text.length < 3) return
      timer = window.setTimeout(async () => {
        ctl = new AbortController()
        status.textContent = 'Searching…'
        try {
          found = await searchPlaces(`${text}, ${c.properties.n}`, ctl.signal)
          status.textContent = found.length ? '' : 'No match. The trip will still light the country.'
          results.innerHTML = found.map((p, i) => `<li role="option" data-i="${i}">${esc(p.name)}</li>`).join('')
        } catch (e) {
          if ((e as Error).name !== 'AbortError') status.textContent = 'Place search is offline. The trip will still light the country.'
        }
      }, 380)
    })
    results.addEventListener('mousedown', e => {
      const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-i]')
      if (!li) return
      e.preventDefault()
      place = found[+li.dataset.i!]
      input.value = place.name
      results.innerHTML = ''
    })

    root.querySelector<HTMLFormElement>('#trip-form')!.addEventListener('submit', async e => {
      e.preventDefault()
      const start = root.querySelector<HTMLInputElement>('#f-start')!.value || undefined
      const end = root.querySelector<HTMLInputElement>('#f-end')!.value || undefined
      const err = root.querySelector<HTMLElement>('#date-error')!
      if (start && end && end < start) { err.textContent = 'The end date comes before the start date.'; return }
      err.textContent = ''
      const text = input.value.trim()
      await d.save({
        id: trip?.id, iso,
        place: place ?? (text && trip?.place?.name === text ? trip.place : undefined),
        startDate: start, endDate: end,
        notes: root.querySelector<HTMLTextAreaElement>('#f-notes')!.value.trim() || undefined,
      })
      open({ k: 'country', iso })
    })
    input.focus()
  }

  // ── delegated actions ──────────────────────────────────
  let armed: { id: string; timer: number } | null = null
  root.addEventListener('click', async e => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')
    if (!btn || !mode) return
    const act = btn.dataset.act
    if (act === 'close') close()
    else if (act === 'log' && mode.k === 'country') open({ k: 'form', iso: mode.iso })
    else if (act === 'cancel-form' && mode.k === 'form') open({ k: 'country', iso: mode.iso })
    else if (act === 'home' && mode.k === 'country') { await d.setHome(mode.iso); render() }
    else if (act === 'edit' && mode.k === 'country') {
      const trip = d.trips().find(t => t.id === btn.dataset.id)
      if (trip) open({ k: 'form', iso: mode.iso, trip })
    } else if (act === 'delete' && mode.k === 'country') {
      const id = btn.dataset.id!
      if (armed?.id === id) {
        clearTimeout(armed.timer); armed = null
        await d.remove(id)
        render()
      } else {
        if (armed) clearTimeout(armed.timer)
        btn.textContent = 'Delete for good?'
        armed = { id, timer: window.setTimeout(() => { armed = null; btn.textContent = 'Delete' }, 3200) }
      }
    }
  })

  return { open, close, isOpen, rerender: render, current: () => mode }
}
