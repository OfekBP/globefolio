import type { RealtimeChannel } from '@supabase/supabase-js'
import { getProfile, updateProfile } from './auth'
import { applyRemote, clearLocal, delMeta, getHome, getMeta, markSynced, onChange, pendingRows, purgeTombstones, queueAll, resetSyncState, setHome, setMeta, type Table } from './store'
import { supabase } from './supabase'
import { fromRemote, toRemote } from './syncMap'

/**
 * Keeps this device's rows and the cloud copy in step. The device database stays the source of truth for the UI:
 * edits are queued in an outbox and pushed when possible; changes from other devices are pulled by a server-side cursor
 * and arrive instantly through Realtime. The newest edit of a row wins, and a delete travels as a tombstone.
 */

export type SyncState = 'off' | 'syncing' | 'synced' | 'offline' | 'error'
let state: SyncState = 'off'
const listeners = new Set<(s: SyncState) => void>()
const set = (s: SyncState) => { if (s !== state) { state = s; listeners.forEach(fn => fn(s)) } }
export const onSyncState = (fn: (s: SyncState) => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }
export const syncState = () => state

let uid: string | null = null
let channel: RealtimeChannel | null = null
let running = false
let again = false
let timer: ReturnType<typeof setTimeout> | undefined
let retry = 0
let wired = false

const TABLES: Table[] = ['trips', 'wishes']

export async function startSync(userId: string) {
  if (!supabase || uid === userId) return
  const known = await getMeta('userId')
  if (known && known !== userId) await clearLocal() // a different account: never mix two people's data
  if (!known) await queueAll() // first sign-in here: the guest data on this phone joins the account
  await setMeta('userId', userId)
  uid = userId
  if (!wired) {
    wired = true
    onChange(schedule)
    window.addEventListener('online', schedule)
    document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule() })
  }
  channel = supabase.channel(`own:${userId}`)
  for (const t of TABLES) channel.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: `user_id=eq.${userId}` }, schedule)
  channel.subscribe()
  queue(0)
}

export async function stopSync({ wipe }: { wipe: boolean }) {
  if (!uid && !wipe) return
  if (channel && supabase) await supabase.removeChannel(channel)
  channel = null
  uid = null
  clearTimeout(timer)
  if (wipe) await clearLocal(); else await resetSyncState()
  set('off')
}

/** Push anything still waiting; used right before sign-out so no edit is lost. Returns false when something could not be sent. */
export async function flush(): Promise<boolean> {
  if (!uid) return true
  await run()
  return (await pendingRows()).length === 0
}

function queue(delay: number) {
  if (!uid) return
  clearTimeout(timer)
  timer = setTimeout(run, delay)
}
const schedule = () => queue(400)

async function run() {
  if (!supabase || !uid) return
  if (running) { again = true; return }
  if (!navigator.onLine) { set('offline'); return }
  running = true
  set('syncing')
  try {
    await push()
    await pull()
    await syncHome()
    await purgeTombstones()
    retry = 0
    set('synced')
  } catch (e) {
    console.warn('sync failed', e)
    set(navigator.onLine ? 'error' : 'offline')
    retry = Math.min(retry + 1, 6)
    clearTimeout(timer)
    timer = setTimeout(run, 2000 * 2 ** retry) // back off: 4s, 8s ... about 2 minutes
  } finally {
    running = false
    if (again) { again = false; queue(100) }
  }
}

async function push() {
  const user = uid!
  const pending = await pendingRows()
  for (const table of TABLES) {
    const rows = pending.filter(p => p.table === table)
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200)
      const { error } = await supabase!.from(table).upsert(chunk.map(c => toRemote(table, c.row, user)), { onConflict: 'id' })
      if (error) throw error
      await markSynced(chunk.map(c => ({ table, id: c.row.id, updatedAt: c.row.updatedAt })))
    }
  }
}

async function pull() {
  for (const table of TABLES) {
    for (;;) {
      const cursor = (await getMeta(`cursor:${table}`)) ?? '1970-01-01T00:00:00Z'
      const { data, error } = await supabase!.from(table).select('*').gt('synced_at', cursor).order('synced_at').limit(500)
      if (error) throw error
      if (!data?.length) break
      await applyRemote(table, data.map(r => fromRemote(table, r)))
      await setMeta(`cursor:${table}`, data[data.length - 1].synced_at)
      if (data.length < 500) break
    }
  }
}

/** Home city lives on the profile. If this device changed it, send it; otherwise adopt what another device set. */
async function syncHome() {
  const p = getProfile()
  if (!p) return
  const local = (await getHome()) ?? ''
  const remote = p.home_city_key ?? ''
  const last = (await getMeta('homeSynced')) ?? ''
  if (local !== last && local !== remote) await updateProfile({ home_city_key: local || null })
  else if (remote !== local && remote !== last) await setHome(remote)
  await setMeta('homeSynced', (await getHome()) ?? '')
}

export const forgetCursor = async () => { for (const t of TABLES) await delMeta(`cursor:${t}`) }
