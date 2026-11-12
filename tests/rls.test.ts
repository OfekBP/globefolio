// Proves the row level security rules, using an in-process Postgres (PGlite) with a stand-in for Supabase's auth schema.
import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'

const A = '00000000-0000-0000-0000-00000000000a' // owner
const B = '00000000-0000-0000-0000-00000000000b' // accepted friend
const C = '00000000-0000-0000-0000-00000000000c' // stranger
const D = '00000000-0000-0000-0000-00000000000d' // pending requester
const T1 = '10000000-0000-0000-0000-000000000001'
const T2 = '10000000-0000-0000-0000-000000000002'
const T3 = '10000000-0000-0000-0000-000000000003'

let db: PGlite

/** Runs `fn` as a signed-in user (or anonymous when uid is null), the way PostgREST would. */
async function as<T>(uid: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`)
  try { return await fn() } finally { await db.exec('reset role') }
}
const q = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as Record<string, any>[]
const fails = async (sql: string, params: unknown[] = []) => { try { await db.query(sql, params) } catch { return true } return false }

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `)
  for (const f of readdirSync('supabase/migrations').sort()) await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8'))
  for (const [id, h, vis] of [[A, 'alice', 'friends'], [B, 'bob', 'friends'], [C, 'carol', 'public'], [D, 'dave', 'private']]) {
    await db.query('insert into auth.users (id) values ($1)', [id])
    await db.query('insert into public.profiles (id, handle, visibility) values ($1, $2, $3)', [id, h, vis])
  }
  await db.query(`insert into public.trips (id, user_id, iso, notes, start_date) values
    ($1, $2, 'FR', 'secret note', '2020-05-01'),
    ($3, $2, 'JP', 'hidden one', '2021-05-01'),
    ($4, $2, 'IT', 'future', '2999-01-01')`, [T1, A, T2, T3])
  await db.query('update public.trips set hidden_from_friends = true where id = $1', [T2])
  await db.query(`insert into public.friendships (requester, addressee, status) values ($1, $2, 'accepted'), ($3, $2, 'pending')`, [B, A, D])
})

describe('personal data', () => {
  it('owner sees own trips', async () => {
    expect(await as(A, () => q('select id from public.trips'))).toHaveLength(3)
  })
  it('strangers, friends and anonymous visitors cannot read trips directly', async () => {
    for (const u of [B, C, D]) expect(await as(u, () => q('select id from public.trips'))).toHaveLength(0)
    expect(await as(null, () => fails('select id from public.trips'))).toBe(true)
  })
  it('nobody can write rows as someone else', async () => {
    await as(C, async () => {
      expect(await fails(`insert into public.trips (id, user_id, iso) values (gen_random_uuid(), $1, 'FR')`, [A])).toBe(true)
      await q(`update public.trips set notes = 'pwned' where user_id = $1`, [A])
    })
    expect((await q('select notes from public.trips where id = $1', [T1]))[0].notes).toBe('secret note')
  })
  it('an older edit cannot overwrite a newer one', async () => {
    await as(A, async () => {
      await q(`update public.trips set notes = 'new', updated_at = now() + interval '1 hour' where id = $1`, [T1])
      await q(`update public.trips set notes = 'stale', updated_at = now() where id = $1`, [T1])
    })
    expect((await q('select notes from public.trips where id = $1', [T1]))[0].notes).toBe('new')
  })
  it('the owner of a row cannot be changed', async () => {
    await as(A, async () => { expect(await fails(`update public.trips set user_id = $1 where id = $2`, [C, T1])).toBe(true) })
  })
})

