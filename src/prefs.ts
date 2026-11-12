/** Small per-device preferences. They live in localStorage and never sync, because they describe this screen, not the trips. */
export type Units = 'km' | 'mi'
export interface Prefs { units: Units; spin: boolean; haptics: boolean; accent: string }

const KEY = 'tripglobe:prefs'
const DEFAULTS: Prefs = { units: 'km', spin: true, haptics: true, accent: '' }

// the United States, Liberia and Myanmar default to miles; everyone else to kilometres
const MILES = /^(en-US|en-LR|my)\b/i
const guess = (): Units => { try { return MILES.test(navigator.language) ? 'mi' : 'km' } catch { return 'km' } }

let cur: Prefs = { ...DEFAULTS }
try {
  const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Prefs> | null
  cur = { ...DEFAULTS, units: raw?.units ?? guess(), spin: raw?.spin ?? true, haptics: raw?.haptics ?? true, accent: typeof raw?.accent === 'string' ? raw.accent : '' }
} catch { cur = { ...DEFAULTS, units: guess() } }

const listeners = new Set<() => void>()
export const prefs = (): Prefs => cur
export const onPrefs = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }

export function setPref<K extends keyof Prefs>(k: K, v: Prefs[K]) {
  cur = { ...cur, [k]: v }
  try { localStorage.setItem(KEY, JSON.stringify(cur)) } catch { /* private mode */ }
  listeners.forEach(fn => fn())
}

const KM_PER_MILE = 1.609344
/** A distance in kilometres, as the number to show in the chosen unit. */
export const inUnits = (km: number) => (cur.units === 'mi' ? km / KM_PER_MILE : km)
