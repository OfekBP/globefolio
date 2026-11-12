import { appUrl } from '../supabase'
import { getProfile, getSession } from '../auth'
import { flagUrl, type Geo } from '../data/geo'
import { acceptRequest, blockPerson, findPeople, friendMap, listBlocked, listLinks, publicProfile, removeLink, reportPerson, sendRequest, unblockPerson, type Link, type MapRow, type Person } from '../friends'
import { cname, t } from '../i18n'
import { avatarHtml } from './avatar'
import { ask } from './dialog'
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
  overlay(rows: MapRow[] | null, handle?: string, id?: string, who?: Person): void
  overlayOf(): string | undefined
}

/** Fired by the app when a friendship changes, so an open Friends sheet can refresh itself. */
export const FRIENDS_CHANGED = 'globefolio:friends'

const name = (p: Person) => p.display_name || `@${p.handle}`
const flag = (geo: Geo, iso: string) => { const c = geo.byIso.get(iso); return c && flagUrl(c) ? `<img class="flag" src="${flagUrl(c)}" alt="" />` : '' }
const head = () => `<button class="x" data-act="close" aria-label="${t('close')}">${icons.close}</button>`
const PAGE = 24

/** Shares a message through the phone's share sheet, or copies it where there is none. */
async function share(text: string, url?: string) {
  try {
    if (navigator.share) { await navigator.share({ title: 'GlobeFolio', text, url }); return }
  } catch (e) { if ((e as Error).name === 'AbortError') return }
  try { await navigator.clipboard.writeText(url ? `${text} ${url}` : text); toast(t('fr.linkCopied')) } catch { window.prompt(t('fr.copyLink'), url ? `${text} ${url}` : text) }
}

