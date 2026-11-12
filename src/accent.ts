import { onTheme, currentTheme } from './theme'
import { prefs, setPref } from './prefs'

/** The colors people can pick from. Each one is turned into readable button and link colors for the light and dark theme. */
export const ACCENTS = ['#0e7490', '#e0533d', '#d94f8a', '#7b5cf0', '#4f63e0', '#2f9e6f', '#6aa11a', '#d9890b', '#8a5a3c', '#5b6b84']
export const accentOk = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/.test(v)

type RGB = [number, number, number]
const toRgb = (h: string): RGB => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) as RGB
const toHex = (c: RGB) => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
const mix = (a: string, b: string, f: number) => { const x = toRgb(a), y = toRgb(b); return toHex(x.map((v, i) => v + (y[i] - v) * f) as RGB) }
const lum = (h: string) => { const [r, g, b] = toRgb(h).map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
export const contrast = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }

/** Moves `base` toward `target` just far enough to reach `min` contrast against `against`. */
function reach(base: string, target: string, against: string, min: number) {
  let c = base
  for (let f = 0; f <= 1 && contrast(c, against) < min; f += 0.05) c = mix(base, target, f)
  return c
}

/** Readable text color (dark or white) for something painted in `bg`. */
export const onColor = (bg: string) => (contrast(bg, '#1f2a44') >= contrast(bg, '#ffffff') ? '#1f2a44' : '#ffffff')

const VARS = ['--accent', '--accent-text', '--btn', '--btn-hover', '--btn-text']

/** The button and link colors for an accent, readable on the given theme. */
export function derive(hex: string, theme: 'light' | 'dark') {
  if (theme === 'dark') {
    const btn = reach(hex, '#ffffff', '#1f2a44', 4.5) // light enough that dark button text reads, which also keeps it clear of the dark background
    return { '--btn': btn, '--btn-hover': mix(btn, '#ffffff', 0.15), '--btn-text': '#1f2a44', '--accent': btn, '--accent-text': mix(btn, '#ffffff', 0.2) }
  }
  const btn = reach(hex, '#000000', '#ffffff', 4.5)
  return { '--btn': btn, '--btn-hover': mix(btn, '#000000', 0.15), '--btn-text': '#ffffff', '--accent': btn, '--accent-text': reach(hex, '#000000', '#fff8ec', 4.5) }
}

/** Paints the app's buttons and highlights in the chosen color, for the current theme. null goes back to the built-in colors. */
export function applyAccent(hex: string | null) {
  const s = document.documentElement.style
  if (!hex || !accentOk(hex)) { VARS.forEach(v => s.removeProperty(v)); return }
  for (const [k, v] of Object.entries(derive(hex, currentTheme()))) s.setProperty(k, v)
}

export const currentAccent = () => (accentOk(prefs().accent) ? prefs().accent : null)

export function setAccent(hex: string | null) {
  setPref('accent', hex ?? '')
  applyAccent(hex)
}

export function initAccent() {
  applyAccent(currentAccent())
  onTheme(() => applyAccent(currentAccent()))
}
