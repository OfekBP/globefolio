import type { RealtimeChannel } from '@supabase/supabase-js'
import { getProfile, getSession } from './auth'
import type { Person } from './friends'
import type { Place } from './store'
import { appUrl, supabase } from './supabase'

export type Role = 'owner' | 'editor' | 'viewer'
export interface SharedTrip { id: string; title: string; owner_id: string; role: Role; members: number }
export interface Stop { id: string; trip_id: string; iso: string; place: Place | null; start_date: string | null; end_date: string | null; notes: string | null; updated_at: string; deleted_at: string | null }
export interface Member extends Person { role: Role }

const need = () => { if (!supabase || !getSession()) throw new Error('signed out'); return supabase }
const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message) }
const me = () => getSession()!.user.id

export async function listShared(): Promise<SharedTrip[]> {
  const { data, error } = await need().from('shared_trips').select('id, title, owner_id, shared_trip_members(user_id, role)').order('created_at', { ascending: false })
  fail(error)
  return (data ?? []).map((r: any) => ({
    id: r.id, title: r.title, owner_id: r.owner_id,
    role: (r.shared_trip_members as { user_id: string; role: Role }[]).find(m => m.user_id === me())?.role ?? 'viewer',
    members: r.shared_trip_members.length,
  }))
}

export async function createShared(title: string): Promise<string> {
  const { data, error } = await need().from('shared_trips').insert({ owner_id: me(), title: title.trim().slice(0, 80) }).select('id').single()
  fail(error)
  return data!.id as string
}

export const deleteShared = async (id: string) => fail((await need().from('shared_trips').delete().eq('id', id)).error)

export async function getStops(tripId: string): Promise<Stop[]> {
  const { data, error } = await need().from('shared_trip_stops').select('*').eq('trip_id', tripId).is('deleted_at', null)
  fail(error)
  return ((data ?? []) as Stop[]).sort((a, b) => (a.start_date ?? '9').localeCompare(b.start_date ?? '9') || a.iso.localeCompare(b.iso))
}

export async function saveStop(s: Omit<Stop, 'updated_at' | 'deleted_at'>) {
  fail((await need().from('shared_trip_stops').upsert({ ...s, updated_at: new Date().toISOString(), deleted_at: null }, { onConflict: 'id' })).error)
}

export const removeStop = async (id: string) =>
  fail((await need().from('shared_trip_stops').update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id)).error)

export async function getMembers(tripId: string): Promise<Member[]> {
  const db = need()
  const { data, error } = await db.from('shared_trip_members').select('user_id, role').eq('trip_id', tripId)
  fail(error)
  const ids = (data ?? []).map(m => m.user_id as string)
  const { data: people } = await db.from('profiles').select('id, handle, display_name, avatar, accent').in('id', ids)
  const by = new Map((people ?? []).map(p => [p.id as string, p as Person]))
  return (data ?? []).map(m => ({ ...(by.get(m.user_id) ?? { id: m.user_id, handle: '?', display_name: null }), role: m.role as Role }))
}

export const inviteFriend = async (tripId: string, friendId: string, role: 'editor' | 'viewer') =>
  fail((await need().rpc('invite_friend', { trip: tripId, friend: friendId, member_role: role })).error)
export const setRole = async (tripId: string, userId: string, role: 'editor' | 'viewer') =>
  fail((await need().from('shared_trip_members').update({ role }).eq('trip_id', tripId).eq('user_id', userId)).error)
export const removeMember = async (tripId: string, userId: string) =>
  fail((await need().from('shared_trip_members').delete().eq('trip_id', tripId).eq('user_id', userId)).error)

export async function createInviteLink(tripId: string, role: 'editor' | 'viewer'): Promise<string> {
  const { data, error } = await need().from('invites').insert({ trip_id: tripId, role, created_by: me() }).select('token').single()
  fail(error)
  return `${appUrl()}#/join/${data!.token}`
}

export async function acceptInvite(token: string): Promise<string> {
  const { data, error } = await need().rpc('accept_invite', { tok: token })
  fail(error)
  return data as string
}

/** Live updates for one trip, plus who else has it open right now. Returns a function that stops listening. */
export function watchTrip(tripId: string, onChange: () => void, onPresence: (handles: string[]) => void): () => void {
  const db = need()
  const ch: RealtimeChannel = db.channel(`trip:${tripId}`, { config: { presence: { key: me() } } })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_trip_stops', filter: `trip_id=eq.${tripId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_trip_members', filter: `trip_id=eq.${tripId}` }, onChange)
    .on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState() as Record<string, { handle?: string }[]>
      onPresence(Object.entries(state).filter(([k]) => k !== me()).map(([, v]) => v[0]?.handle ?? '').filter(Boolean))
    })
    .subscribe(status => { if (status === 'SUBSCRIBED') void ch.track({ handle: getProfile()?.handle ?? '' }) })
  return () => { void db.removeChannel(ch) }
}
