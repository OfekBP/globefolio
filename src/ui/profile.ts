import { type Profile, updateProfile } from '../auth'
import { ACCENTS, currentAccent, setAccent } from '../accent'
import { t } from '../i18n'
import { avatarHtml, photoToDataUrl, PRESETS } from './avatar'
import { esc } from './format'
import { toast } from './toast'

let picOpen = false // the picture chooser stays open across the redraw a save causes

/** The top of the account sheet: picture, name and the few lines that make it yours. */
export function profileHtml(p: Profile, email: string) {
  const preset = p.avatar?.startsWith('a:') ? p.avatar : ''
  return `
  <div class="prof">
    <button class="prof-av" type="button" data-pe="pic" aria-expanded="${picOpen}" aria-controls="pic-panel" aria-label="${t('acct.pic')}">${avatarHtml(p, 'xl')}<span class="prof-edit" aria-hidden="true">✎</span></button>
    <div class="prof-id"><h2 class="title prof-title">${esc(p.display_name || '@' + p.handle)}</h2><p class="lede">@${esc(p.handle)} · ${esc(email)}</p>${p.status ? `<p class="prof-status">${esc(p.status)}</p>` : ''}</div>
  </div>
  <div class="pic-panel" id="pic-panel"${picOpen ? '' : ' hidden'}>
    <h3 class="sub-title">${t('acct.picTitle')}</h3>
    <div class="av-grid" role="group" aria-label="${t('acct.picTitle')}">${PRESETS.map((pr, i) => `<button type="button" class="av-opt" data-pe="preset" data-id="a:${pr.id}" aria-pressed="${preset === `a:${pr.id}`}" aria-label="${t('acct.picN', { n: i + 1 })}">${pr.e}</button>`).join('')}</div>
    <div class="foot-actions"><label class="mini upload">${t('acct.picUpload')}<input id="pic-file" type="file" accept="image/*" hidden /></label>${p.avatar ? `<button type="button" class="text" data-pe="clearpic">${t('acct.picRemove')}</button>` : ''}</div>
    <p class="fine">${t('acct.picNote')}</p>
  </div>
  <form id="prof-form" novalidate class="prof-form">
    <div class="field"><label for="p-name">${t('acct.name')}</label><input id="p-name" maxlength="40" autocomplete="name" value="${esc(p.display_name ?? '')}" /></div>
    <div class="field"><label for="p-status">${t('acct.status')}</label><input id="p-status" maxlength="60" placeholder="${t('acct.statusPh')}" value="${esc(p.status ?? '')}" /></div>
    <div class="field"><label for="p-bio">${t('acct.bio')}</label><textarea id="p-bio" maxlength="120" rows="2" placeholder="${t('acct.bioPh')}">${esc(p.bio ?? '')}</textarea></div>
    <button class="solid wide" type="submit">${t('acct.save')}</button>
  </form>
  <h3 class="sub-title">${t('acct.accent')}</h3>
  ${swatchesHtml()}
  <p class="fine">${t('acct.accentNote')}</p>`
}

/** The color choices. Shared by the account sheet and Settings, so guests can pick one too. */
export function swatchesHtml() {
  const cur = currentAccent()
  return `<div class="swatches" role="group" aria-label="${t('acct.accent')}">
    <button type="button" class="swatch swatch-default" data-sw="" aria-pressed="${cur === null}" aria-label="${t('acct.accentDefault')}"></button>
    ${ACCENTS.map((c, i) => `<button type="button" class="swatch" data-sw="${c}" style="background:${c}" aria-pressed="${cur === c}" aria-label="${t('acct.colorN', { n: i + 1 })}"></button>`).join('')}</div>`
}

/** Wires the color buttons. When someone is signed in, the color also goes on their profile so friends and other devices see it. */
export function wireSwatches(root: HTMLElement, signedIn: boolean) {
  root.querySelectorAll<HTMLButtonElement>('[data-sw]').forEach(b => {
    b.onclick = async () => {
      const hex = b.dataset.sw || null
      setAccent(hex)
      root.querySelectorAll<HTMLButtonElement>('[data-sw]').forEach(o => o.setAttribute('aria-pressed', String((o.dataset.sw || null) === hex)))
      if (signedIn) { try { await updateProfile({ accent: hex }) } catch { toast(t('acct.error')) } }
    }
  })
}

/** Wires picture choosing and the profile form. */
export function wireProfile(root: HTMLElement) {
  const panel = root.querySelector<HTMLElement>('#pic-panel')!
  const save = async (patch: Parameters<typeof updateProfile>[0]) => {
    try { await updateProfile(patch); toast(t('acct.saved')) } catch { toast(t('acct.error')) }
  }
  root.querySelector<HTMLElement>('[data-pe=pic]')!.onclick = e => {
    picOpen = panel.hidden
    panel.hidden = !picOpen
    ;(e.currentTarget as HTMLElement).setAttribute('aria-expanded', String(picOpen))
  }
  root.querySelectorAll<HTMLElement>('[data-pe=preset]').forEach(b => { b.onclick = () => void save({ avatar: b.dataset.id! }) })
  root.querySelector<HTMLElement>('[data-pe=clearpic]')?.addEventListener('click', () => void save({ avatar: null }))
  root.querySelector<HTMLInputElement>('#pic-file')!.onchange = async e => {
    const f = (e.target as HTMLInputElement).files?.[0]
    if (!f) return
    let url: string
    try { url = await photoToDataUrl(f) } catch { toast(t('acct.picBad')); return }
    await save({ avatar: url })
  }
  root.querySelector<HTMLFormElement>('#prof-form')!.onsubmit = e => {
    e.preventDefault()
    const v = (id: string) => root.querySelector<HTMLInputElement>(id)!.value.trim()
    void save({ display_name: v('#p-name') || null, status: v('#p-status') || null, bio: v('#p-bio') || null })
  }
  wireSwatches(root, true)
}
