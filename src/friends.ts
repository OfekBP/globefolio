import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSession } from './auth'
import type { Place } from './store'
import { supabase } from './supabase'

export interface Person { id: string; handle: string; display_name: string | null }
/** `incoming`: they asked you; `outgoing`: you asked them; `friend`: accepted. */
export interface Link extends Person { state: 'incoming' | 'outgoing' | 'friend' }
export interface MapRow { iso: string; place: Place | null; start_date: string | null }

const need = () => { if (!supabase || !getSession()) throw new Error('signed out'); return supabase }
const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message) }
const me = () => getSession()!.user.id

/** Everyone you have a request or friendship with, with the profile fields their privacy settings let you see. */
export async function listLinks(): Promise<Link[]> {
  const db = need()
  const { data, error } = await db.from('friendships').select('requester, addressee, status')
  fail(error)
  const rows = data ?? []
  const ids = [...new Set(rows.map(r => (r.requester === me() ? r.addressee : r.requester)))]
  if (!ids.length) return []
  const { data: people, error: e2 } = await db.from('profiles').select('id, handle, display_name').in('id', ids)
  fail(e2)
  const byId = new Map((people ?? []).map(p => [p.id as string, p as Person]))
  return rows.flatMap(r => {
    const other = r.requester === me() ? r.addressee : r.requester
    const p = byId.get(other)
    if (!p) return []
    const state: Link['state'] = r.status === 'accepted' ? 'friend' : r.requester === me() ? 'outgoing' : 'incoming'
    return [{ ...p, state }]
  }).sort((a, b) => a.handle.localeCompare(b.handle))
}

export async function findPeople(q: string): Promise<Person[]> {
  const { data, error } = await need().rpc('find_profiles', { q })
  fail(error)
  return (data ?? []) as Person[]
}

export const sendRequest = async (id: string) => fail((await need().from('friendships').insert({ requester: me(), addressee: id })).error)
export const acceptRequest = async (fromId: string) => fail((await need().from('friendships').update({ status: 'accepted' }).eq('requester', fromId).eq('addressee', me())).error)
/** Declines a request, cancels one you sent, or ends a friendship. */
export const removeLink = async (otherId: string) =>
  fail((await need().from('friendships').delete().or(`and(requester.eq.${me()},addressee.eq.${otherId}),and(requester.eq.${otherId},addressee.eq.${me()})`)).error)
export const blockPerson = async (id: string) => fail((await need().from('blocks').insert({ blocker: me(), blocked: id })).error)
export const unblockPerson = async (id: string) => fail((await need().from('blocks').delete().eq('blocker', me()).eq('blocked', id)).error)
export const reportPerson = async (id: string, reason: string) => fail((await need().from('reports').insert({ reporter: me(), reported: id, reason: reason.slice(0, 500) })).error)

export async function listBlocked(): Promise<Person[]> {
  const db = need()
  const { data, error } = await db.from('blocks').select('blocked')
  fail(error)
  const ids = (data ?? []).map(r => r.blocked as string)
  if (!ids.length) return []
  const { data: people, error: e2 } = await db.from('profiles').select('id, handle, display_name').in('id', ids)
  fail(e2)
  return (people ?? []) as Person[]
}

export async function friendMap(id: string): Promise<MapRow[]> {
  const { data, error } = await need().rpc('friend_map', { friend: id })
  fail(error)
  return (data ?? []) as MapRow[]
}

/** The public page behind a shared link. Works without signing in. */
export async function publicProfile(handle: string): Promise<{ handle: string; display_name: string | null; trips: MapRow[] } | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('public_profile', { h: handle })
  if (error || !data) return null
  return data as { handle: string; display_name: string | null; trips: MapRow[] }
}

/** Tells the app when friend requests change, so a badge and a toast can appear while it is open. */
export function watchFriendships(onChange: () => void): () => void {
  if (!supabase || !getSession()) return () => {}
  const ch: RealtimeChannel = supabase.channel(`friends:${me()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, onChange)
    .subscribe()
  return () => { void supabase!.removeChannel(ch) }
}