/** The Friends sheet: find people, answer requests, and open a friend's map to compare it with yours. */
export function renderFriends(root: HTMLElement, ctx: FriendsCtx) {
  if (!getSession()) {
    root.innerHTML = `<div class="sheet">${head()}<h2 class="title">${t('fr.title')}</h2><p class="lede">${t('fr.signinNote')}</p>
      <div class="foot-actions"><button class="solid" data-ax="signin">${t('acct.row')}</button></div></div>`
    root.onclick = e => { if ((e.target as HTMLElement).closest('[data-ax=signin]')) ctx.openAccount() }
    return
  }
  const alive = claim(root, () => document.removeEventListener(FRIENDS_CHANGED, onChanged))
  let links: Link[] = []
  let blocked: Person[] = []
  let timer: number | undefined
  let open: Link | null = null
  let cache: MapRow[] | null = null // the open friend's places
  let expanded = new Set<string>()
  let loadFailed = false
  let seq = 0 // newest search / friend-map request; older answers are dropped

  const row = (p: Person, actions: string, cls = '') => `
    <li class="person${cls}">${avatarHtml(p)}
      <span class="who"><b>${esc(p.display_name || '@' + p.handle)}</b>${p.display_name ? `<small>@${esc(p.handle)}</small>` : ''}</span>${actions}</li>`
  const btn = (p: Person, ax: string, label: string, aria: string, cls = 'mini') => `<button class="${cls}" data-ax="${ax}" data-id="${p.id}" aria-label="${esc(t(aria, { name: name(p) }))}">${label}</button>`

  async function load() {
    try { [links, blocked] = await Promise.all([listLinks(), listBlocked()]); loadFailed = false } catch { loadFailed = true }
    if (alive()) draw()
  }
  const onChanged = () => { if (!alive()) return document.removeEventListener(FRIENDS_CHANGED, onChanged); if (!open) void load() }
  document.addEventListener(FRIENDS_CHANGED, onChanged)

  const focusTitle = () => { const h = root.querySelector<HTMLElement>('.title'); h?.setAttribute('tabindex', '-1'); h?.focus({ preventScroll: true }) }

  async function search() {
    const q = root.querySelector<HTMLInputElement>('#fr-q')
    const out = root.querySelector<HTMLElement>('#fr-results')
    if (!q || !out) return
    const my = ++seq
    const text = q.value.trim()
    if (text.length < 2) { out.innerHTML = text.length ? `<li class="none">${t('fr.searchHint')}</li>` : ''; return }
    try {
      const found = (await findPeople(text)).filter(p => !links.some(l => l.id === p.id))
      if (my !== seq || !alive() || !out.isConnected) return
      out.innerHTML = found.length ? found.map(p => row(p, btn(p, 'add', t('fr.add'), 'fr.ariaAdd'))).join('') : `<li class="none">${t('fr.noMatch')}</li>`
    } catch { if (my === seq && out.isConnected) out.innerHTML = `<li class="none">${t('acct.error')}</li>` }
  }

  function draw(moveFocus = false) {
    if (open) return drawFriend(open, moveFocus)
    if (loadFailed && !links.length) {
      root.innerHTML = `<div class="sheet">${head()}<h2 class="title">${t('fr.title')}</h2><p class="status error" role="alert">${t('acct.error')}</p>
        <div class="foot-actions"><button class="solid" data-ax="retry">${t('retry')}</button></div></div>`
      return
    }
    const keep = root.querySelector<HTMLInputElement>('#fr-q')?.value ?? ''
    const incoming = links.filter(l => l.state === 'incoming')
    const outgoing = links.filter(l => l.state === 'outgoing')
    const friends = links.filter(l => l.state === 'friend')
    const me = getProfile()
    root.innerHTML = `
      <div class="sheet">${head()}
        <h2 class="title">${t('fr.title')}</h2>
        <p class="lede">${t('fr.lede')}</p>
        ${me ? `<div class="me-card">${avatarHtml(me, 'lg')}<span class="who"><small>${t('fr.you')}</small><b>@${esc(me.handle)}</b></span><button class="mini" data-ax="share">${t('fr.share')}</button></div>` : ''}
        <div class="search-field">${icons.search}<input id="fr-q" dir="auto" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="${t('fr.search')}" aria-label="${t('fr.search')}" /></div>
        <ul class="people" id="fr-results" aria-live="polite"></ul>
        ${incoming.length ? `<h3 class="sub-title">${t('fr.requests')} · ${incoming.length}</h3><ul class="people">${incoming.map(p => row(p, `<div class="person-actions">${btn(p, 'accept', t('fr.accept'), 'fr.ariaAccept', 'mini')}${btn(p, 'decline', t('fr.notNow'), 'fr.ariaDecline', 'mini ghost')}${btn(p, 'blockreq', t('fr.block'), 'fr.ariaBlock', 'text danger tiny')}</div>`, ' req')).join('')}</ul>` : ''}
        <h3 class="sub-title">${t('fr.yours')}</h3>
        ${friends.length ? `<ul class="people">${friends.map(p => row(p, btn(p, 'open', t('fr.view'), 'fr.ariaOpen'))).join('')}</ul>` : `<div class="empty-card"><div class="empty-art" aria-hidden="true">🌍</div><p>${t('fr.none')}</p>${me ? `<button class="solid" data-ax="share">${t('fr.share')}</button>` : ''}</div>`}
        ${outgoing.length ? `<h3 class="sub-title">${t('fr.sent')}</h3><ul class="people">${outgoing.map(p => row(p, btn(p, 'decline', t('fr.cancelReq'), 'fr.ariaCancel', 'mini ghost'))).join('')}</ul>` : ''}
        ${blocked.length ? `<h3 class="sub-title">${t('fr.blocked')}</h3><ul class="people">${blocked.map(p => row(p, btn(p, 'unblock', t('fr.unblock'), 'fr.ariaUnblock', 'mini ghost'))).join('')}</ul>` : ''}
      </div>`
    const q = root.querySelector<HTMLInputElement>('#fr-q')!
    q.oninput = () => { clearTimeout(timer); timer = window.setTimeout(() => void search(), 300) }
    if (keep) { q.value = keep; void search() }
    if (moveFocus) focusTitle()
  }

  function paintFriend(p: Link) {
    const rows = cache!
    const theirs = new Set(rows.map(r => r.iso))
    const mine = ctx.myIsos()
    const common = [...theirs].filter(i => mine.has(i))
    const onlyTheirs = [...theirs].filter(i => !mine.has(i))
    const onlyMine = [...mine].filter(i => !theirs.has(i))
    const cities = rows.filter(r => r.place).length
    const list = (isos: string[], key: string) => {
      const all = expanded.has(key)
      const shownIsos = all ? isos : isos.slice(0, PAGE)
      return `<ul class="flags">${shownIsos.map(i => `<li><span class="flagchip">${flag(ctx.geo, i)}<span class="fc-name">${esc(ctx.geo.byIso.get(i) ? cname(ctx.geo.byIso.get(i)!) : i)}</span></span></li>`).join('')}${!all && isos.length > PAGE ? `<li class="more"><button class="text" data-ax="more" data-key="${key}">${t('fr.showAll', { n: isos.length })}</button></li>` : ''}</ul>`
    }
    const shown = ctx.overlayOf() === p.handle
    root.querySelector('#fr-sub')!.textContent = rows.length ? `${count('country', theirs.size)} · ${count('city', cities)}` : t('fr.empty', { name: name(p) })
    root.querySelector('#fr-body')!.innerHTML = `
      ${rows.length ? `<button class="solid wide" data-ax="overlay">${shown ? t('fr.hideOverlay') : t('fr.showOverlay')}</button>
        ${common.length ? `<h3 class="sub-title">${t('fr.common')} · ${common.length}</h3>${list(common, 'c')}` : `<p class="t-note">${t('fr.noOverlap')}</p>`}
        ${onlyTheirs.length ? `<h3 class="sub-title">${t('fr.theirsOnly')} · ${onlyTheirs.length}</h3>${list(onlyTheirs, 't')}` : ''}
        ${onlyMine.length ? `<p class="t-note">${t('fr.mineOnly', { n: onlyMine.length })}</p>` : ''}`
      : `<div class="empty-card"><div class="empty-art" aria-hidden="true">🔒</div><p>${t('fr.emptyHint', { name: name(p) })}</p><button class="solid" data-ax="ask">${t('fr.ask', { name: name(p) })}</button></div>`}
      <div class="foot-actions"><button class="text" data-ax="remove">${t('fr.remove')}</button><button class="text danger" data-ax="block">${t('fr.block')}</button><button class="text danger" data-ax="report">${t('fr.report')}</button></div>
      <p class="status" id="fr-status" role="status"></p>`
  }

  function drawFriend(p: Link, moveFocus = true) {
    root.innerHTML = `<div class="sheet">${head()}<button class="back" data-ax="home">${icons.back}${t('fr.title')}</button>
      <div class="friend-head">${avatarHtml(p, 'lg')}<h2 class="title">${esc(name(p))}</h2></div>${p.status ? `<p class="prof-status">${esc(p.status)}</p>` : ''}${p.bio ? `<p class="t-note">${esc(p.bio)}</p>` : ''}<p class="lede" id="fr-sub">…</p><div id="fr-body"></div></div>`
    if (moveFocus) focusTitle()
    const my = ++seq
    cache = null; expanded = new Set()
    void friendMap(p.id).then(rows => {
      if (my !== seq || !alive() || open?.id !== p.id) return
      cache = rows
      paintFriend(p)
    }).catch(() => { if (my === seq && alive()) { const sub = root.querySelector('#fr-sub'); if (sub) sub.textContent = t('acct.error') } })
  }

  root.onclick = async e => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ax]')
    if (!el) return
    const id = el.dataset.id!
    const b = el as HTMLButtonElement
    if (b.disabled) return
    b.disabled = true // one tap, one request
    const who = (open ?? links.find(l => l.id === id)) as Person | undefined
    try {
      switch (el.dataset.ax) {
        case 'retry': await load(); break
        case 'add': { await sendRequest(id); toast(t('fr.requested')); await load(); break }
        case 'accept': { await acceptRequest(id); if (who) toast(t('fr.accepted', { name: name(who) })); await load(); break }
        case 'decline': { await removeLink(id); toast(t('fr.declined')); await load(); break }
        case 'blockreq': {
          const p = links.find(l => l.id === id)
          if (p && (await ask({ title: t('fr.blockTitle', { name: name(p) }), body: t('fr.blockBody'), confirm: t('fr.block'), danger: true })) !== null) { await blockPerson(id); await removeLink(id); toast(t('fr.blockedToast', { name: name(p) })); await load() }
          break
        }
        case 'unblock': await unblockPerson(id); toast(t('fr.unblocked')); await load(); break
        case 'open': open = links.find(l => l.id === id) ?? null; draw(true); break
        case 'home': open = null; draw(true); break
        case 'more': expanded.add(el.dataset.key!); if (open) paintFriend(open); break
        case 'overlay': if (open && cache) {
          if (ctx.overlayOf() === open.handle) { ctx.overlay(null); paintFriend(open) } else { ctx.overlay(cache, open.handle, open.id, open); ctx.close() }
        } break
        case 'remove': if (open) { const p = open; await removeLink(p.id); if (ctx.overlayOf() === p.handle) ctx.overlay(null); open = null; toast(t('fr.removed', { name: name(p) })); await load() } break
        case 'block': if (open && (await ask({ title: t('fr.blockTitle', { name: name(open) }), body: t('fr.blockBody'), confirm: t('fr.block'), danger: true })) !== null) {
          const p = open; await blockPerson(p.id); if (ctx.overlayOf() === p.handle) ctx.overlay(null); open = null; toast(t('fr.blockedToast', { name: name(p) })); await load()
        } break
        case 'report': if (open) {
          const why = await ask({ title: t('fr.reportTitle', { name: name(open) }), confirm: t('fr.send'), danger: true, reasons: [t('fr.r.harass'), t('fr.r.spam'), t('fr.r.picture'), t('fr.r.other')] })
          if (why) { await reportPerson(open.id, why); toast(t('fr.reported')) }
        } break
        case 'ask': if (open) await share(t('fr.askText')); break
        case 'share': { const me = getProfile(); if (me) { const link = `${appUrl()}#/u/${me.handle}`; await share(t('fr.shareText', { handle: me.handle }), link) } break }
      }
    } catch { toast(t('acct.error')) }
    b.disabled = false
  }
  void load()
}

