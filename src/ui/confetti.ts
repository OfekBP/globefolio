const COLORS = ['#ffc93c', '#ff6f8e', '#0e8fa8', '#7ed6b0', '#b9a6f0']

/** A short, quiet burst of paper confetti when a new trip is saved. */
export function confetti(x = innerWidth / 2, y = innerHeight * 0.35) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const cv = document.createElement('canvas')
  cv.className = 'confetti'
  cv.width = innerWidth
  cv.height = innerHeight
  document.body.append(cv)
  const ctx = cv.getContext('2d')!
  const bits = Array.from({ length: 90 }, () => {
    const a = Math.random() * Math.PI * 2
    const v = 4 + Math.random() * 8
    return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 5, w: 6 + Math.random() * 6, h: 3 + Math.random() * 4, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: COLORS[(Math.random() * COLORS.length) | 0] }
  })
  const t0 = performance.now()
  const tick = (now: number) => {
    const t = now - t0
    ctx.clearRect(0, 0, cv.width, cv.height)
    for (const b of bits) {
      b.vy += 0.22; b.vx *= 0.985; b.x += b.vx; b.y += b.vy; b.r += b.vr
      ctx.save()
      ctx.globalAlpha = Math.max(0, 1 - t / 1700)
      ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.fillStyle = b.c
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h)
      ctx.restore()
    }
    if (t < 1700) requestAnimationFrame(tick); else cv.remove()
  }
  requestAnimationFrame(tick)
}