describe('friends', () => {
  it('a friend sees places and dates only, without hidden or future trips, never notes', async () => {
    const rows = await as(B, () => q('select * from public.friend_map($1)', [A]))
    expect(rows.map(r => r.iso)).toEqual(['FR'])
    expect(Object.keys(rows[0])).not.toContain('notes')
  })
  it('a pending requester and a stranger see nothing', async () => {
    expect(await as(D, () => q('select * from public.friend_map($1)', [A]))).toHaveLength(0)
    expect(await as(C, () => q('select * from public.friend_map($1)', [A]))).toHaveLength(0)
  })
  it('nothing shows when the owner keeps the profile private', async () => {
    await db.query(`update public.profiles set visibility = 'private' where id = $1`, [A])
    expect(await as(B, () => q('select * from public.friend_map($1)', [A]))).toHaveLength(0)
    await db.query(`update public.profiles set visibility = 'friends' where id = $1`, [A])
  })
  it('profiles are visible only to yourself and people you have a friendship with', async () => {
    expect((await as(C, () => q('select handle from public.profiles'))).map(r => r.handle)).toEqual(['carol'])
    expect((await as(A, () => q('select handle from public.profiles order by handle'))).map(r => r.handle)).toEqual(['alice', 'bob', 'dave'])
  })
  it('handle search finds prefixes and never reveals other fields', async () => {
    const rows = await as(C, () => q(`select * from public.find_profiles('al')`))
    expect(rows).toHaveLength(1)
    expect(Object.keys(rows[0]).sort()).toEqual(['accent', 'avatar', 'display_name', 'handle', 'id'])
    expect(await as(C, () => q(`select * from public.find_profiles('a')`))).toHaveLength(0)
    // a query with nothing searchable left in it must not list everyone, and '_' is not a wildcard
    expect(await as(C, () => q(`select * from public.find_profiles('@@')`))).toHaveLength(0)
    expect(await as(C, () => q(`select * from public.find_profiles('a_')`))).toHaveLength(0)
  })
  it('only the addressee can accept, and a requester cannot self-accept', async () => {
    await as(C, async () => { await q(`insert into public.friendships (requester, addressee) values ($1, $2)`, [C, B]) })
    await as(C, () => q(`update public.friendships set status = 'accepted' where requester = $1`, [C]))
    expect((await q(`select status from public.friendships where requester = $1 and addressee = $2`, [C, B]))[0].status).toBe('pending')
    await as(B, () => q(`update public.friendships set status = 'accepted' where requester = $1`, [C]))
    expect((await q(`select status from public.friendships where requester = $1 and addressee = $2`, [C, B]))[0].status).toBe('accepted')
    await db.query(`delete from public.friendships where requester = $1`, [C])
  })
  it('blocking ends the friendship and hides everything', async () => {
    await as(A, () => q(`insert into public.blocks (blocker, blocked) values ($1, $2)`, [A, B]))
    expect(await as(B, () => q('select * from public.friend_map($1)', [A]))).toHaveLength(0)
    expect(await q(`select 1 from public.friendships where requester = $1 and addressee = $2`, [B, A])).toHaveLength(0)
    expect(await as(B, () => q(`select * from public.find_profiles('alice')`))).toHaveLength(0)
    await db.query('delete from public.blocks')
    await db.query(`insert into public.friendships (requester, addressee, status) values ($1, $2, 'accepted')`, [B, A])
  })
  it('a person you blocked stays visible to you so you can undo it, and never the other way round', async () => {
    await as(A, () => q(`insert into public.blocks (blocker, blocked) values ($1, $2)`, [A, D]))
    expect(await as(A, () => q(`select handle from public.profiles where id = $1`, [D]))).toHaveLength(1) // dave is private
    expect(await as(D, () => q(`select handle from public.profiles where id = $1`, [A]))).toHaveLength(0)
    await db.query('delete from public.blocks')
  })
})

describe('public profile link', () => {
  it('works logged out, only for public profiles, and shows no notes', async () => {
    await db.query(`insert into public.trips (id, user_id, iso, notes) values (gen_random_uuid(), $1, 'ES', 'private note')`, [C])
    const out = await as(null, () => q(`select public.public_profile('Carol') as p`))
    expect(out[0].p.handle).toBe('carol')
    expect(JSON.stringify(out[0].p)).not.toContain('private note')
    expect((await as(null, () => q(`select public.public_profile('alice') as p`)))[0].p).toBeNull()
  })
  it('anonymous visitors cannot read tables or run other functions', async () => {
    expect(await as(null, async () => fails('select * from public.profiles'))).toBe(true)
    expect(await as(null, async () => fails(`select * from public.find_profiles('al')`))).toBe(true)
  })
})

