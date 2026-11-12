import { emailEnabled, appleEnabled, contactEmail, createProfile, deleteAccount, exportCloudData, getProfile, getSession, googleButtonEnabled, profileLoadFailed, profileLoading, reloadProfile, handleAvailable, handleOk, renderGoogleButton, signInWithEmail, signInWithPassword, signUpWithPassword, sendPasswordReset, setNewPassword, isRecovering, signInWithProvider, signOutRemote, updateProfile, type Visibility } from '../auth'
import { t } from '../i18n'
import { flush, onSyncState, stopSync, syncState } from '../sync'
import { esc } from './format'
import { icons } from './icons'
import { toast } from './toast'

interface Ctx { back(): void; close(): void }

const link = (href: string, text: string) => `<a href="${href}" target="_blank" rel="noopener">${esc(text)}</a>`

/** The sign-in controls (Google, email link, consent line). Shared by the account sheet and the first-launch welcome screen. */
export function signInHtml() {
  return `<div class="auth-stack">
  ${googleButtonEnabled ? `<div class="g-btn" id="g-btn"><div class="g-face"><svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>${t('acct.google')}</div><div class="g-hit" id="g-hit"></div></div>` : ''}
  <button class="solid wide" data-ax="google"${googleButtonEnabled ? ' hidden' : ''}>${t('acct.google')}</button>
  ${appleEnabled ? `<button class="solid wide dark" data-ax="apple">${t('acct.apple')}</button>` : ''}
</div>
${emailEnabled ? `<p class="or"><span>${t('acct.or')}</span></p><div id="pw-area"></div>` : ''}
<p class="status" id="a-status" role="status"></p>
<p class="fine">${t('acct.consent', { terms: link('./terms.html', t('acct.terms')), privacy: link('./privacy.html', t('acct.privacy')) })}</p>
  `
}

type Mode = 'in' | 'up' | 'forgot'
const eyeOn = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>'
const eyeOff = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 6.2A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.5 6.8C3.7 8.6 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.2-.9M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>'

const passwordField = (id: string, label: string, auto: string) => `<div class="field"><label for="${id}">${label}</label>
  <div class="pw"><input id="${id}" type="password" autocomplete="${auto}" dir="ltr" autocapitalize="none" spellcheck="false" /><button class="eye" type="button" data-eye="${id}" aria-label="${t('acct.show')}" aria-pressed="false">${eyeOn}</button></div></div>`

function wireEyes(root: HTMLElement) {
  root.querySelectorAll<HTMLButtonElement>('[data-eye]').forEach(b => {
    b.onclick = () => {
      const input = root.querySelector<HTMLInputElement>('#' + b.dataset.eye)!
      const show = input.type === 'password'
      input.type = show ? 'text' : 'password'
      b.innerHTML = show ? eyeOff : eyeOn
      b.setAttribute('aria-pressed', String(show))
      b.setAttribute('aria-label', t(show ? 'acct.hide' : 'acct.show'))
      input.focus()
    }
  })
}

