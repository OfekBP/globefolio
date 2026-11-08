import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/**
 * Adds a strict Content-Security-Policy to every built page. Inline scripts (the theme snippet that runs before first paint)
 * are allowed by hash, so no 'unsafe-inline' for scripts. Network access is limited to this site and the configured backend.
 */
function csp(env: Record<string, string>): Plugin {
  return {
    name: 'globefolio-csp',
    apply: 'build',
    // runs on the finished files, so the script hashes match exactly what the browser will read
    closeBundle() {
      const google = env.VITE_GOOGLE_CLIENT_ID ? 'https://accounts.google.com/gsi/' : ''
      let backend = ''
      try { const u = new URL(env.VITE_SUPABASE_URL); backend = `${u.origin} ${u.origin.replace(/^http/, 'ws')}` } catch { /* no backend configured */ }
      for (const f of readdirSync('dist').filter(n => n.endsWith('.html'))) {
        const path = join('dist', f)
        const html = readFileSync(path, 'utf8')
        const hashes = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)]
          // the HTML parser turns CRLF into LF before the browser hashes the script, so do the same
          .map(m => `'sha256-${createHash('sha256').update(m[1].replace(/\r\n?/g, '\n')).digest('base64')}'`)
        const policy = [
          `default-src 'self'`,
          `script-src 'self' ${hashes.join(' ')} ${google ? 'https://accounts.google.com/gsi/client' : ''}`.trim(),
          `style-src 'self' 'unsafe-inline' ${google ? 'https://accounts.google.com/gsi/style' : ''}`.trim(),
          `img-src 'self' data: blob:`,
          `font-src 'self' data:`,
          `connect-src 'self' ${backend} ${google}`.trim(),
          ...(google ? [`frame-src ${google}`] : []),
          `worker-src 'self' blob:`,
          `manifest-src 'self'`,
          `object-src 'none'`,
          `base-uri 'self'`,
          `form-action 'self'`,
        ].join('; ')
        writeFileSync(path, html.replace('<head>', `<head>
  <meta http-equiv="Content-Security-Policy" content="${policy}" />`))
      }
    },
  }
}

/**
 * After the build: stamps the service worker with this build and the list of every file it should keep for offline use,
 * and adds early-download hints to the main page for the 3D engine and the main font (both would otherwise be found late).
 */
function swVersion(): Plugin {
  return {
    name: 'globefolio-sw',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle || !/index\.html$/.test(ctx.filename)) return html
        const files = Object.keys(ctx.bundle)
        const globe = files.find(f => /^assets\/globe-.*\.js$/.test(f))
        const font = files.find(f => /^assets\/nunito-latin-wght-normal-.*\.woff2$/.test(f))
        const tags = [
          globe && `<link rel="modulepreload" crossorigin href="./${globe}" />`,
          font && `<link rel="preload" as="font" type="font/woff2" crossorigin href="./${font}" />`,
        ].filter(Boolean).join('\n  ')
        return tags ? html.replace('</head>', `  ${tags}\n</head>`) : html
      },
    },
    closeBundle() {
      const path = join('dist', 'sw.js')
      // code and the Latin/Cyrillic fonts every visitor needs; the big Arabic, Hebrew and CJK data files load only when chosen
      const assets = readdirSync(join('dist', 'assets')).filter(f => /\.(js|css)$/.test(f) || /^nunito-(latin|cyrillic)(-ext)?-wght/.test(f))
      const list = ['./', 'manifest.webmanifest', 'brand/logo-mark.svg', ...assets.map(f => `assets/${f}`)]
      writeFileSync(path, readFileSync(path, 'utf8').replace('__BUILD__', Date.now().toString(36)).replace('__PRECACHE__', JSON.stringify(list)))
    },
  }
}

export default defineConfig(({ mode }) => ({
  define: { __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync('package.json', 'utf8')).version) },
  base: './', // relative URLs, so it works at a domain root or under a sub-path like github.io/repo/
  plugins: [csp(loadEnv(mode, process.cwd(), 'VITE_')), swVersion()],
  build: {
    rollupOptions: {
      output: { manualChunks: { supabase: ['@supabase/supabase-js'] } }, // its own file, so app updates do not re-download it
      input: {
        main: resolve(__dirname, 'index.html'),
        privacy: resolve(__dirname, 'privacy.html'),
        terms: resolve(__dirname, 'terms.html'),
        landing: resolve(__dirname, 'landing.html'),
        deleteAccount: resolve(__dirname, 'delete-account.html'),
      },
    },
  },
  test: { include: ['tests/**/*.test.ts'] },
}))