/** The page behind someone's link (`#/u/handle`): their public map, or, for a private profile, an invitation to add them. */
export async function renderPublic(root: HTMLElement, handle: string, ctx: { geo: Geo; close(): void; overlay(rows: MapRow[] | null, handle?: string): void; overlayOf?(): string | undefined; openAccount?(): void }) {
  root.innerHTML = `<div class="sheet">${head()}<h2 class="title">@${esc(handle)}</h2><p class="lede">…</p></div>`
  const p = await publicProfile(handle)
  if (!p) {
    // a private profile: a signed-in visitor can still send a friend request, which is what an invite link is for
    const found = getSession() ? (await findPeople(handle).catch(() => [])).find(x => x.handle === handle.toLowerCase()) : undefined
    if (found) {
      root.innerHTML = `<div class="sheet">${head()}<div class="friend-head">${avatarHtml(found, 'lg')}<h2 class="title">${esc(name(found))}</h2></div><p class="lede">${t('fr.inviteLede', { name: esc(name(found)) })}</p>
        <div class="foot-actions"><button class="solid" data-ax="add">${t('fr.add')}</button></div></div>`
      root.onclick = async e => {
        const k = (e.target as HTMLElement).closest<HTMLElement>('[data-ax]')?.dataset.ax
        if (k === 'add') { try { await sendRequest(found.id); toast(t('fr.requested')); ctx.close() } catch { toast(t('acct.error')) } }
      }
      return
    }
    const signIn = !getSession() && ctx.openAccount
    root.innerHTML = `<div class="sheet">${head()}<h2 class="title">@${esc(handle)}</h2><p class="lede">${t('pub.notFound')}</p>${signIn ? `<div class="foot-actions"><button class="solid" data-ax="signin">${t('acct.row')}</button></div>` : ''}</div>`
    root.onclick = e => { if ((e.target as HTMLElement).closest('[data-ax=signin]')) ctx.openAccount?.() }
    return
  }
  const isos = [...new Set(p.trips.map(r => r.iso))]
  const cities = p.trips.filter(r => r.place).length
  const on = ctx.overlayOf?.() === p.handle
  root.innerHTML = `<div class="sheet">${head()}
    <div class="friend-head">${avatarHtml(p, 'lg')}<h2 class="title">${t('pub.title', { name: esc(p.display_name || '@' + p.handle) })}</h2></div>
    ${p.status ? `<p class="prof-status">${esc(p.status)}</p>` : ''}${p.bio ? `<p class="t-note">${esc(p.bio)}</p>` : ''}
    <p class="lede">${count('country', isos.length)} · ${count('city', cities)}</p>
    <ul class="flags">${isos.map(i => `<li><span class="flagchip">${flag(ctx.geo, i)}<span class="fc-name">${esc(ctx.geo.byIso.get(i) ? cname(ctx.geo.byIso.get(i)!) : i)}</span></span></li>`).join('')}</ul>
    <div class="foot-actions"><button class="solid" data-ax="map">${on ? t('fr.hideOverlay') : t('pub.onMap')}</button><button class="text" data-ax="close">${t('pub.cta')}</button></div></div>`
  root.onclick = e => {
    const k = (e.target as HTMLElement).closest<HTMLElement>('[data-ax]')?.dataset.ax
    if (k === 'map') { if (on) ctx.overlay(null); else ctx.overlay(p.trips, p.handle); ctx.close() } else if (k === 'close') ctx.close()
  }
}
