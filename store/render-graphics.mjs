// Renders the Google Play graphics from the app screenshots (shots/*.png, taken with _raw/shoot.mjs) and the landing copy.
// Usage: node store/render-graphics.mjs [lang]   Output: store/graphics/<lang>/ (git-ignored)
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { COPY } from '../src/landing/copy.ts'

const ROOT = 'C:/Users/User/Documents/Wayfarer'
const SHOTS = `${ROOT}/_raw/shots`
const FONTS = `${ROOT}/wayfarer/node_modules/@fontsource-variable/nunito/files`
const only = process.argv[2]
const RTL = new Set(['ar', 'he'])
const TINT = { map: '#fff0bc', stamps: '#ffdce4', journal: '#d3eaf8', passport: '#cdefe3' }
const CAP = { map: 's1h', stamps: 's2h', journal: 's3h', passport: 'tag' }

const css = `
@font-face{font-family:N;src:url('file:///${FONTS}/nunito-latin-wght-normal.woff2');font-weight:200 1000;unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
@font-face{font-family:N;src:url('file:///${FONTS}/nunito-latin-ext-wght-normal.woff2');font-weight:200 1000;unicode-range:U+0100-02AF,U+0304,U+0308,U+0329,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}
@font-face{font-family:N;src:url('file:///${FONTS}/nunito-cyrillic-wght-normal.woff2');font-weight:200 1000;unicode-range:U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}
*{box-sizing:border-box;margin:0}
body{font-family:N,'Segoe UI','Microsoft YaHei UI','Yu Gothic UI','Arial',sans-serif;color:#1f2a44;overflow:hidden;position:relative}
.phone{position:absolute;padding:14px;background:#1f2a44;border-radius:84px;box-shadow:0 40px 80px -30px rgba(31,42,68,.55)}
.phone img{display:block;width:100%;border-radius:70px}
mark{background:#ffc93c;color:#1f2a44;border-radius:.22em;padding:0 .16em;display:inline-block;line-height:1.1}
h1{font-weight:900;letter-spacing:-.03em;text-wrap:balance}
:lang(ar) h1{letter-spacing:0}
:lang(ja) h1,:lang(zh) h1{word-break:auto-phrase;line-break:strict}`

const shotPage = (lang, kind) => {
  const c = { ...COPY.en, ...COPY[lang] }
  return `<!doctype html><html lang="${lang}" dir="${RTL.has(lang) ? 'rtl' : 'ltr'}"><meta charset=utf-8><style>${css}
body{width:1080px;height:1920px;background:${TINT[kind]}}
h1{position:absolute;inset:120px 84px auto;font-size:${['ja', 'zh'].includes(lang) ? 100 : 96}px;line-height:1.14;text-align:center}
.phone{left:160px;top:470px;width:760px}</style>
<h1>${c[CAP[kind]]}</h1><div class=phone><img src="file:///${SHOTS}/${kind}-${lang}-light.png"></div></html>`
}
const featurePage = lang => {
  const c = { ...COPY.en, ...COPY[lang] }
  const rtl = RTL.has(lang)
  return `<!doctype html><html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}"><meta charset=utf-8><style>${css}
body{width:1024px;height:500px;background:#fff8ec}
h1{position:absolute;${rtl ? 'right' : 'left'}:64px;top:130px;width:520px;font-size:${['ja', 'zh'].includes(lang) ? 60 : 72}px;line-height:1.15}
h1 span{display:block}
.phone{width:250px;border-radius:50px;padding:9px}.phone img{border-radius:42px}
.a{${rtl ? 'left' : 'right'}:60px;top:36px;transform:rotate(${rtl ? 4 : -4}deg)}.b{${rtl ? 'left' : 'right'}:270px;top:84px;width:220px;transform:rotate(${rtl ? -6 : 6}deg)}
.globe{position:absolute;${rtl ? 'left' : 'right'}:20px;top:60px;width:500px;height:500px;border-radius:50%;background:#a9dcf0}</style>
<div class=globe></div><h1><span>${c.h1a}</span><mark>${c.h1b}</mark></h1>
<div class="phone b"><img src="file:///${SHOTS}/passport-${lang}-light.png"></div><div class="phone a"><img src="file:///${SHOTS}/map-${lang}-light.png"></div></html>`
}

const PORT = 9555
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [`--remote-debugging-port=${PORT}`, '--headless=new', '--user-data-dir=' + ROOT + '/_raw/chrome-prof3', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' })
await new Promise(r => setTimeout(r, 2500))
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
await new Promise(r => (ws.onopen = r))
let id = 0; const pend = new Map()
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } }
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const sleep = ms => new Promise(r => setTimeout(r, ms))
await send('Page.enable')

async function render(html, w, h, out) {
  const tmp = `${ROOT}/_raw/store-tmp.html`
  writeFileSync(tmp, html)
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: 'file:///' + tmp }); await sleep(1500)
  await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(()=>1)', awaitPromise: true })
  const r = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(out, Buffer.from(r.result.data, 'base64'))
}
for (const lang of Object.keys(COPY)) {
  if (only && only !== lang) continue
  const dir = `store/graphics/${lang}`
  mkdirSync(dir, { recursive: true })
  let n = 1
  for (const kind of ['map', 'stamps', 'passport', 'journal']) await render(shotPage(lang, kind), 1080, 1920, `${dir}/phone-${n++}-${kind}.png`)
  await render(featurePage(lang), 1024, 500, `${dir}/feature-graphic.png`)
  console.log('done', lang)
}
chrome.kill(); process.exit(0)
