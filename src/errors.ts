import { cloudEnabled, supabase } from './supabase'

/**
 * Anonymous crash reporting. Uncaught errors are sent to our own database (no third party, no cookies):
 * the message, a short stack, the page path without query or hash, the app version, the language and the browser string.
 * It never includes who you are or anything you logged. At most 5 per visit, each distinct error once.
 */
const seen = new Set<string>()
let sent = 0

function report(err: unknown) {
  if (!cloudEnabled || !supabase || sent >= 5) return
  const e = err instanceof Error ? err : new Error(String(err))
  const message = (e.message || 'Error').slice(0, 500)
  const stack = e.stack?.slice(0, 2000)
  const key = message + (stack?.split('\n')[1] ?? '')
  if (seen.has(key)) return
  if (/ResizeObserver loop|Script error|Failed to fetch|NetworkError|Load failed|AbortError/i.test(message)) return // noise: offline and browser quirks
  seen.add(key)
  sent++
  void supabase.from('error_reports').insert({
    message, stack,
    page: location.pathname.slice(0, 200),
    version: __APP_VERSION__,
    lang: document.documentElement.lang.slice(0, 10),
    agent: navigator.userAgent.slice(0, 200),
  }).then(() => {}, () => {})
}

export function initErrorReporting() {
  if (!import.meta.env.PROD) return
  addEventListener('error', ev => report(ev.error ?? ev.message))
  addEventListener('unhandledrejection', ev => report(ev.reason))
}
