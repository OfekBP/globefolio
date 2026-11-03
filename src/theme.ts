export type Theme = 'light' | 'dark'

const KEY = 'triptrack:theme'
const OLD_KEY = 'wayfarer:theme'
const listeners = new Set<(t: Theme) => void>()

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

/** First visit follows the system; after that the owner's choice wins. */
export function initTheme(): Theme {
  let saved: string | null = null
  try { saved = localStorage.getItem(KEY) ?? localStorage.getItem(OLD_KEY) } catch { /* private mode */ }
  const t: Theme = saved === 'light' || saved === 'dark' ? saved : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  document.documentElement.dataset.theme = t
  return t
}

export function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t
  try { localStorage.setItem(KEY, t) } catch { /* private mode */ }
  listeners.forEach(fn => fn(t))
}

export const onTheme = (fn: (t: Theme) => void) => listeners.add(fn)
