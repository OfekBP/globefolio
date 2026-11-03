import { openDB, type DBSchema } from 'idb'

export interface Place { name: string; lat: number; lng: number }

/** `updatedAt` / `deletedAt` (ms since epoch) are bookkeeping for sync: a delete is kept as a tombstone so it can travel to other devices. */
export interface Trip {
  id: string
  iso: string
  place?: Place
  startDate?: string
  endDate?: string
  notes?: string
  hiddenFromFriends?: boolean
  updatedAt?: number
  deletedAt?: number
}

/** A place you dream of going. A wish with no place means the whole country. */
export interface Wish { id: string; iso: string; place?: Place; updatedAt?: number; deletedAt?: number }

export type Table = 'trips' | 'wishes'
type Row = Trip | Wish

interface Schema extends DBSchema {
  wishes: { key: string; value: Wish }
  trips: { key: string; value: Trip; indexes: { iso: string } }
  meta: { key: string; value: string }
  /** rows changed on this device and not yet confirmed by the cloud, keyed `table:id` */
  outbox: { key: string; value: { key: string; table: Table; id: string } }
}

const dbp = // the database keeps its first name so existing trips survive the rename
openDB<Schema>('wayfarer', 4, {
  upgrade(db, oldVersion) {
    if (oldVersion < 1) db.createObjectStore('trips', { keyPath: 'id' }).createIndex('iso', 'iso')
    if (oldVersion < 2) db.createObjectStore('meta')
    if (oldVersion < 3) db.createObjectStore('wishes', { keyPath: 'id' })
    if (oldVersion < 4) db.createObjectStore('outbox', { keyPath: 'key' })
  },
  // another tab running a newer version needs the database: step aside and reload onto the new code
  blocking() { void dbp.then(d => d.close()); location.reload() },
})

const listeners = new Set<() => void>()
export const onChange = (fn: () => void) => listeners.add(fn)
const emit = () => listeners.forEach(fn => fn())

const live = <T extends Row>(rows: T[]) => rows.filter(r => !r.deletedAt)

export async function allTrips(): Promise<Trip[]> {
  return live(await (await dbp).getAll('trips')).sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))
}

export async function saveTrip(t: Omit<Trip, 'id'> & { id?: string }) {
  const db = await dbp
  const id = t.id ?? crypto.randomUUID()
  const tx = db.transaction(['trips', 'outbox'], 'readwrite')
  await tx.objectStore('trips').put({ ...t, id, updatedAt: Date.now(), deletedAt: undefined })
  await tx.objectStore('outbox').put({ key: `trips:${id}`, table: 'trips', id })
  await tx.done
  emit()
}

export async function deleteTrip(id: string) {
  const db = await dbp
  const cur = await db.get('trips', id)
  if (!cur) return
  const tx = db.transaction(['trips', 'outbox'], 'readwrite')
  await tx.objectStore('trips').put({ ...cur, deletedAt: Date.now(), updatedAt: Date.now() })
  await tx.objectStore('outbox').put({ key: `trips:${id}`, table: 'trips', id })
  await tx.done
  emit()
}

/** Replaces everything (used by Import). Rows that vanish become tombstones so other devices drop them too. */
export async function replaceAll(trips: Trip[], wishes: Wish[] = []) {
  const db = await dbp
  const tx = db.transaction(['trips', 'wishes', 'outbox'], 'readwrite')
  const now = Date.now()
  for (const [table, incoming] of [['trips', trips], ['wishes', wishes]] as const) {
    const store = tx.objectStore(table) as unknown as { getAll(): Promise<Row[]>; put(v: Row): Promise<unknown> }
    const keep = new Set(incoming.map(r => r.id))
    for (const old of await store.getAll()) {
      if (!keep.has(old.id) && !old.deletedAt) {
        await store.put({ ...old, deletedAt: now, updatedAt: now })
        await tx.objectStore('outbox').put({ key: `${table}:${old.id}`, table, id: old.id })
      }
    }
    for (const r of incoming) {
      await store.put({ ...r, updatedAt: now, deletedAt: undefined })
      await tx.objectStore('outbox').put({ key: `${table}:${r.id}`, table, id: r.id })
    }
  }
  await tx.done
  emit()
}

export async function allWishes(): Promise<Wish[]> {
  return live(await (await dbp).getAll('wishes'))
}

export async function saveWish(w: Omit<Wish, 'id'>) {
  const db = await dbp
  const id = crypto.randomUUID()
  const tx = db.transaction(['wishes', 'outbox'], 'readwrite')
  await tx.objectStore('wishes').put({ ...w, id, updatedAt: Date.now() })
  await tx.objectStore('outbox').put({ key: `wishes:${id}`, table: 'wishes', id })
  await tx.done
  emit()
}

