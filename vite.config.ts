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

/** Stamps the service worker's app cache with this build, so a release never leaves the previous one's files behind. */
function swVersion(): Plugin {
  return {
    name: 'globefolio-sw',
    apply: 'build',
    closeBundle() {
      const path = join('dist', 'sw.js')
      writeFileSync(path, readFileSync(path, 'utf8').replace('__BUILD__', Date.now().toString(36)))
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
