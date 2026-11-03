import type { Session } from '@supabase/supabase-js'
import { appUrl, cloudEnabled, supabase } from './supabase'

export type Visibility = 'private' | 'friends' | 'public'
export interface Profile { id: string; handle: string; display_name: string | null; visibility: Visibility; home_city_key: string | null }

export const appleEnabled = import.meta.env.VITE_APPLE_SIGNIN === '1'
export const contactEmail = import.meta.env.VITE_CONTACT_EMAIL || 'privacy@tripglobe.example'

let session: Session | null = null
let profile: Profile | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(fn => fn())

export const onAuth = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }
export const getSession = () => session
export const getProfile = () => profile
export const signedIn = () => !!session

async function loadProfile() {
  if (!supabase || !session) { profile = null; return }
  const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
  profile = (data as Profile | null) ?? null
}

export async function initAuth() {
  if (!supabase) { return }
  const { data } = await supabase.auth.getSession()
  session = data.session
  await loadProfile()
  emit()
  supabase.auth.onAuthStateChange(async (event, s) => {
    const changed = s?.user.id !== session?.user.id
    session = s
    if (event === 'SIGNED_OUT') profile = null
    // the callback must not await Supabase calls itself, or it can deadlock the client
    if (changed || event === 'USER_UPDATED') setTimeout(async () => { await loadProfile(); emit() }, 0)
    else emit()
  })
}

const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message) }

export async function signInWithProvider(provider: 'google' | 'apple') {
  if (!supabase) throw new Error('Accounts are not set up yet')
  fail((await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: appUrl() } })).error)
}

export async function signInWithEmail(email: string) {
  if (!supabase) throw new Error('Accounts are not set up yet')
  fail((await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: appUrl(), shouldCreateUser: true } })).error)
}

export const handleOk = (h: string) => /^[a-z0-9_]{3,20}$/.test(h) && !['admin', 'support', 'tripglobe', 'help', 'root', 'staff', 'official'].includes(h)

export async function handleAvailable(h: string): Promise<boolean> {
  if (!supabase || !handleOk(h)) return false
  const { data } = await supabase.rpc('handle_taken', { h })
  return data === false
}

export async function createProfile(handle: string, displayName: string) {
  if (!supabase || !session) throw new Error('Sign in first')
  const { error } = await supabase.from('profiles').insert({ id: session.user.id, handle, display_name: displayName.trim() || null })
  if (error) throw new Error(error.code === '23505' ? 'That handle is taken' : error.message)
  await loadProfile()
  emit()
}

export async function updateProfile(patch: Partial<Pick<Profile, 'display_name' | 'visibility' | 'home_city_key'>>) {
  if (!supabase || !session) return
  fail((await supabase.from('profiles').update(patch).eq('id', session.user.id)).error)
  await loadProfile()
  emit()
}

export async function exportCloudData(): Promise<unknown> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('export_my_data')
  fail(error)
  return data
}

export async function deleteAccount() {
  if (!supabase) return
  fail((await supabase.rpc('delete_my_account')).error)
}

export async function signOutRemote() {
  if (supabase) await supabase.auth.signOut()
}

export { cloudEnabled }
