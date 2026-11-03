/** A small, polite confirmation that fades itself out. */
export function toast(msg: string) {
  document.querySelector('.toast')?.remove()
  const t = document.createElement('div')
  t.className = 'toast'
  t.setAttribute('role', 'status')
  t.textContent = msg
  document.body.append(t)
  setTimeout(() => t.classList.add('out'), 2600)
  setTimeout(() => t.remove(), 3100)
}