describe('shared trips', () => {
  let trip = ''
  it('creating a trip makes you the owner member', async () => {
    trip = (await as(A, () => q(`insert into public.shared_trips (owner_id, title) values ($1, 'Japan 2027') returning id`, [A])))[0].id
    expect((await q(`select role from public.shared_trip_members where trip_id = $1 and user_id = $2`, [trip, A]))[0].role).toBe('owner')
  })
  it('non-members see nothing and cannot add stops', async () => {
    expect(await as(C, () => q('select * from public.shared_trips'))).toHaveLength(0)
    await as(C, async () => {
      expect(await fails(`insert into public.shared_trip_stops (id, trip_id, iso) values (gen_random_uuid(), $1, 'JP')`, [trip])).toBe(true)
    })
  })
  it('only the owner can invite, and only friends', async () => {
    await as(B, async () => { expect(await fails(`select public.invite_friend($1, $2, 'editor')`, [trip, C])).toBe(true) })
    await as(A, async () => { expect(await fails(`select public.invite_friend($1, $2, 'editor')`, [trip, C])).toBe(true) })
    await as(A, () => q(`select public.invite_friend($1, $2, 'editor')`, [trip, B]))
    expect(await as(B, () => q('select * from public.shared_trips'))).toHaveLength(1)
  })
  it('editors add stops, viewers cannot', async () => {
    await as(B, () => q(`insert into public.shared_trip_stops (id, trip_id, iso) values ($1, $2, 'JP')`, [T1, trip]))
    await as(A, () => q(`update public.shared_trip_members set role = 'viewer' where user_id = $1`, [B]))
    await as(B, async () => {
      expect(await fails(`insert into public.shared_trip_stops (id, trip_id, iso) values (gen_random_uuid(), $1, 'KR')`, [trip])).toBe(true)
    })
    expect(await as(B, () => q('select * from public.shared_trip_stops'))).toHaveLength(1)
  })
  it('a member cannot promote themselves; they can leave', async () => {
    await as(B, () => q(`update public.shared_trip_members set role = 'editor' where user_id = $1`, [B]))
    expect((await q(`select role from public.shared_trip_members where user_id = $1`, [B]))[0].role).toBe('viewer')
    await as(B, () => q(`delete from public.shared_trip_members where user_id = $1`, [B]))
    expect(await as(B, () => q('select * from public.shared_trips'))).toHaveLength(0)
  })
  it('invite links work once valid and are owner-only to create', async () => {
    const tok = (await as(A, () => q(`insert into public.invites (trip_id, role, created_by) values ($1, 'viewer', $2) returning token`, [trip, A])))[0].token
    expect(await as(C, () => q('select * from public.invites'))).toHaveLength(0)
    await as(C, () => q('select public.accept_invite($1)', [tok]))
    expect(await as(C, () => q('select * from public.shared_trips'))).toHaveLength(1)
    await as(C, async () => { expect(await fails(`select public.accept_invite('nope')`)).toBe(true) })
  })
})

describe('account lifecycle', () => {
  it('export returns the user\'s own data only', async () => {
    const out = (await as(A, () => q('select public.export_my_data() as d')))[0].d
    expect(out.profile.handle).toBe('alice')
    expect(out.trips.length).toBeGreaterThan(0)
    expect(JSON.stringify(out)).not.toContain('carol')
  })
  it('deleting the account removes every row they own', async () => {
    await as(A, () => q('select public.delete_my_account()'))
    for (const t of ['profiles', 'trips', 'wishes', 'shared_trips']) {
      const col = t === 'profiles' ? 'id' : t === 'shared_trips' ? 'owner_id' : 'user_id'
      expect(await q(`select 1 from public.${t} where ${col} = $1`, [A])).toHaveLength(0)
    }
    expect(await q(`select 1 from public.friendships where $1 in (requester, addressee)`, [A])).toHaveLength(0)
  })
})

describe('profile personalisation', () => {
  it('lets people set a preset picture, a color, a bio and a status, and rejects bad values', async () => {
    await as(B, async () => {
      await q(`update public.profiles set avatar = 'a:explorer', accent = '#0e7490', bio = 'Chasing sunsets', status = 'Dreaming of Lisbon' where id = $1`, [B])
      expect(await fails(`update public.profiles set accent = 'red' where id = $1`, [B])).toBe(true)
      expect(await fails(`update public.profiles set avatar = 'javascript:alert(1)' where id = $1`, [B])).toBe(true)
      expect(await fails(`update public.profiles set avatar = 'data:image/svg+xml;base64,AAAA' where id = $1`, [B])).toBe(true)
      expect(await fails(`update public.profiles set avatar = $2 where id = $1`, [B, 'data:image/webp;base64,' + 'A'.repeat(9000)])).toBe(true)
      expect(await fails(`update public.profiles set bio = $2 where id = $1`, [B, 'x'.repeat(121)])).toBe(true)
      await q(`update public.profiles set avatar = $2 where id = $1`, [B, 'data:image/webp;base64,' + 'A'.repeat(2000)])
    })
    expect((await q('select avatar from public.profiles where id = $1', [B]))[0].avatar).toMatch(/^data:image\/webp/)
  })
  it('search also finds people by display name and shows their picture', async () => {
    await db.query(`update public.profiles set display_name = 'Zed Traveller', avatar = 'a:pilot', accent = '#d94f8a' where id = $1`, [D])
    const rows = await as(B, () => q(`select * from public.find_profiles('zed')`))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ handle: 'dave', avatar: 'a:pilot', accent: '#d94f8a' })
  })
  it('the public link carries the picture, color and bio of public profiles only', async () => {
    await db.query(`update public.profiles set avatar = 'a:sailor', accent = '#2f9e6f', bio = 'Hi there' where id = $1`, [C])
    const p = (await as(null, () => q(`select public.public_profile('carol') as p`)))[0].p
    expect(p).toMatchObject({ avatar: 'a:sailor', accent: '#2f9e6f', bio: 'Hi there' })
  })
})
