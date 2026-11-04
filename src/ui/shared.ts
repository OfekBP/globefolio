import { getSession } from '../auth'
import { cityName, flagUrl, placeName, search, type Geo, type Hit } from '../data/geo'
import { listLinks } from '../friends'
import { cname, t } from '../i18n'
import { acceptInvite, createInviteLink, createShared, deleteShared, getMembers, getStops, inviteFriend, listShared, removeMember, removeStop, saveStop, setRole, watchTrip, type Member, type SharedTrip, type Stop } from '../shared'
import { count, esc, fmtRange } from './format'
import { icons } from './icons'
import { claim } from './sheet'
import { toast } from './toast'

export interface SharedCtx {
  geo: Geo
  back(): void
  close(): void
  openAccount(): void
  /** copies stops into the person's own trips; returns how many were added */
  importStops(stops: Stop[]): Promise<number>
}

const head = () => `<button class="x" data-act="close" aria-label="${t('close')}">${icons.close}</button>`
const flag = (geo: Geo, iso: string) => { const c = geo.byIso.get(iso); return c && flagUrl(c) ? `<img class="flag" src="${flagUrl(c)}" alt="" />` : '' }

/** Joins a trip from an invite link. Returns the trip id, or null when the invite is no good. */
export async function joinFromLink(token: string): Promise<string | null | 'offline'> {
  try { return await acceptInvite(token) } catch { return navigator.onLine ? null : 'offline' }
}

