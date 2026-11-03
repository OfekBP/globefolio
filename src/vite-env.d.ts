/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SITE_URL?: string
  /** Supabase project address and public (anon) key. Leave unset to run as a local-only app. */
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** '1' once the Apple developer account is set up in Supabase. */
  readonly VITE_APPLE_SIGNIN?: string
  /** Where people write to you; shown on the legal pages and in the account screen. */
  readonly VITE_CONTACT_EMAIL?: string
}