export async function deleteWish(id: string) {
  const db = await dbp
  const cur = await db.get('wishes', id)
  if (!cur) return
  const tx = db.transaction(['wishes', 'outbox'], 'readwrite')
  await tx.objectStore('wishes').put({ ...cur, deletedAt: Date.now(), updatedAt: Date.now() })
  await tx.objectStore('outbox').put({ key: `wishes:${id}`, table: 'wishes', id })
  await tx.done
  emit()
}

export async function getHome(): Promise<string | undefined> {
  return (await dbp).get('meta', 'home')
}

export async function setHome(iso: string) {
  await (await dbp).put('meta', iso, 'home')
  await (await dbp).put('meta', String(Date.now()), 'homeAt')
  emit()
}

// ── helpers for the sync engine (src/sync.ts) ──────────────────────────────

export const getMeta = async (k: string) => (await dbp).get('meta', k)
export const setMeta = async (k: string, v: string) => { await (await dbp).put('meta', v, k) }
export const delMeta = async (k: string) => { await (await dbp).delete('meta', k) }

/** Every row (tombstones included) that still needs to reach the cloud. */
export async function pendingRows(): Promise<{ table: Table; row: Row }[]> {
  const db = await dbp
  const out: { table: Table; row: Row }[] = []
  for (const o of await db.getAll('outbox')) {
    const row = await db.get(o.table, o.id)
    if (row) out.push({ table: o.table, row })
  }
  return out
}

/** Clears outbox entries, but only those not touched again since `sentAt` (a newer local edit must still go out). */
export async function markSynced(sent: { table: Table; id: string; updatedAt?: number }[]) {
  const db = await dbp
  const tx = db.transaction(['trips', 'wishes', 'outbox'], 'readwrite')
  for (const s of sent) {
    const cur = await (tx.objectStore(s.table) as unknown as { get(k: string): Promise<Row | undefined> }).get(s.id)
    if (!cur || (cur.updatedAt ?? 0) <= (s.updatedAt ?? 0)) await tx.objectStore('outbox').delete(`${s.table}:${s.id}`)
  }
  await tx.done
}

/** Every local row, tombstones included. Used when a new account first uploads its device's data. */
export async function everything(): Promise<{ table: Table; row: Row }[]> {
  const db = await dbp
  return [
    ...(await db.getAll('trips')).map(row => ({ table: 'trips' as const, row })),
    ...(await db.getAll('wishes')).map(row => ({ table: 'wishes' as const, row })),
  ]
}

export async function queueAll() {
  const db = await dbp
  const tx = db.transaction(['trips', 'wishes', 'outbox'], 'readwrite')
  for (const table of ['trips', 'wishes'] as const) {
    for (const r of await (tx.objectStore(table) as unknown as { getAll(): Promise<Row[]> }).getAll()) {
      await tx.objectStore('outbox').put({ key: `${table}:${r.id}`, table, id: r.id })
    }
  }
  await tx.done
}

/** Writes rows that came from the cloud. Newer wins; nothing is queued back up. Returns how many changed. */
export async function applyRemote(table: Table, rows: Row[]): Promise<number> {
  const db = await dbp
  const tx = db.transaction(table, 'readwrite')
  const store = tx.store as unknown as { get(k: string): Promise<Row | undefined>; put(v: Row): Promise<unknown> }
  let n = 0
  for (const r of rows) {
    const cur = await store.get(r.id)
    if (cur && (cur.updatedAt ?? 0) >= (r.updatedAt ?? 0)) continue
    await store.put(r)
    n++
  }
  await tx.done
  if (n) emit()
  return n
}

/** Forget the account link on this device (sign out): data stays, the outbox and cursor are reset. */
export async function resetSyncState() {
  const db = await dbp
  await db.clear('outbox')
  for (const k of ['cursor:trips', 'cursor:wishes', 'userId', 'homeSynced']) await db.delete('meta', k)
}

/** Tombstones older than 30 days that the cloud already knows about can go. */
export async function purgeTombstones() {
  const db = await dbp
  const cutoff = Date.now() - 30 * 864e5
  const pending = new Set((await db.getAllKeys('outbox')) as string[])
  for (const table of ['trips', 'wishes'] as const) {
    for (const r of await (db.getAll(table) as Promise<Row[]>)) {
      if (r.deletedAt && r.deletedAt < cutoff && !pending.has(`${table}:${r.id}`)) await db.delete(table, r.id)
    }
  }
}

/** Empties this device (used on sign-out so the next person on a shared phone starts clean). Home city and theme are cleared too. */
export async function clearLocal() {
  const db = await dbp
  const tx = db.transaction(['trips', 'wishes', 'outbox', 'meta'], 'readwrite')
  for (const s of ['trips', 'wishes', 'outbox', 'meta'] as const) await tx.objectStore(s).clear()
  await tx.done
  emit()
}
