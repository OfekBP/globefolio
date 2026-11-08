import '@fontsource-variable/nunito'
import '@fontsource-variable/noto-sans-arabic'
import '@fontsource-variable/noto-sans-hebrew'
import { COPY, type Copy } from './copy'

/** The same ten languages as the app, each with how it writes Tokyo: a taste of the city names the app translates. */
const LANGS = [
  { code: 'en', name: 'English', dir: 'ltr', tokyo: 'Tokyo' },
  { code: 'es', name: 'Español', dir: 'ltr', tokyo: 'Tokio' },
  { code: 'fr', name: 'Français', dir: 'ltr', tokyo: 'Tokyo' },
  { code: 'de', name: 'Deutsch', dir: 'ltr', tokyo: 'Tokio' },
  { code: 'pt', name: 'Português', dir: 'ltr', tokyo: 'Tóquio' },
  { code: 'ru', name: 'Русский', dir: 'ltr', tokyo: 'Токио' },
  { code: 'ar', name: 'العربية', dir: 'rtl', tokyo: 'طوكيو' },
  { code: 'he', name: 'עברית', dir: 'rtl', tokyo: 'טוקיו' },
  { code: 'zh', name: '中文', dir: 'ltr', tokyo: '东京' },
  { code: 'ja', name: '日本語', dir: 'ltr', tokyo: '東京' },
] as const

const KEY = 'tripglobe:lang' // shared with the app, so the app opens in the language chosen here
const known = (c: string | null | undefined): c is string => !!c && LANGS.some(l => l.code === c)

function initial(): string {
  try { const s = localStorage.getItem(KEY); if (known(s)) return s } catch { /* storage blocked */ }
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag.toLowerCase().split('-')[0]
    if (known(base)) return base
  }
  return 'en'
}

const $ = <T extends Element>(s: string) => document.querySelector<T>(s)
const meta = (sel: string, v: string) => $<HTMLMetaElement>(sel)?.setAttribute('content', v)

const select = $<HTMLSelectElement>('#lang')!
const pills = $<HTMLUListElement>('#lang-pills')!
select.innerHTML = LANGS.map(l => `<option value="${l.code}">${l.name}</option>`).join('')
pills.innerHTML = LANGS.map(l => `<li><button type="button" data-code="${l.code}" lang="${l.code}">${l.name}<small>${l.tokyo}</small></button></li>`).join('')

function apply(code: string, remember: boolean) {
  const lang = LANGS.find(l => l.code === code) ?? LANGS[0]
  const c: Copy = { ...COPY.en, ...COPY[lang.code] }
  const root = document.documentElement
  root.lang = lang.code
  root.dir = lang.dir
  document.title = c.title
  meta('meta[name=description]', c.desc)
  meta('meta[property="og:title"]', c.title)
  meta('meta[property="og:description"]', c.desc)
  document.querySelectorAll<HTMLElement>('[data-t]').forEach(el => { el.textContent = c[el.dataset.t!] ?? el.textContent })
  document.querySelectorAll<HTMLImageElement>('img[data-shot]').forEach(img => {
    img.alt = c[img.dataset.alt!] ?? ''
    img.onerror = () => { img.onerror = null; img.src = `landing/${img.dataset.shot}-en.webp` }
    img.src = `landing/${img.dataset.shot}-${lang.code}.webp`
  })
  select.value = lang.code
  select.setAttribute('aria-label', c.menu)
  pills.setAttribute('aria-label', c.menu)
  pills.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.code === lang.code)))
  if (remember) { try { localStorage.setItem(KEY, lang.code) } catch { /* storage blocked */ } }
}

select.addEventListener('change', () => apply(select.value, true))
pills.addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-code]')
  if (b) apply(b.dataset.code!, true)
})

apply(initial(), false)