/** Email + password: a Sign in / Create account switch, a forgot-password step, and the email-link fallback. */
function wirePasswordArea(area: HTMLElement, say: (m: string, bad?: boolean) => void) {
  const emailOk = (v: string) => /^\S+@\S+\.\S+$/.test(v)
  let carry = ''
  const paint = (mode: Mode) => {
    say('')
    const email = `<div class="field"><label for="a-email">${t('acct.email')}</label><input id="a-email" type="email" inputmode="email" autocomplete="email" dir="ltr" autocapitalize="none" spellcheck="false" placeholder="${t('acct.emailPh')}" value="${esc(carry)}" /></div>`
    if (mode === 'forgot') {
      area.innerHTML = `<h3 class="pw-title">${t('acct.resetTitle')}</h3><p class="pw-note">${t('acct.resetLede')}</p>
        <form id="pw-form" novalidate>${email}<button class="solid wide" type="submit">${t('acct.resetBtn')}</button></form>
        <button class="text center" type="button" data-mode="in">${t('acct.backToSignIn')}</button>`
    } else {
      const up = mode === 'up'
      area.innerHTML = `<div class="seg" role="group">
          <button type="button" data-mode="in" aria-pressed="${!up}">${t('acct.signIn')}</button>
          <button type="button" data-mode="up" aria-pressed="${up}">${t('acct.signUp')}</button></div>
        <form id="pw-form" novalidate>${email}${passwordField('a-pw', t('acct.password'), up ? 'new-password' : 'current-password')}
          ${up ? `<p class="pw-note">${t('acct.pwHint')}</p>` : `<div class="forgot"><button class="text" type="button" data-mode="forgot">${t('acct.forgot')}</button></div>`}
          <button class="solid wide" type="submit">${up ? t('acct.signUp') : t('acct.signIn')}</button></form>
        ${up ? '' : `<button class="text center" type="button" data-mode="link">${t('acct.emailBtn')}</button>`}`
    }
    wireEyes(area)
    area.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b => {
      b.onclick = () => {
        carry = area.querySelector<HTMLInputElement>('#a-email')?.value.trim() ?? carry
        const m = b.dataset.mode as Mode | 'link'
        if (m === 'link') void emailLink(); else paint(m)
      }
    })
    area.querySelector<HTMLFormElement>('#pw-form')!.onsubmit = e => { e.preventDefault(); void submit(mode) }
  }
  const lock = (on: boolean) => area.querySelectorAll('button').forEach(b => { b.disabled = on }) // a second tap would only trip the email rate limit
  const emailLink = async () => {
    const email = area.querySelector<HTMLInputElement>('#a-email')!.value.trim()
    if (!emailOk(email)) { say(t('acct.emailBad'), true); return }
    lock(true)
    try { await signInWithEmail(email); say(t('acct.sent', { email })) } catch { say(t('acct.error'), true) }
    lock(false)
  }
  const submit = async (mode: Mode) => {
    const email = area.querySelector<HTMLInputElement>('#a-email')!.value.trim()
    const pw = area.querySelector<HTMLInputElement>('#a-pw')?.value ?? ''
    if (!emailOk(email)) { say(t('acct.emailBad'), true); return }
    if (mode === 'up' && pw.length < 8) { say(t('acct.pwShort'), true); return }
    if (mode === 'in' && !pw) { say(t('acct.wrongPw'), true); return }
    lock(true)
    try {
      if (mode === 'in') await signInWithPassword(email, pw)
      else if (mode === 'up') { if (!(await signUpWithPassword(email, pw))) say(t('acct.confirmSent', { email })) }
      else { await sendPasswordReset(email); say(t('acct.resetSent', { email })) }
    } catch { say(mode === 'in' ? t('acct.wrongPw') : t('acct.error'), true) }
    lock(false)
  }
  paint('in')
}

/** Shown after the link in a reset email is opened: choose a new password. */
function renderNewPassword(root: HTMLElement, ctx: Ctx) {
  root.innerHTML = `<div class="sheet"><h2 class="title">${t('acct.newPwTitle')}</h2><p class="lede">${t('acct.newPwLede')}</p>
    <form id="np-form" novalidate>${passwordField('a-np', t('acct.password'), 'new-password')}<p class="pw-note">${t('acct.pwHint')}</p>
      <p class="status" id="a-status" role="status"></p>
      <button class="solid wide" type="submit">${t('acct.newPwBtn')}</button></form></div>`
  wireEyes(root)
  const status = root.querySelector<HTMLElement>('#a-status')!
  root.querySelector<HTMLFormElement>('#np-form')!.onsubmit = async e => {
    e.preventDefault()
    const pw = root.querySelector<HTMLInputElement>('#a-np')!.value
    status.classList.add('error')
    if (pw.length < 8) { status.textContent = t('acct.pwShort'); return }
    const go = root.querySelector<HTMLButtonElement>('#np-form [type=submit]')!
    go.disabled = true
    try { await setNewPassword(pw); toast(t('acct.newPwDone')); ctx.back() } catch { status.textContent = t('acct.error'); go.disabled = false }
  }
}

