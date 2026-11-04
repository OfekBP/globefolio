import { appUrl } from '../supabase'
import { getProfile, getSession } from '../auth'
import { flagUrl, type Geo } from '../data/geo'
import { acceptRequest, blockPerson, findPeople, friendMap, listBlocked, listLinks, publicProfile, removeLink, reportPerson, sendRequest, unblockPerson, type Link, type MapRow, type Person } from '../friends'
import { cname, t } from '../i18n'
import { count, esc } from './format'
import { icons } from './icons'
import { claim } from './sheet'
import { toast } from './toast'

export interface FriendsCtx {
  geo: Geo
  back(): void
  close(): void
  openAccount(): void
  /** the countries I have been to, for comparing */
  myIsos(): Set<string>
  /** paints a friend's places on my map (null clears it) */
  overlay(rows: MapRow[] | null, handle?: string): void
  overlayOf(): string | undefined
}

const name = (p: Person) => p.display_name || `@${p.handle}`
const flag = (geo: Geo, iso: string) => { const c = geo.byIso.get(iso); return c && flagUrl(c) ? `<img class="flag" src="${flagUrl(c)}" alt="" />` : '' }
const head = () => `<button class="x" data-act="close" aria-label="${t('close')}">${icons.close}</button>`

/** The Friends sheet: find people, answer requests, and open a friend's map to compare it with yours. */
export function renderFriends(root: HTMLElement, ctx: FriendsCtx) {
  if (!getSession()) {
    root.innerHTML = `<div class="sheet">${head()}<h2 class="title">${t('fr.title')}</h2><p class="lede">${t('fr.signinNote')}</p>
      <div class="foot-actions"><button class="solid" data-ax="signin">${t('acct.row')}</button></div></div>`
    root.onclick = e => { if ((e.target as HTMLElement).closest('[data-ax=signin]')) ctx.openAccount() }
    return
  }
  const alive = claim(root)
  let links: Link[] = []
  let blocked: Person[] = []
  let timer: number | undefined
  let open: Link | null = null
  let loadFailed = false
  let seq = 0 // newest search / friend-map request; older answers are dropped

  const row = (p: Person, actions: string) => `
    <li class="person"><span class="avatar" aria-hidden="true">${esc((p.display_name || p.handle).slice(0, 1).toUpperCase())}</span>
      <span class="who"><b>${esc(p.display_name || '@' + p.handle)}</b>${p.display_name ? `<small>@${esc(p.handle)}</small>` : ''}</span>${actions}</li>`

  async function load() {
    try { [links, blocked] = await Promise.all([listLinks(), listBlocked()]); loadFailed = false } catch { loadFailed = true }
    if (alive()) draw()
  }

  function draw() {
    if (open) return drawFriend(open)
    if (loadFailed && !links.length) {
      root.innerHTML = `<div class="sheet">${head()}<h2 class="title">${t('fr.title')}</h2><p class="status error" role="alert">${t('acct.error')}</p>
        <div class="foot-actions"><button class="solid" data-ax="retry">${t('retry')}</button></div></div>`
      return
    }
    const incoming = links.filter(l => l.state === 'incoming')
    const outgoing = links.filter(l => l.state === 'outgoing')
    const friends = links.filter(l => l.state === 'friend')
    const profile = getProfile()
    root.innerHTML = `
      <div class="sheet">${head()}
        <h2 class="title">${t('fr.title')}</h2>
        <p class="lede">${t('fr.lede')}</p>
        <div class="search-field">${icons.search}<input id="fr-q" dir="auto" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="${t('fr.search')}" aria-label="${t('fr.search')}" /></div>
        <ul class="people" id="fr-results" aria-live="polite"></ul>
        ${incoming.length ? `<h3 class="sub-title">${t('fr.requests')}</h3><ul class="people">${incoming.map(p => row(p, `<button class="mini" data-ax="accept" data-id="${p.id}">${t('fr.accept')}</button><button class="mini ghost" data-ax="decline" data-id="${p.id}" aria-label="${t('fr.decline')}">${icons.close}</button><button class="mini ghost danger" data-ax="blockreq" data-id="${p.id}">${t('fr.block')}</button>`)).join('')}</ul>` : ''}
        <h3 class="sub-title">${t('fr.yours')}</h3>
        ${friends.length ? `<ul class="people">${friends.map(p => row(p, `<button class="mini" data-ax="open" data-id="${p.id}">${t('fr.view')}</button>`)).join('')}</ul>` : `<p class="t-note">${t('fr.none')}</p>`}
        ${outgoing.length ? `<h3 class="sub-title">${t('fr.sent')}</h3><ul class="people">${outgoing.map(p => row(p, `<button class="mini ghost" data-ax="decline" data-id="${p.id}">${t('fr.cancelReq')}</button>`)).join('')}</ul>` : ''}
        ${blocked.length ? `<h3 class="sub-title">${t('fr.blocked')}</h3><ul class="people">${blocked.map(p => row(p, `<button class="mini ghost" data-ax="unblock" data-id="${p.id}">${t('fr.unblock')}</button>`)).join('')}</ul>` : ''}
        ${profile?.visibility === 'public' ? `<div class="foot-actions"><button class="text" data-ax="copy">${t('fr.copyLink')}</button></div>` : ''}
      </div>`
    const q = root.querySelector<HTMLInputElement>('#fr-q')!
    q.oninput = () => {
      clearTimeout(timer)
      timer = window.setTimeout(async () => {
        const out = root.querySelector<HTMLElement>('#fr-results')
        if (!out || !alive()) return
        const my = ++seq
        if (q.value.trim().length < 2) { out.innerHTML = ''; return }
        try {
          const found = (await findPeople(q.value)).filter(p => !links.some(l => l.id === p.id))
          if (my !== seq || !alive() || !out.isConnected) return
          out.innerHTML = found.length ? found.map(p => row(p, `<button class="mini" data-ax="add" data-id="${p.id}">${t('fr.add')}</button>`)).join('') : `<li class="none">${t('fr.noMatch')}</li>`
        } catch { if (my === seq && out.isConnected) out.innerHTML = `<li class="none">${t('acct.error')}</li>` }
      }, 300)
    }
  }

  function drawFriend(p: Link) {
    root.innerHTML = `<div class="sheet">${head()}<button class="back" data-ax="home">${icons.back}${t('fr.title')}</button>
      <h2 class="title">${esc(name(p))}</h2><p class="lede" id="fr-sub">…</p><div id="fr-body"></div></div>`
    const my = ++seq
    void friendMap(p.id).then(rows => {
      if (my !== seq || !alive() || open?.id !== p.id) return
      const theirs = new Set(rows.map(r => r.iso))
      const mine = ctx.myIsos()
      const common = [...theirs].filter(i => mine.has(i))
      const onlyTheirs = [...theirs].filter(i => !mine.has(i))
      const onlyMine = [...mine].filter(i => !theirs.has(i))
      const cities = rows.filter(r => r.place).length
      const list = (isos: string[]) => `<ul class="flags">${isos.slice(0, 24).map(i => `<li><span class="flagchip">${flag(ctx.geo, i)}<span class="fc-name">${esc(ctx.geo.byIso.get(i) ? cname(ctx.geo.byIso.get(i)!) : i)}</span></span></li>`).join('')}${isos.length > 24 ? `<li class="more">${t('fr.more', { n: isos.length - 24 })}</li>` : ''}</ul>`
      const shown = ctx.overlayOf() === p.handle
      root.querySelector('#fr-sub')!.textContent = rows.length ? `${count('country', theirs.size)} · ${count('city', cities)}` : t('fr.empty', { name: name(p) })
      root.querySelector('#fr-body')!.innerHTML = `
        ${rows.length ? `<button class="solid wide" data-ax="overlay">${shown ? t('fr.hideOverlay') : t('fr.showOverlay')}</button>
          <h3 class="sub-title">${t('fr.common')} · ${common.length}</h3>${common.length ? list(common) : ''}
          <h3 class="sub-title">${t('fr.theirsOnly')} · ${onlyTheirs.length}</h3>${onlyTheirs.length ? list(onlyTheirs) : ''}
          <p class="t-note">${t('fr.mineOnly', { n: onlyMine.length })}</p>` : ''}
        <div class="foot-actions"><button class="text" data-ax="remove">${t('fr.remove')}</button><button class="text danger" data-ax="block">${t('fr.block')}</button><button class="text danger" data-ax="report">${t('fr.report')}</button></div>
        <p class="status" id="fr-status" role="status"></p>`
      root.querySelector<HTMLElement>('[data-ax=overlay]')?.addEventListener('click', () => {
        if (ctx.overlayOf() === p.handle) ctx.overlay(null); else { ctx.overlay(rows, p.handle); ctx.close() }
      })
    }).catch(() => { if (my === seq && alive()) { const sub = root.querySelector('#fr-sub'); if (sub) sub.textContent = t('acct.error') } })
  }

  root.onclick = async e => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ax]')
    if (!el) return
    const id = el.dataset.id!
    const btn = el as HTMLButtonElement
    if (btn.disabled) return
    btn.disabled = true // one tap, one request
    try {
      switch (el.dataset.ax) {
        case 'retry': await load(); break
        case 'add': await sendRequest(id); toast(t('fr.requested')); await load(); break
        case 'accept': await acceptRequest(id); await load(); break
        case 'decline': await removeLink(id); await load(); break
        case 'blockreq': { const p = links.find(l => l.id === id); if (p && window.confirm(t('fr.blockSure', { handle: p.handle }))) { await blockPerson(id); await removeLink(id); await load() } break }
        case 'unblock': await unblockPerson(id); await load(); break
        case 'open': open = links.find(l => l.id === id) ?? null; draw(); break
        case 'home': open = null; draw(); break
        case 'remove': if (open) { await removeLink(open.id); if (ctx.overlayOf() === open.handle) ctx.overlay(null); open = null; await load() } break
        case 'block': if (open && window.confirm(t('fr.blockSure', { handle: open.handle }))) { await blockPerson(open.id); if (ctx.overlayOf() === open.handle) ctx.overlay(null); open = null; await load() } break
        case 'report': if (open) {
          const why = window.prompt(t('fr.reportAsk'))
          if (why && why.trim().length >= 3) { await reportPerson(open.id, why.trim()); toast(t('fr.reported')) }
        } break
        case 'copy': {
          const link = `${appUrl()}#/u/${getProfile()!.handle}`
          try { await navigator.clipboard.writeText(link) } catch { window.prompt(t('fr.copyLink'), link) }
          toast(t('fr.linkCopied')); break
        }
      }
    } catch { toast(t('acct.error')) }
    btn.disabled = false
  }
  void load()
}