/** Plan trips together: a list of shared trips, and inside each one live stops, members and invites. */
export function renderShared(root: HTMLElement, ctx: SharedCtx, openId?: string) {
  if (!getSession()) {
    root.innerHTML = `<div class="sheet">${head()}<h2 class="title">${t('sh.title')}</h2><p class="lede">${t('fr.signinNote')}</p>
      <div class="foot-actions"><button class="solid" data-ax="signin">${t('acct.row')}</button></div></div>`
    root.onclick = e => { if ((e.target as HTMLElement).closest('[data-ax=signin]')) ctx.openAccount() }
    return
  }
  let stop = () => {}
  let current: SharedTrip | null = null
  // closing or replacing the sheet ends the live subscription, and nothing may paint once it has gone
  const alive = claim(root, () => stop())

  async function showList() {
    stop(); stop = () => {}; current = null
    let trips: SharedTrip[] = []
    try { trips = await listShared() } catch {
      if (!alive()) return
      root.innerHTML = `<div class="sheet">${head()}<h2 class="title">${t('sh.title')}</h2><p class="status error" role="alert">${t('acct.error')}</p>
        <div class="foot-actions"><button class="solid" data-ax="list">${t('retry')}</button><button class="text" data-ax="back">${t('acct.back')}</button></div></div>`
      return
    }
    if (!alive()) return
    root.innerHTML = `<div class="sheet">${head()}
      <h2 class="title">${t('sh.title')}</h2><p class="lede">${t('sh.lede')}</p>
      <form id="sh-new" class="inline-form"><input id="sh-name" maxlength="80" placeholder="${t('sh.namePh')}" aria-label="${t('sh.namePh')}" /><button class="solid" type="submit">${t('sh.create')}</button></form>
      ${trips.length ? `<ul class="log">${trips.map(s => `<li><button class="log-row sh-row" data-ax="open" data-id="${s.id}"><span class="lr-main"><b>${esc(s.title)}</b><small>${t(`sh.role.${s.role}`)} · ${t('n.person', { n: s.members })}</small></span></button></li>`).join('')}</ul>` : `<p class="t-note">${t('sh.none')}</p>`}
      <div class="foot-actions"><button class="text" data-ax="back">${t('acct.back')}</button></div></div>`
    root.querySelector<HTMLFormElement>('#sh-new')!.onsubmit = async e => {
      e.preventDefault()
      const v = root.querySelector<HTMLInputElement>('#sh-name')!.value.trim()
      if (!v) return
      const go = (e.submitter as HTMLButtonElement | null) ?? null
      if (go) go.disabled = true
      try { const id = await createShared(v); await showTrip(id) } catch { toast(t('acct.error')); if (go) go.disabled = false }
    }
  }

  async function showTrip(id: string) {
    stop()
    let trips: SharedTrip[] = []
    let listed = false
    try { trips = await listShared(); listed = true } catch { /* handled below */ }
    if (!alive()) return
    current = trips.find(x => x.id === id) ?? null
    if (!current) { toast(listed ? t('sh.joinFail') : t('acct.error')); return showList() }
    const trip = current
    const canEdit = trip.role !== 'viewer'
    const mine = getSession()!.user.id
    let presence: string[] = []
    let stops: Stop[] = []
    let members: Member[] = []
    let friendsToAsk: { id: string; handle: string }[] = []

    const draw = () => {
      if (!alive()) return
      // keep what someone is typing when a live update redraws the sheet
      const keep = root.querySelector<HTMLInputElement>('#sh-q')?.value ?? ''
      root.innerHTML = `<div class="sheet">${head()}
        <button class="back" data-ax="list">${icons.back}${t('sh.title')}</button>
        <h2 class="title">${esc(trip.title)}</h2>
        <p class="lede">${t(`sh.role.${trip.role}`)} · ${t('n.person', { n: members.length })}${presence.length ? ` · ${t('sh.here', { names: presence.map(h => '@' + esc(h)).join(', ') })}` : ''}</p>
        <h3 class="sub-title">${t('sh.stops')}</h3>
        ${stops.length ? `<ol class="entries">${stops.map(s => {
          const c = ctx.geo.byIso.get(s.iso)
          return `<li class="entry stop"><p class="place">${flag(ctx.geo, s.iso)} <b>${esc(s.place ? placeName(s.iso, s.place) : (c ? cname(c) : s.iso))}</b>${s.place && c ? `<small> ${esc(cname(c))}</small>` : ''}</p>
            ${canEdit ? `<div class="two"><div class="field"><label>${t('form.from')}</label><input type="date" data-ax="start" data-id="${s.id}" value="${s.start_date ?? ''}" /></div><div class="field"><label>${t('form.to')}</label><input type="date" data-ax="end" data-id="${s.id}" value="${s.end_date ?? ''}" /></div></div>
              <div class="field"><input data-ax="note" data-id="${s.id}" maxlength="2000" value="${esc(s.notes ?? '')}" placeholder="${t('form.notesPh')}" aria-label="${t('form.notes')}" /></div>
              <div class="row-actions"><button class="text danger" data-ax="rmstop" data-id="${s.id}">${t('entry.delete')}</button></div>`
              : `<time>${fmtRange(s.start_date ?? undefined, s.end_date ?? undefined)}</time>${s.notes ? `<p class="note">${esc(s.notes)}</p>` : ''}`}
          </li>`
        }).join('')}</ol>` : `<p class="t-note">${t('sh.noStops')}</p>`}
        ${canEdit ? `<div class="search-field">${icons.search}<input id="sh-q" autocomplete="off" spellcheck="false" placeholder="${t('sh.addStop')}" value="${esc(keep)}" /></div><ul id="sh-results" class="results"></ul>` : ''}
        ${stops.length ? `<div class="foot-actions"><button class="solid" data-ax="import">${t('sh.addToMap')}</button></div>` : ''}
        <h3 class="sub-title">${t('sh.members')}</h3>
        <ul class="people">${members.map(m => `<li class="person"><span class="avatar" aria-hidden="true">${esc((m.display_name || m.handle).slice(0, 1).toUpperCase())}</span><span class="who"><b>${esc(m.display_name || '@' + m.handle)}</b><small>${t(`sh.role.${m.role}`)}</small></span>
          ${trip.role === 'owner' && m.id !== mine ? `<select data-ax="role" data-id="${m.id}" aria-label="${t('sh.members')}"><option value="editor" ${m.role === 'editor' ? 'selected' : ''}>${t('sh.role.editor')}</option><option value="viewer" ${m.role === 'viewer' ? 'selected' : ''}>${t('sh.role.viewer')}</option></select><button class="mini ghost" data-ax="rmmember" data-id="${m.id}" aria-label="${t('sh.remove')}">${icons.close}</button>` : ''}</li>`).join('')}</ul>
        ${trip.role === 'owner' ? `
          <h3 class="sub-title">${t('sh.invite')}</h3>
          ${friendsToAsk.length ? `<div class="inline-form"><select id="sh-friend" aria-label="${t('sh.inviteFriend')}">${friendsToAsk.map(f => `<option value="${f.id}">@${esc(f.handle)}</option>`).join('')}</select>
            <select id="sh-frole" aria-label="${t('sh.role.editor')}"><option value="editor">${t('sh.role.editor')}</option><option value="viewer">${t('sh.role.viewer')}</option></select>
            <button class="solid" data-ax="invite">${t('sh.inviteFriend')}</button></div>` : ''}
          <div class="foot-actions"><button class="text" data-ax="link" data-role="editor">${t('sh.linkEditor')}</button><button class="text" data-ax="link" data-role="viewer">${t('sh.linkViewer')}</button></div>
          <div class="foot-actions"><button class="text danger" data-ax="delete">${t('sh.deleteTrip')}</button></div>`
          : `<div class="foot-actions"><button class="text danger" data-ax="leave">${t('sh.leave')}</button></div>`}
      </div>`
      const q = root.querySelector<HTMLInputElement>('#sh-q')
      if (q && keep) { q.focus(); q.setSelectionRange(keep.length, keep.length) }
      if (q) q.oninput = () => {
        const out = root.querySelector<HTMLElement>('#sh-results')!
        const hits = search(ctx.geo, q.value, { limit: 6 })
        out.innerHTML = hits.map((h, i) => {
          const c = h.kind === 'city' ? ctx.geo.byIso.get(h.city.iso) : h.country
          return `<li role="option" data-i="${i}">${c ? flag(ctx.geo, c.properties.i) : ''}<span class="r-name">${esc(h.kind === 'city' ? cityName(h.city) : cname(h.country))}</span><span class="r-sub">${h.kind === 'city' && c ? esc([h.city.region, cname(c)].filter(Boolean).join(', ')) : t('place.whole')}</span></li>`
        }).join('')
        out.onclick = async ev => {
          const li = (ev.target as HTMLElement).closest<HTMLElement>('li[data-i]')
          if (!li) return
          const h: Hit = hits[+li.dataset.i!]
          const iso = h.kind === 'city' ? h.city.iso : h.country.properties.i
          try { await saveStop({ id: crypto.randomUUID(), trip_id: trip.id, iso, place: h.kind === 'city' ? { name: h.city.name, lat: h.city.lat, lng: h.city.lng } : null, start_date: null, end_date: null, notes: null }); q.value = ''; await refresh() } catch { toast(t('acct.error')) }
        }
      }
    }

    async function refresh() {
      try {
        ;[stops, members] = await Promise.all([getStops(id), getMembers(id)])
        if (trip.role === 'owner') {
          const ids = new Set(members.map(m => m.id))
          friendsToAsk = (await listLinks()).filter(l => l.state === 'friend' && !ids.has(l.id))
        }
      } catch { toast(t('acct.error')) }
      draw()
    }
    // a live update never replaces the sheet while someone is typing in it; it catches up as soon as they leave the field
    const typing = () => document.activeElement instanceof HTMLInputElement && root.contains(document.activeElement)
    let stale = false
    ;(root as unknown as { onfocusout: (() => void) | null }).onfocusout = () => { if (stale) { stale = false; setTimeout(() => { if (alive() && !typing()) void refresh() }, 0) } }
    stop = watchTrip(id, () => { if (!alive()) return; if (typing()) stale = true; else void refresh() }, h => { presence = h; if (alive() && !typing()) draw() })
    await refresh()
  }

  root.onclick = async e => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ax]')
    if (!el) return
    const id = el.dataset.id!
    try {
      switch (el.dataset.ax) {
        case 'back': stop(); ctx.back(); break
        case 'list': await showList(); break
        case 'open': await showTrip(id); break
        case 'rmstop': await removeStop(id); await showTrip(current!.id); break
        case 'rmmember': await removeMember(current!.id, id); await showTrip(current!.id); break
        case 'invite': {
          const friend = root.querySelector<HTMLSelectElement>('#sh-friend')!.value
          const role = root.querySelector<HTMLSelectElement>('#sh-frole')!.value as 'editor' | 'viewer'
          await inviteFriend(current!.id, friend, role); await showTrip(current!.id); break
        }
        case 'link': {
          const link = await createInviteLink(current!.id, el.dataset.role as 'editor' | 'viewer')
          try { await navigator.clipboard.writeText(link); toast(t('fr.linkCopied')) } catch { window.prompt(t('sh.linkFor'), link) }
          break
        }
        case 'import': { const n = await ctx.importStops(await getStops(current!.id)); toast(t('sh.addedAll', { n })); break }
        case 'leave': if (window.confirm(t('sh.leaveSure'))) { await removeMember(current!.id, getSession()!.user.id); await showList() } break
        case 'delete': if (window.confirm(t('sh.deleteSure'))) { await deleteShared(current!.id); await showList() } break
      }
    } catch { toast(t('acct.error')) }
  }

  root.onchange = async e => {
    const el = e.target as HTMLInputElement | HTMLSelectElement
    const id = el.dataset.id
    if (!id || !current) return
    try {
      if (el.dataset.ax === 'role') {
        try { await setRole(current.id, id, el.value as 'editor' | 'viewer') } catch { toast(t('acct.error')); await showTrip(current.id) }
        return
      }
      const s = (await getStops(current.id)).find(x => x.id === id)
      if (!s) return
      const next = { ...s }
      if (el.dataset.ax === 'start') next.start_date = el.value || null
      if (el.dataset.ax === 'end') next.end_date = el.value || null
      if (el.dataset.ax === 'note') next.notes = el.value.trim() || null
      if (next.start_date && next.end_date && next.end_date < next.start_date) { toast(t('form.dateError')); return }
      const { updated_at: _u, deleted_at: _d, ...rest } = next
      await saveStop(rest)
    } catch { toast(t('acct.error')) }
  }

  void (openId ? showTrip(openId) : showList())
}

export { count }
