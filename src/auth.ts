import type { Session } from '@supabase/supabase-js'
import { appUrl, cloudEnabled, supabase } from './supabase'

export type Visibility = 'private' | 'friends' | 'public'
export interface Profile { id: string; handle: string; display_name: string | null; visibility: Visibility; home_city_key: string | null }

/** Email sign-in links need a real SMTP sender on the Supabase project; the flag stays off until that is set up. */
export const emailEnabled = import.meta.env.VITE_EMAIL_SIGNIN === '1'
export const appleEnabled = import.meta.env.VITE_APPLE_SIGNIN === '1'
export const contactEmail = import.meta.env.VITE_CONTACT_EMAIL || 'privacy@globefolio.example'

let session: Session | null = null
let profile: Profile | null = null
let profileFailed = false
let profilePending = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(fn => fn())

export const onAuth = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }
export const getSession = () => session
export const getProfile = () => profile
/** true when the profile could not be loaded (offline, say), as opposed to not existing yet */
export const profileLoadFailed = () => profileFailed
export const signedIn = () => !!session
/** true while the first profile fetch is still in flight, so the UI shows loading rather than offering to create a handle */
export const profileLoading = () => profilePending

async function loadProfile() {
  if (!supabase || !session) { profile = null; profileFailed = false; return }
  const { data, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
  profileFailed = !!error
  if (!error) profile = (data as Profile | null) ?? null // on a failed load keep what we had rather than pretend there is no profile
}

export const reloadProfile = async () => { await loadProfile(); emit() }

export async function initAuth() {
  if (!supabase) { return }
  try { session = (await supabase.auth.getSession()).data.session } catch { session = null } // offline with an expired token must not block the app
  // The session is read from storage, so it is known at once and initAuth returns. The profile needs the network:
  // it is fetched in the background (the first screen never waits for it) and announced when it arrives or after 2.5 s.
  profilePending = !!session
  const first = loadProfile().finally(() => { profilePending = false })
  void first.then(emit)
  void Promise.race([first, new Promise(r => setTimeout(r, 2500))]).then(() => {
    emit()
    // listening starts after the first announcement, so the initial-session event cannot announce a session with no profile yet
    supabase!.auth.onAuthStateChange(async (event, s) => {
      const changed = s?.user.id !== session?.user.id
      session = s
      if (event === 'SIGNED_OUT') profile = null
      // the callback must not await Supabase calls itself, or it can deadlock the client
      if (changed || event === 'USER_UPDATED') setTimeout(async () => { await loadProfile(); emit() }, 0)
      else emit()
    })
  })
}

const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message) }

export async function signInWithProvider(provider: 'google' | 'apple') {
  if (!supabase) throw new Error('Accounts are not set up yet')
  fail((await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: appUrl() } })).error)
}

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
export const googleButtonEnabled = cloudEnabled && !!googleClientId

interface GoogleId {
  initialize(o: { client_id: string; nonce: string; callback: (r: { credential: string }) => void; use_fedcm_for_prompt?: boolean }): void
  renderButton(el: HTMLElement, o: Record<string, unknown>): void
}
let gisLoad: Promise<void> | null = null
const loadGis = () => gisLoad ??= new Promise<void>((ok, no) => {
  const s = document.createElement('script')
  s.src = 'https://accounts.google.com/gsi/client'
  s.async = true
  s.onload = () => ok()
  s.onerror = () => { gisLoad = null; no(new Error('Google sign-in could not load')) }
  document.head.append(s)
})

/**
 * Google's own sign-in button. Unlike the redirect flow, the consent screen it opens names GlobeFolio rather than the
 * backend address. The ID token it returns is exchanged with Supabase, bound to a one-time nonce.
 */
export async function renderGoogleButton(el: HTMLElement, onError: () => void) {
  if (!supabase || !googleClientId) throw new Error('Google sign-in is not set up')
  await loadGis()
  const gid = (window as unknown as { google?: { accounts: { id: GoogleId } } }).google?.accounts.id
  if (!gid) throw new Error('Google sign-in could not load')
  const raw = crypto.randomUUID() + crypto.randomUUID()
  const hashed = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)))].map(b => b.toString(16).padStart(2, '0')).join('')
  gid.initialize({
    client_id: googleClientId,
    nonce: hashed,
    use_fedcm_for_prompt: true,
    callback: async r => {
      try {
        const { error } = await supabase!.auth.signInWithIdToken({ provider: 'google', token: r.credential, nonce: raw })
        if (error) onError()
      } catch { onError() } // offline
    },
  })
  gid.renderButton(el, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', logo_alignment: 'center', width: Math.min(400, Math.max(200, Math.floor((el.clientWidth || 280) / 1.25))), locale: document.documentElement.lang || 'en' })
}

export async function signInWithEmail(email: string) {
  if (!supabase) throw new Error('Accounts are not set up yet')
  fail((await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: appUrl(), shouldCreateUser: true } })).error)
}

export async function signInWithPassword(email: string, password: string) {
  if (!supabase) throw new Error('Accounts are not set up yet')
  fail((await supabase.auth.signInWithPassword({ email: email.trim(), password })).error)
}

/** Returns true when the account is ready to use at once, false when the person must first confirm their email. */
export async function signUpWithPassword(email: string, password: string): Promise<boolean> {
  if (!supabase) throw new Error('Accounts are not set up yet')
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: appUrl() } })
  fail(error)
  return !!data.session
}

export const handleOk = (h: string) => /^[a-z0-9_]{3,20}$/.test(h) && !['admin', 'support', 'tripglobe', 'globefolio', 'help', 'root', 'staff', 'official'].includes(h)

export async function handleAvailable(h: string): Promise<boolean> {
  if (!supabase || !handleOk(h)) return false
  const { data } = await supabase.rpc('handle_taken', { h })
  return data === false
}

export async function createProfile(handle: string, displayName: string) {
  if (!supabase || !session) throw new Error('Sign in first')
  const { error } = await supabase.from('profiles').insert({ id: session.user.id, handle, display_name: displayName.trim() || null })
  if (error) throw new Error(error.code === '23505' && /handle/i.test(`${error.message} ${error.details ?? ''}`) ? 'That handle is taken' : error.message)
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
  if (supabase) fail((await supabase.auth.signOut()).error)
}

export { cloudEnabled }
