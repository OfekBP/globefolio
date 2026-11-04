import { LOCALES, getLocale, onLocale, setLocale, t } from '../i18n'
import { icons } from './icons'
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
  let alive = true
  const paint = () => {
    const hadLang = document.activeElement?.id === 'wel-lang'
    const email = el.querySelector<HTMLInputElement>('#a-email')?.value ?? ''
    el.lang = getLocale()
    el.innerHTML = `
      <label class="wel-lang">${icons.globe}<span class="sr">${t('lang.title')}</span>
        <select id="wel-lang" aria-label="${t('lang.title')}">${LOCALES.map(l => `<option value="${l.code}" lang="${l.code}"${l.code === getLocale() ? ' selected' : ''}>${l.name}</option>`).join('')}</select>
      </label>
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
    wireSignIn(el, () => { markWelcomed(); close(); onGuest() })
    const inp = el.querySelector<HTMLInputElement>('#a-email')
    if (inp && email) inp.value = email
    const sel = el.querySelector<HTMLSelectElement>('#wel-lang')!
    sel.onchange = e => { void setLocale((e.target as HTMLSelectElement).value) }
    if (hadLang) sel.focus()
  }
  document.body.append(el)
  paint()
  onLocale(() => { if (alive) paint() }) // pick a language and the whole screen switches, direction included
  const first = el.querySelector<HTMLElement>('#wel-h')
  first?.setAttribute('tabindex', '-1')
  first?.focus({ preventScroll: true })
  function close() {
    alive = false
    markWelcomed()
    el.classList.add('gone')
    setTimeout(() => el.remove(), 350)
  }
  return close
}
