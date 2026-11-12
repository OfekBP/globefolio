import { t } from '../i18n'
import { esc } from './format'

interface AskOptions {
  title: string
  body?: string
  confirm: string
  danger?: boolean
  /** when given, the person must pick one of these (and may add a few words) before they can confirm */
  reasons?: string[]
}

/**
 * A small in-app confirm box, used instead of the browser's own confirm/prompt (which look foreign in an installed app).
 * Resolves with '' (confirmed), the chosen reason plus any extra words, or null when cancelled.
 */
export function ask(o: AskOptions): Promise<string | null> {
  return new Promise(resolve => {
    const before = document.activeElement as HTMLElement | null
    const back = document.createElement('div')
    back.className = 'dialog-back'
    const id = `dlg-${Math.random().toString(36).slice(2, 8)}`
    back.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="${id}">
      <h2 id="${id}" class="dialog-title" tabindex="-1">${esc(o.title)}</h2>
      ${o.body ? `<p class="dialog-body">${esc(o.body)}</p>` : ''}
      ${o.reasons ? `<fieldset class="dialog-reasons">${o.reasons.map((r, i) => `<label class="vis-row"><input type="radio" name="why" value="${i}" /><span><b>${esc(r)}</b></span></label>`).join('')}</fieldset>
        <div class="field"><label for="${id}-more">${t('fr.more2')}</label><textarea id="${id}-more" maxlength="300" rows="2"></textarea></div>` : ''}
      <div class="dialog-actions"><button type="button" class="solid ghost-btn" data-d="no">${t('cancel')}</button><button type="button" class="solid${o.danger ? ' danger' : ''}" data-d="yes"${o.reasons ? ' disabled' : ''}>${esc(o.confirm)}</button></div></div>`
    document.body.append(back)
    const yes = back.querySelector<HTMLButtonElement>('[data-d=yes]')!
    const done = (v: string | null) => { document.removeEventListener('keydown', onKey, true); back.remove(); before?.focus?.(); resolve(v) }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); done(null) }
      if (e.key === 'Tab') { // keep focus inside the box
        const f = [...back.querySelectorAll<HTMLElement>('button:not([disabled]), input, textarea')]
        if (!f.length) return
        const first = f[0], last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey, true)
    back.addEventListener('click', e => {
      if (e.target === back) return done(null)
      const k = (e.target as HTMLElement).closest<HTMLElement>('[data-d]')?.dataset.d
      if (k === 'no') done(null)
      else if (k === 'yes' && !yes.disabled) {
        if (!o.reasons) return done('')
        const i = Number(back.querySelector<HTMLInputElement>('input[name=why]:checked')?.value)
        const more = back.querySelector<HTMLTextAreaElement>('textarea')!.value.trim()
        done(`${o.reasons[i]}${more ? `: ${more}` : ''}`)
      }
    })
    back.addEventListener('change', () => { yes.disabled = !back.querySelector('input[name=why]:checked') })
    back.querySelector<HTMLElement>('.dialog-title')!.focus()
  })
}
