// Renders the PNG icons and the social preview from the brand SVGs (run: node scripts/build-icons.mjs).
// Phones want PNG home-screen icons, and link previews want a PNG card; the SVGs stay the source of truth.
import sharp from 'sharp'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const out = 'public/icons'
mkdirSync(out, { recursive: true })
const mark = readFileSync('public/brand/logo-mark.svg', 'utf8')

const png = (svg, size, file) => sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png().toFile(`${out}/${file}`)

await png(mark, 192, 'icon-192.png')
await png(mark, 512, 'icon-512.png')
await png(mark, 180, 'apple-touch-icon.png')

// maskable: full-bleed Lagoon with the mark inside the safe zone, so any launcher shape can crop it
const inner = mark.replace(/<rect width="64" height="64" rx="18" fill="#0E7490"\/>/, '')
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#0E7490"/><g transform="translate(9.6 9.6) scale(0.7)">${inner.trim().replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</g></svg>`
await png(maskable, 512, 'maskable-512.png')

// social card, 1200x630
const logo = await sharp(readFileSync('public/brand/logo-horizontal.svg'), { density: 300 }).resize({ width: 760 }).png().toBuffer()
const lm = await sharp(logo).metadata()
const card = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="#FFF8EC"/>
  <circle cx="1060" cy="110" r="70" fill="#FFC93C"/><circle cx="130" cy="520" r="54" fill="#FF6F8E"/>
  <circle cx="1010" cy="520" r="34" fill="#7ED6B0"/><circle cx="210" cy="110" r="22" fill="#A9DCF0"/>
</svg>`
await sharp(Buffer.from(card)).composite([{ input: logo, left: Math.round((1200 - lm.width) / 2), top: Math.round((630 - lm.height) / 2) }]).png().toFile(`${out}/og.png`)
console.log('icons written to', out)
