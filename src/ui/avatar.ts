import { esc } from './format'

interface Who { handle: string; display_name?: string | null }

/** A person's round picture. For now it is their initial; profile pictures and colors plug in here later. */
export function avatarHtml(p: Who, size: 'sm' | 'lg' = 'sm') {
  const letter = esc((p.display_name || p.handle || '?').trim().slice(0, 1).toUpperCase())
  return `<span class="avatar${size === 'lg' ? ' avatar-lg' : ''}" aria-hidden="true">${letter}</span>`
}
