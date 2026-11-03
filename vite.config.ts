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
    name: 'tripglobe-csp',
    apply: 'build',
    // runs on the finished files, so the script hashes match exactly what the browser will read
    closeBundle() {
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
          `script-src 'self' ${hashes.join(' ')}`.trim(),
          `style-src 'self' 'unsafe-inline'`,
          `img-src 'self' data: blob:`,
          `font-src 'self' data:`,
          `connect-src 'self' ${backend}`.trim(),
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

export default defineConfig(({ mode }) => ({
  base: './', // relative URLs, so it works at a domain root or under a sub-path like github.io/repo/
  plugins: [csp(loadEnv(mode, process.cwd(), 'VITE_'))],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        brand: resolve(__dirname, 'brand.html'),
        privacy: resolve(__dirname, 'privacy.html'),
        terms: resolve(__dirname, 'terms.html'),
      },
    },
  },
  test: { include: ['tests/**/*.test.ts'] },
}))
