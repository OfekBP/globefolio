import { LOCALES, getLocale, setLocale, t } from '../i18n'
import { esc } from './format'
import { icons } from './icons'

/** The language sheet. Each language is written in itself, in its own direction, so anyone can find theirs. */
export function renderLanguage(root: HTMLElement, back: () => void) {
  const cur = getLocale()
  root.innerHTML = `
    <div class="sheet">
      <button class="x" data-act="close" aria-label="${t('close')}">${icons.close}</button>
      <h2 class="title">${t('lang.title')}</h2>
      <p class="lede">${t('lang.lede')}</p>
      <ul class="lang-list">${LOCALES.map(l => `
        <li><button class="lang-row" data-lang="${l.code}" lang="${l.code}" dir="${l.dir}" aria-current="${l.code === cur}">
          <span>${esc(l.name)}</span>${l.code === cur ? icons.check : ''}
        </button></li>`).join('')}</ul>
      <div class="foot-actions"><button class="text" data-ax="back">${t('acct.back')}</button></div>
    </div>`
  root.onclick = async e => {
    const el = e.target as HTMLElement
    const pick = el.closest<HTMLElement>('[data-lang]')
    if (pick) { await setLocale(pick.dataset.lang!); return } // the app re-renders this sheet in the new language
    if (el.closest('[data-ax=back]')) back()
  }
}
