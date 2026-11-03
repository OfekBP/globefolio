import en from './locales/en'
import type { Country } from './data/geo'

/**
 * Translations. English ships in the main bundle; every other language is a small file fetched the first time it is chosen.
 * A missing key falls back to English, so a half-translated language never shows a blank.
 */
export type Entry = string | Partial<Record<Intl.LDMLPluralRule, string>>
export type Dict = Record<string, Entry>

export interface Locale { code: string; name: string; dir: 'ltr' | 'rtl' }
export const LOCALES: Locale[] = [
  { code: 'en', name: 'English', dir: 'ltr' },
  { code: 'es', name: 'Español', dir: 'ltr' },
  { code: 'fr', name: 'Français', dir: 'ltr' },
  { code: 'de', name: 'Deutsch', dir: 'ltr' },
  { code: 'pt', name: 'Português', dir: 'ltr' },
  { code: 'ru', name: 'Русский', dir: 'ltr' },
  { code: 'ar', name: 'العربية', dir: 'rtl' },
  { code: 'he', name: 'עברית', dir: 'rtl' },
  { code: 'zh', name: '中文', dir: 'ltr' },
  { code: 'ja', name: '日本語', dir: 'ltr' },
]

const loaders: Record<string, () => Promise<{ default: Dict }>> = {
  es: () => import('./locales/es'), fr: () => import('./locales/fr'), de: () => import('./locales/de'), pt: () => import('./locales/pt'),
  ru: () => import('./locales/ru'), ar: () => import('./locales/ar'), he: () => import('./locales/he'), zh: () => import('./locales/zh'), ja: () => import('./locales/ja'),
}

const KEY = 'tripglobe:lang'
let code = 'en'
let dict: Dict = en
let rules = new Intl.PluralRules('en')
let numFmt = new Intl.NumberFormat('en')
let regionNames: Intl.DisplayNames | null = null
const listeners = new Set<() => void>()

export const getLocale = () => code
export const isRtl = () => LOCALES.find(l => l.code === code)?.dir === 'rtl'
export const onLocale = (fn: () => void) => { listeners.add(fn) }
/** Numbers always use Western digits so they line up with the map and stamps in every language. */
const tag = () => `${code}-u-nu-latn`

export const num = (n: number) => numFmt.format(n)

/** Looks up a string. `n` selects the plural form; every {name} in the text is replaced from `vars` (numbers are formatted for the language). */
export function t(key: string, vars: Record<string, string | number> = {}): string {
  let e: Entry | undefined = dict[key] ?? en[key]
  if (e === undefined) return key
  if (typeof e !== 'string') {
    const n = Number(vars.n ?? 0)
    e = e[rules.select(n)] ?? e.other ?? (en[key] as Record<string, string>)?.other ?? key
  }
  return e.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? (typeof vars[k] === 'number' ? num(vars[k] as number) : String(vars[k])) : `{${k}}`))
}

/** A country's name in the chosen language (the browser knows them all); English data is the fallback. */
export function cname(c: Country): string {
  const a = c.properties.a
  if (code === 'en' || !a || !regionNames) return c.properties.n
  try { return regionNames.of(a.toUpperCase()) || c.properties.n } catch { return c.properties.n }
}

export function pickInitial(): string {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved && LOCALES.some(l => l.code === saved)) return saved
  } catch { /* private mode */ }
  for (const l of navigator.languages ?? [navigator.language]) {
    const base = l.toLowerCase().split('-')[0]
    const hit = LOCALES.find(x => x.code === (base === 'iw' ? 'he' : base))
    if (hit) return hit.code
  }
  return 'en'
}

function apply() {
  const loc = LOCALES.find(l => l.code === code)!
  const h = document.documentElement
  h.lang = code
  h.dir = loc.dir
  rules = new Intl.PluralRules(code)
  numFmt = new Intl.NumberFormat(tag())
  try { regionNames = new Intl.DisplayNames([code], { type: 'region' }) } catch { regionNames = null }
  document.title = t('app.title')
  document.querySelector('meta[name=description]')?.setAttribute('content', t('app.description'))
  translateStatic()
}

/** Fills the fixed markup in index.html: data-i18n (text), data-i18n-label (aria-label), data-i18n-ph (placeholder), data-i18n-title. */
export function translateStatic(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n!) })
  root.querySelectorAll<HTMLElement>('[data-i18n-label]').forEach(el => el.setAttribute('aria-label', t(el.dataset.i18nLabel!)))
  root.querySelectorAll<HTMLElement>('[data-i18n-ph]').forEach(el => el.setAttribute('placeholder', t(el.dataset.i18nPh!)))
}

export async function setLocale(next: string, remember = true) {
  if (!LOCALES.some(l => l.code === next)) next = 'en'
  if (next !== 'en' && loaders[next]) dict = (await loaders[next]()).default
  else dict = en
  code = next
  if (remember) { try { localStorage.setItem(KEY, next) } catch { /* private mode */ } }
  apply()
  listeners.forEach(fn => fn())
}

export const initLocale = () => setLocale(pickInitial(), false)