/** Hooks up the controls from signInHtml(). `[data-ax=back]` calls onBack. */
export function wireSignIn(root: HTMLElement, onBack: () => void) {
  const status = root.querySelector<HTMLElement>('#a-status')!
  const say = (m: string, bad = false) => { status.textContent = m; status.classList.toggle('error', bad) }
  const oauth = (p: 'google' | 'apple', btn?: HTMLButtonElement | null) => {
    if (btn) btn.disabled = true
    return signInWithProvider(p).catch(() => { say(t('acct.error'), true); if (btn) btn.disabled = false })
  }
  if (googleButtonEnabled) {
    const fallback = () => { root.querySelector<HTMLElement>('#g-btn')?.remove(); root.querySelector<HTMLElement>('[data-ax=google]')?.removeAttribute('hidden') }
    renderGoogleButton(root.querySelector<HTMLElement>('#g-hit')!, () => say(t('acct.error'), true)).catch(fallback)
  }
  root.onclick = e => {
    const el = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-ax]')
    const k = el?.dataset.ax
    if (k === 'google') void oauth('google', el)
    else if (k === 'apple') void oauth('apple', el)
    else if (k === 'back') onBack()
  }
  const area = root.querySelector<HTMLElement>('#pw-area')
  if (area) wirePasswordArea(area, say)
}

