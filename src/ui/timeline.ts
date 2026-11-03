/** A single hairline you drag through the years; the right end means "all time". */
export function createTimeline(root: HTMLElement, onYear: (year: number | null) => void) {
  const input = root.querySelector<HTMLInputElement>('input')!
  const out = root.querySelector<HTMLOutputElement>('output')!
  let min = 0, max = 0
  let current: number | null | undefined
  // Only report real changes: the caller re-renders (and calls setYears) in response.
  const emit = (y: number | null) => { if (y !== current) { current = y; onYear(y) } }

  const sync = () => {
    const atEnd = +input.value >= max
    out.textContent = atEnd ? 'All time' : `Through ${input.value}`
    root.style.setProperty('--fill', `${((+input.value - min) / Math.max(1, max - min)) * 100}%`)
    input.setAttribute('aria-valuetext', out.textContent)
    return atEnd ? null : +input.value
  }

  input.addEventListener('input', () => emit(sync()))

  return {
    setYears(years: number[]) {
      const distinct = [...new Set(years)]
      root.hidden = distinct.length < 2
      if (root.hidden) { emit(null); return }
      const wasAtEnd = !max || +input.value >= max
      min = Math.min(...distinct)
      max = Math.max(...distinct)
      input.min = String(min)
      input.max = String(max)
      input.value = wasAtEnd ? String(max) : String(Math.min(max, Math.max(min, +input.value)))
      emit(sync())
    },
  }
}
