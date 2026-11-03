const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function parts(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  return { y, m: m - 1, d: day }
}

/** "3–9 Apr 2024", "28 Mar – 4 Apr 2024", "Apr 2024" style ranges from ISO dates. */
export function fmtRange(start?: string, end?: string): string {
  if (!start && !end) return 'Undated'
  if (!start || !end || start === end) {
    const p = parts((start ?? end)!)
    return `${p.d} ${MONTHS[p.m]} ${p.y}`
  }
  const a = parts(start), b = parts(end)
  if (a.y !== b.y) return `${a.d} ${MONTHS[a.m]} ${a.y} – ${b.d} ${MONTHS[b.m]} ${b.y}`
  if (a.m !== b.m) return `${a.d} ${MONTHS[a.m]} – ${b.d} ${MONTHS[b.m]} ${b.y}`
  return `${a.d}–${b.d} ${MONTHS[a.m]} ${a.y}`
}

export const yearOf = (d?: string) => (d ? Number(d.slice(0, 4)) : undefined)

export const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`