/** The read-only page behind someone's public link (`#/u/handle`). */
export async function renderPublic(root: HTMLElement, handle: string, ctx: { geo: Geo; close(): void; overlay(rows: MapRow[] | null, handle?: string): void }) {
  root.innerHTML = `<div class="sheet">${head()}<h2 class="title">@${esc(handle)}</h2><p class="lede">…</p></div>`
  const p = await publicProfile(handle)
  if (!p) { root.innerHTML = `<div class="sheet">${head()}<h2 class="title">@${esc(handle)}</h2><p class="lede">${t('pub.notFound')}</p></div>`; return }
  const isos = [...new Set(p.trips.map(r => r.iso))]
  const cities = p.trips.filter(r => r.place).length
  root.innerHTML = `<div class="sheet">${head()}
    <h2 class="title">${t('pub.title', { name: esc(p.display_name || '@' + p.handle) })}</h2>
    <p class="lede">${count('country', isos.length)} · ${count('city', cities)}</p>
    <ul class="flags">${isos.map(i => `<li><span class="flagchip">${flag(ctx.geo, i)}<span class="fc-name">${esc(ctx.geo.byIso.get(i) ? cname(ctx.geo.byIso.get(i)!) : i)}</span></span></li>`).join('')}</ul>
    <div class="foot-actions"><button class="solid" data-ax="map">${t('pub.onMap')}</button><button class="text" data-ax="close">${t('pub.cta')}</button></div></div>`
  root.onclick = e => {
    const k = (e.target as HTMLElement).closest<HTMLElement>('[data-ax]')?.dataset.ax
    if (k === 'map') { ctx.overlay(p.trips, p.handle); ctx.close() } else if (k === 'close') ctx.close()
  }
}