/** The account sheet: sign in, pick a handle, and the privacy and data controls. It shows whichever step the person is on. */
export function renderAccount(root: HTMLElement, ctx: Ctx) {
  const session = getSession()
  const profile = getProfile()
  const head = `<button class="x" data-act="close" aria-label="${t('close')}">${icons.close}</button>`
  if (session && isRecovering()) { renderNewPassword(root, ctx); return }
  const legal = `<p class="fine">${link('./privacy.html', t('acct.privacy'))} · ${link('./terms.html', t('acct.terms'))}</p>`

  if (!session) {
    root.innerHTML = `
      <div class="sheet">
        ${head}
        <h2 class="title">${t('acct.title')}</h2>
        <p class="lede">${t('acct.lede')}</p>
        ${signInHtml()}
        <div class="foot-actions"><button class="text" data-ax="back">${t('acct.guest')}</button></div>
      </div>`
    wireSignIn(root, ctx.back)
    return
  }

  if (!profile && profileLoadFailed()) {
    // the profile could not be fetched (offline, say): that is not the same as having none, so do not offer to create one
    root.innerHTML = `<div class="sheet">${head}<h2 class="title">${t('acct.title')}</h2><p class="status error" role="alert">${t('acct.error')}</p>
      <div class="foot-actions"><button class="solid" data-ax="retry">${t('retry')}</button><button class="text" data-ax="back">${t('acct.back')}</button></div></div>`
    root.onclick = e => {
      const k = (e.target as HTMLElement).closest<HTMLElement>('[data-ax]')?.dataset.ax
      if (k === 'retry') void reloadProfile(); else if (k === 'back') ctx.back()
    }
    return
  }

  if (!profile && profileLoading()) {
    root.innerHTML = `<div class="sheet">${head}<h2 class="title">${t('acct.title')}</h2><p class="status" role="status">${t('acct.loading')}</p></div>`
    root.onclick = e => { if ((e.target as HTMLElement).closest('[data-act=close]')) ctx.back() }
    return
  }

  if (!profile) {
    root.innerHTML = `
      <div class="sheet">
        ${head}
        <h2 class="title">${t('acct.handleTitle')}</h2>
        <p class="lede">${t('acct.handleLede')}</p>
        <form id="handle-form" novalidate>
          <div class="field"><label for="a-handle">${t('acct.handle')}</label><input id="a-handle" dir="ltr" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="20" /></div>
          <div class="field"><label for="a-name">${t('acct.name')}</label><input id="a-name" maxlength="40" autocomplete="name" /></div>
          <p class="status" id="a-status" role="status"></p>
          <button class="solid wide" type="submit">${t('acct.create')}</button>
        </form>
        ${legal}
      </div>`
    const status = root.querySelector<HTMLElement>('#a-status')!
    root.querySelector<HTMLFormElement>('#handle-form')!.onsubmit = async e => {
      e.preventDefault()
      const h = root.querySelector<HTMLInputElement>('#a-handle')!.value.trim().toLowerCase()
      const name = root.querySelector<HTMLInputElement>('#a-name')!.value
      status.classList.add('error')
      if (!handleOk(h)) { status.textContent = t('acct.handleBad'); return }
      if (!(await handleAvailable(h))) { status.textContent = t('acct.handleTaken'); return }
      const go = root.querySelector<HTMLButtonElement>('#handle-form [type=submit]')
      if (go) go.disabled = true
      try { await createProfile(h, name); toast(`@${h}`) } catch (err) {
        status.textContent = /taken/i.test((err as Error).message) ? t('acct.handleTaken') : t('acct.error')
        if (go) go.disabled = false
      }
    }
    root.onclick = e => { if ((e.target as HTMLElement).closest('[data-ax=back]')) ctx.back() }
    return
  }

  const vis = (v: Visibility) => `
    <label class="vis-row"><input type="radio" name="vis" value="${v}" ${profile.visibility === v ? 'checked' : ''} />
      <span><b>${t(`acct.vis.${v}`)}</b><small>${t(`acct.vis.${v}Note`)}</small></span></label>`
  root.innerHTML = `
    <div class="sheet">
      ${head}
      <h2 class="title">@${esc(profile.handle)}</h2>
      <p class="lede">${t('acct.signedIn', { email: esc(session.user.email ?? '') })}</p>
      <p class="sync-line" id="sync-line" role="status"></p>
      <h3 class="sub-title">${t('acct.vis')}</h3>
      <fieldset class="vis">${vis('private')}${vis('friends')}${vis('public')}</fieldset>
      <p class="fine">${t('acct.hideNote')}</p>
      <ul class="setting acct-actions">
        <li><button data-ax="export"><span>${icons.download}</span><b>${t('acct.export')}</b><small>${t('acct.exportNote')}</small></button></li>
        <li><button data-ax="signout"><span>${icons.user}</span><b>${t('acct.signOut')}</b><small>${t('acct.signOutNote')}</small></button></li>
      </ul>
      <p class="status error" id="a-status" role="alert"></p>
      <details class="danger-zone">
        <summary>${t('acct.delete')}</summary>
        <p class="fine">${t('acct.deleteWarn')}</p>
        <div class="field"><label for="a-confirm">${t('acct.deleteConfirm')}</label><input id="a-confirm" dir="ltr" autocomplete="off" autocapitalize="none" spellcheck="false" /></div>
        <button class="solid wide danger" data-ax="delete" disabled>${t('acct.deleteBtn')}</button>
      </details>
      <p class="fine">${link(`mailto:${contactEmail}`, t('acct.contact'))}</p>
      ${legal}
    </div>`

  const line = root.querySelector<HTMLElement>('#sync-line')!
  const paint = () => { line.textContent = t(`acct.sync.${syncState() === 'off' ? 'syncing' : syncState()}`); line.dataset.state = syncState() }
  paint()
  const off = onSyncState(() => { if (line.isConnected) paint(); else off() })

  const status = root.querySelector<HTMLElement>('#a-status')!
  let leaveAnyway = false
  const confirm = root.querySelector<HTMLInputElement>('#a-confirm')!
  const del = root.querySelector<HTMLButtonElement>('[data-ax=delete]')!
  confirm.oninput = () => { del.disabled = confirm.value.trim().toLowerCase() !== profile.handle }
  root.onchange = e => {
    const r = e.target as HTMLInputElement
    if (r.name === 'vis') {
      void updateProfile({ visibility: r.value as Visibility }).catch(() => {
        status.textContent = t('acct.error')
        // show what is really saved, not the choice that did not go through
        root.querySelectorAll<HTMLInputElement>('input[name=vis]').forEach(i => { i.checked = i.value === getProfile()?.visibility })
      })
    }
  }
  root.onclick = async e => {
    const k = (e.target as HTMLElement).closest<HTMLElement>('[data-ax]')?.dataset.ax
    status.textContent = ''
    if (k === 'export') {
      try {
        const data = await exportCloudData()
        const a = document.createElement('a')
        a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
        a.download = `globefolio-account-${new Date().toISOString().slice(0, 10)}.json`
        a.click()
        URL.revokeObjectURL(a.href)
      } catch { status.textContent = t('acct.error') }
    } else if (k === 'signout') {
      if (!(await flush()) && !leaveAnyway) { leaveAnyway = true; status.textContent = `${t('acct.signOutFail')} ${t('acct.signOutAgain')}`; return }
      try { await signOutRemote() } catch { status.textContent = t('acct.error'); return } // only wipe this phone once the server agreed
      await stopSync({ wipe: true })
      ctx.close()
    } else if (k === 'delete' && !del.disabled) {
      try {
        await deleteAccount()
        await stopSync({ wipe: false, forget: true }) // the trips on this phone stay, as a guest map
        await signOutRemote()
        ctx.close()
        toast(t('acct.deleted'))
      } catch { status.textContent = t('acct.error') }
    }
  }
}
