import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { allTrips, applyRemote, clearLocal, deleteTrip, markSynced, pendingRows, queueAll, saveTrip, type Trip } from '../src/store'
import { fromRemote, toRemote } from '../src/syncMap'

const USER = '00000000-0000-0000-0000-000000000001'

beforeEach(async () => { await clearLocal() })

describe('row mapping', () => {
  it('round-trips a trip through the database shape', () => {
    const t: Trip = { id: 'a', iso: 'FR', place: { name: 'Paris', lat: 48.85, lng: 2.35 }, startDate: '2025-05-01', endDate: '2025-05-04', notes: 'croissants', hiddenFromFriends: true, updatedAt: 1_700_000_000_000 }
    const back = fromRemote('trips', toRemote('trips', t, USER)) as Trip
    expect(back).toEqual({ ...t, deletedAt: undefined })
  })

  it('carries tombstones as deleted_at', () => {
    const r = toRemote('trips', { id: 'a', iso: 'FR', updatedAt: 5, deletedAt: 5 }, USER)
    expect(r.deleted_at).toBe(new Date(5).toISOString())
    expect((fromRemote('trips', r) as Trip).deletedAt).toBe(5)
  })

  it('caps notes at 5000 characters', () => {
    const r = toRemote('trips', { id: 'a', iso: 'FR', notes: 'x'.repeat(9000) }, USER)
    expect(r.notes).toHaveLength(5000)
  })
})

describe('merge rules', () => {
  it('a newer remote row wins, an older one is ignored', async () => {
    await applyRemote('trips', [{ id: 'a', iso: 'FR', notes: 'v1', updatedAt: 100 }])
    expect(await applyRemote('trips', [{ id: 'a', iso: 'FR', notes: 'old', updatedAt: 50 }])).toBe(0)
    expect(await applyRemote('trips', [{ id: 'a', iso: 'FR', notes: 'v2', updatedAt: 200 }])).toBe(1)
    expect((await allTrips())[0].notes).toBe('v2')
  })

  it('an equal timestamp does not rewrite the row', async () => {
    await applyRemote('trips', [{ id: 'a', iso: 'FR', notes: 'mine', updatedAt: 100 }])
    expect(await applyRemote('trips', [{ id: 'a', iso: 'FR', notes: 'theirs', updatedAt: 100 }])).toBe(0)
  })

  it('a remote tombstone hides the trip', async () => {
    await applyRemote('trips', [{ id: 'a', iso: 'FR', updatedAt: 100 }])
    await applyRemote('trips', [{ id: 'a', iso: 'FR', updatedAt: 200, deletedAt: 200 }])
    expect(await allTrips()).toHaveLength(0)
  })

  it('an older remote edit cannot resurrect a locally deleted trip', async () => {
    await applyRemote('trips', [{ id: 'a', iso: 'FR', updatedAt: 100 }])
    await deleteTrip('a')
    await applyRemote('trips', [{ id: 'a', iso: 'FR', notes: 'ghost', updatedAt: 150 }])
    expect(await allTrips()).toHaveLength(0)
  })

  it('remote rows never land in the outbox', async () => {
    await applyRemote('trips', [{ id: 'a', iso: 'FR', updatedAt: 100 }])
    expect(await pendingRows()).toHaveLength(0)
  })
})

describe('outbox', () => {
  it('local edits are queued, and queueAll adds guest data on first sign-in', async () => {
    await saveTrip({ iso: 'IT' })
    const [only] = await pendingRows()
    expect(only.table).toBe('trips')
    await markSynced([{ table: 'trips', id: only.row.id, updatedAt: only.row.updatedAt }])
    expect(await pendingRows()).toHaveLength(0)
    await queueAll()
    expect(await pendingRows()).toHaveLength(1)
  })

  it('an edit made while a push was in flight stays queued', async () => {
    const t = await saveTrip({ iso: 'IT' }) as unknown as Trip | undefined
    const [first] = await pendingRows()
    const sent = { table: 'trips' as const, id: first.row.id, updatedAt: first.row.updatedAt }
    await new Promise(r => setTimeout(r, 5))
    await saveTrip({ ...(first.row as Trip), notes: 'edited during push' })
    await markSynced([sent])
    expect(await pendingRows()).toHaveLength(1)
    void t
  })
})
