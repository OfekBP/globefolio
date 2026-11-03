import './styles.css'
import './brand.css'
import { currentTheme, initTheme, setTheme, type Theme } from './theme'
import { icons } from './ui/icons'

initTheme()
const btn = document.getElementById('theme')!
const paint = (t: Theme) => {
  btn.innerHTML = t === 'dark' ? icons.sun : icons.moon
  btn.setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode')
  // the logo files carry their own text color, so swap the lockup with the theme
  document.querySelectorAll<HTMLImageElement>('.brand-logo').forEach(i => {
    i.src = t === 'dark' ? '/brand/logo-horizontal-dark.svg' : '/brand/logo-horizontal.svg'
  })
}
paint(currentTheme())
btn.onclick = () => { const t = currentTheme() === 'dark' ? 'light' : 'dark'; setTheme(t); paint(t) }

// The traveler rides the dashed arc.
const arc = document.querySelector<SVGPathElement>('.track .arc')
const traveler = document.querySelector<SVGCircleElement>('.track .traveler')
if (arc && traveler && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const len = arc.getTotalLength()
  const t0 = performance.now()
  const tick = (now: number) => {
    const p = arc.getPointAtLength((((now - t0) / 4200) % 1) * len)
    traveler.setAttribute('cx', String(p.x))
    traveler.setAttribute('cy', String(p.y))
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
} else if (arc && traveler) {
  const p = arc.getPointAtLength(arc.getTotalLength())
  traveler.setAttribute('cx', String(p.x)); traveler.setAttribute('cy', String(p.y))
}
