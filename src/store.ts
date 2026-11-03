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

interface Schema extends DBSchema {
  trips: { key: string; value: Trip; indexes: { iso: string } }
  meta: { key: string; value: string }
}

const dbp = openDB<Schema>('wayfarer', 2, {
  upgrade(db, oldVersion) {
    if (oldVersion < 1) db.createObjectStore('trips', { keyPath: 'id' }).createIndex('iso', 'iso')
    if (oldVersion < 2) db.createObjectStore('meta')
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

export async function replaceAll(trips: Trip[]) {
  const db = await dbp
  const tx = db.transaction('trips', 'readwrite')
  await tx.store.clear()
  for (const t of trips) await tx.store.put(t)
  await tx.done
  emit()
}

export async function getHome(): Promise<string | undefined> {
  return (await dbp).get('meta', 'home')
}

export async function setHome(iso: string) {
  await (await dbp).put('meta', iso, 'home')
  emit()
}
