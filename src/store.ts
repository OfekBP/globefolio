import { openDB, type DBSchema } from 'idb'

export interface Place { name: string; lat: number; lng: number }

export interface Trip {
  id: string
  iso: string
  place?: Place
  startDate?: string
  endDate?: string
  notes?: string
}

/** A place you dream of going. A wish with no place means the whole country. */
export interface Wish { id: string; iso: string; place?: Place }

interface Schema extends DBSchema {
  wishes: { key: string; value: Wish }
  trips: { key: string; value: Trip; indexes: { iso: string } }
  meta: { key: string; value: string }
}

const dbp = // the database keeps its first name so existing trips survive the rename
openDB<Schema>('wayfarer', 3, {
  upgrade(db, oldVersion) {
    if (oldVersion < 1) db.createObjectStore('trips', { keyPath: 'id' }).createIndex('iso', 'iso')
    if (oldVersion < 2) db.createObjectStore('meta')
    if (oldVersion < 3) db.createObjectStore('wishes', { keyPath: 'id' })
  },
})

const listeners = new Set<() => void>()
export const onChange = (fn: () => void) => listeners.add(fn)
const emit = () => listeners.forEach(fn => fn())

export async function allTrips(): Promise<Trip[]> {
  return (await (await dbp).getAll('trips')).sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))
}

export async function saveTrip(t: Omit<Trip, 'id'> & { id?: string }) {
  await (await dbp).put('trips', { ...t, id: t.id ?? crypto.randomUUID() })
  emit()
}

export async function deleteTrip(id: string) {
  await (await dbp).delete('trips', id)
  emit()
}

export async function replaceAll(trips: Trip[], wishes: Wish[] = []) {
  const db = await dbp
  const tx = db.transaction(['trips', 'wishes'], 'readwrite')
  await tx.objectStore('trips').clear()
  await tx.objectStore('wishes').clear()
  for (const t of trips) await tx.objectStore('trips').put(t)
  for (const w of wishes) await tx.objectStore('wishes').put(w)
  await tx.done
  emit()
}

export async function allWishes(): Promise<Wish[]> {
  return (await dbp).getAll('wishes')
}

export async function saveWish(w: Omit<Wish, 'id'>) {
  await (await dbp).put('wishes', { ...w, id: crypto.randomUUID() })
  emit()
}

export async function deleteWish(id: string) {
  await (await dbp).delete('wishes', id)
  emit()
}

export async function getHome(): Promise<string | undefined> {
  return (await dbp).get('meta', 'home')
}

export async function setHome(iso: string) {
  await (await dbp).put('meta', iso, 'home')
  emit()
}
