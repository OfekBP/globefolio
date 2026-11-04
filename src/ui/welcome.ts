import { t } from '../i18n'
import { signInHtml, wireSignIn } from './account'

const KEY = 'globefolio:welcomed'

export function welcomeSeen() {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

export function markWelcomed() {
  try { localStorage.setItem(KEY, '1') } catch { /* private mode: it will simply show again next time */ }
}

/** First-launch screen: sign in or sign up, or carry on without an account. Returns a function that closes it. */
export function showWelcome(onGuest: () => void): () => void {
  const el = document.createElement('div')
  el.id = 'welcome'
  el.className = 'welcome'
  el.setAttribute('role', 'dialog')
  el.setAttribute('aria-modal', 'true')
  el.setAttribute('aria-labelledby', 'wel-h')
  el.innerHTML = `
    <div class="wel-card">
      <img class="wel-logo" src="./brand/logo-mark.svg" alt="" width="72" height="72" />
      <h1 id="wel-h" class="wel-name">GlobeFolio</h1>
      <p class="wel-tag">${t('wel.tag')}</p>
      <p class="lede wel-lede">${t('wel.lede')}</p>
      ${signInHtml()}
      <div class="wel-skip">
        <button class="solid wide ghost-btn" type="button" data-ax="back">${t('wel.skip')}</button>
        <p class="fine">${t('wel.skipNote')}</p>
      </div>
    </div>`
  document.body.append(el)
  wireSignIn(el, () => { markWelcomed(); close(); onGuest() })
  const first = el.querySelector<HTMLElement>('#wel-h')
  first?.setAttribute('tabindex', '-1')
  first?.focus({ preventScroll: true })
  function close() {
    markWelcomed()
    el.classList.add('gone')
    setTimeout(() => el.remove(), 350)
  }
  return close
}
