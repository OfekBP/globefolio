/** A small, polite confirmation that fades itself out. With `undo`, it stays a little longer and offers to take the action back. */
export function toast(msg: string, undo?: () => void) {
  document.querySelector('.toast')?.remove()
  const t = document.createElement('div')
  t.className = 'toast'
  t.setAttribute('role', 'status')
  const span = document.createElement('span')
  span.textContent = msg
  t.append(span)
  if (undo) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'toast-undo'
    b.textContent = 'Undo'
    b.onclick = () => { t.remove(); undo() }
    t.append(b)
  }
  document.body.append(t)
  const life = undo ? 5200 : 2600
  setTimeout(() => t.classList.add('out'), life)
  setTimeout(() => t.remove(), life + 500)
}
