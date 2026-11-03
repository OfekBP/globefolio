import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

/** False when no backend is configured: the app then works exactly as the local-only version. */
export const cloudEnabled = !!(url && key)

export const supabase: SupabaseClient | null = cloudEnabled
  ? createClient(url!, key!, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null

/** Where sign-in sends people back to: this app's own address, whatever sub-path or domain it is served from. */
export const appUrl = () => new URL('./', location.href).href
