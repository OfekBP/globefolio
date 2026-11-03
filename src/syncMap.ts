import type { Table, Trip, Wish } from './store'

/** Pure translation between the app's rows (camelCase, ms timestamps) and the database's (snake_case, ISO timestamps). */

type Row = Trip | Wish
export type Remote = Record<string, any>

const iso = (ms?: number) => (ms ? new Date(ms).toISOString() : null)
const ms = (s?: string | null) => (s ? Date.parse(s) : undefined)

export function toRemote(table: Table, row: Row, userId: string): Remote {
  const base = {
    id: row.id,
    user_id: userId,
    iso: row.iso,
    place: row.place ?? null,
    updated_at: iso(row.updatedAt ?? Date.now()),
    deleted_at: iso(row.deletedAt),
  }
  if (table === 'wishes') return base
  const t = row as Trip
  return {
    ...base,
    start_date: t.startDate || null,
    end_date: t.endDate || null,
    notes: t.notes ? t.notes.slice(0, 5000) : null,
    hidden_from_friends: !!t.hiddenFromFriends,
  }
}

export function fromRemote(table: Table, r: Remote): Row {
  const base = { id: r.id as string, iso: r.iso as string, place: r.place ?? undefined, updatedAt: ms(r.updated_at), deletedAt: ms(r.deleted_at) }
  if (table === 'wishes') return base
  return {
    ...base,
    startDate: r.start_date ?? undefined,
    endDate: r.end_date ?? undefined,
    notes: r.notes ?? undefined,
    hiddenFromFriends: r.hidden_from_friends || undefined,
  }
}
