import { accentOk, onColor } from '../accent'
import { esc } from './format'

interface Who { handle: string; display_name?: string | null; avatar?: string | null; accent?: string | null }

export { PRESETS } from './chars'
import { PRESETS } from './chars'
const preset = (id: string) => PRESETS.find(p => `a:${p.id}` === id)

/** A person's round picture: their photo, their chosen character, or their initial, on their color. */
export function avatarHtml(p: Who, size: 'sm' | 'lg' | 'xl' = 'sm') {
  const cls = `avatar${size === 'sm' ? '' : ` avatar-${size}`}`
  const bg = accentOk(p.accent) ? p.accent : ''
  const style = bg ? ` style="background:${bg};color:${onColor(bg)}"` : ''
  const a = p.avatar ?? ''
  if (/^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(a)) return `<span class="${cls} avatar-photo"${style} aria-hidden="true"><img src="${a}" alt="" draggable="false" /></span>`
  const pr = preset(a)
  if (pr) return `<span class="${cls} avatar-art"${style} aria-hidden="true">${pr.svg}</span>`
  return `<span class="${cls}"${style} aria-hidden="true">${esc((p.display_name || p.handle || '?').trim().slice(0, 1).toUpperCase())}</span>`
}

/** Crops a chosen photo to a small square and compresses it until it fits the profile's size limit (about 9 KB). */
export async function photoToDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file)
  const side = Math.min(bmp.width, bmp.height)
  for (const px of [112, 96, 80, 64]) {
    const c = document.createElement('canvas')
    c.width = c.height = px
    const g = c.getContext('2d')!
    g.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, px, px)
    for (const q of [0.72, 0.55, 0.4]) {
      for (const type of ['image/webp', 'image/jpeg']) {
        const url = c.toDataURL(type, q)
        if (url.startsWith(`data:${type}`) && url.length <= 8500) { bmp.close?.(); return url }
      }
    }
  }
  bmp.close?.()
  throw new Error('image too detailed')
}
