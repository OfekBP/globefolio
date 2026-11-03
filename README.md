# Tripglobe

*Light up your world.* A private, friendly 3D globe of everywhere you have been. Log a city and only that city lights up, while its country counts as visited. Every country and city you add is stamped into a passport.

By default everything stays on your phone (IndexedDB) and it works offline once installed. Optionally you can sign in to sync across devices, add friends and plan trips together; with no backend configured the app is exactly the local one.

## Use

It is built phone-first; on a wide screen it shows as a phone-sized column. Tabs: **Map**, **Passport**, **Friends** (**Discover** when no backend is configured; "Surprise me" also lives in the Journal's dream list), **Journal**, plus the **+** button to log a trip.

- **Log a trip:** tap **+**, search any city (or a whole country), add dates and a note.
- **Flags on the globe:** cities wear a round flag, whole countries a banner. Visited places glow; overlapping flags fold into the most important one with a +N badge.
- **Dream list:** add any city or country to it from its page. Dream places show as dashed flags and leave the list when you log a trip there.
- **Passport:** a stamp for every country and city, with milestones.
- **Timeline and replay:** drag the years slider, or press play to watch your travels fill in.
- **Backup:** Journal → Export / Import a JSON file (your trips, dream list and home city).
- **Light / dark:** the sun/moon button; the first visit follows your system.

## Accounts, sync, friends, shared trips

Optional, built on [Supabase](https://supabase.com) (choose an EU region). Without the two env vars below the whole feature set stays off and the app is local-only.

- **Local first:** IndexedDB stays the source of truth. Changes are queued in an outbox and pushed when signed in; a cursor pull and Realtime keep other devices current. Last write wins by `updatedAt`; deletes are tombstones. Signing out flushes, then wipes the device.
- **Privacy:** private by default. Friends see places and dates only through the `friend_map()` function, never notes, hidden trips or future trips. Every table has Row Level Security (`supabase/migrations/`, proved by `tests/rls.test.ts`).
- **Languages:** 10, including RTL (Arabic, Hebrew). Strings live in `src/locales/`; `tests/i18n.test.ts` enforces key parity. The translations need a native-speaker review before launch.
- **Legal:** `privacy.html` and `terms.html` are **drafts**, English only. Have a lawyer review them before a public launch.

### Setup (once)

1. Create a Supabase project (EU region) and run `supabase/migrations/20261103000000_init.sql` in the SQL editor (or `supabase db push`).
2. Authentication → Providers: enable **Google** (OAuth client from Google Cloud Console) and **Email** (magic link). Set Site URL and Redirect URLs to your deployed address.
3. Authentication → SMTP: set a real sender (Resend or Brevo); the built-in mailer is heavily rate-limited.
4. Optional **Apple** sign-in (Apple Developer Program, $99/yr): configure the provider, then build with `VITE_APPLE_SIGNIN=1`.
5. Put `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local` for local runs. For Pages, add them as repository **variables** (Settings → Secrets and variables → Actions → Variables); the anon key is public by design, security comes from RLS.
6. Set `VITE_CONTACT_EMAIL` and `VITE_OPERATOR` in `.env` for the legal pages.

```bash
npm test           # RLS (in-process Postgres), sync merge rules, i18n parity
```

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build into dist/
npm run preview    # serve dist/ locally
```

## Deploy

The build uses relative URLs, so `dist/` works on any static host, at a domain root or under a sub-path.

**GitHub Pages (set up already):** pushing to `main` runs `.github/workflows/deploy.yml`. One-time setup: repo **Settings → Pages → Build and deployment → Source: GitHub Actions**. The site appears at `https://<user>.github.io/<repo>/`.

**Netlify / Cloudflare Pages / Vercel:** build command `npm run build`, publish directory `dist`.

Set `VITE_SITE_URL` (with a trailing slash) to the final address so link previews find the social image; `.env` holds a default and the Pages workflow sets it automatically.

The service worker (`public/sw.js`) only registers in production builds. It caches the app, map data and flags, so after the first visit Tripglobe opens with no connection. Bump `CACHE` in `sw.js` if you ever need to force every phone to drop old files.

## Stack

Vite, TypeScript, globe.gl (three.js), idb, Nunito (bundled, no external requests). The far globe is one painted texture and real polygons appear only when you zoom in, which keeps dragging smooth on phones.

- Country borders and cities: [Natural Earth](https://www.naturalearthdata.com/) (public domain), reduced by `scripts/build-geo.mjs`.
- Flags: [country-flag-icons](https://gitlab.com/catamphetamine/country-flag-icons) (MIT).
- Font: [Nunito](https://fonts.google.com/specimen/Nunito) (SIL Open Font License) via `@fontsource-variable/nunito`.

## Scripts

```bash
node scripts/build-icons.mjs                       # PNG icons + social card from the brand SVGs
python scripts/build-brand.py <path to nunito.ttf>  # logo SVGs (needs fonttools)
node scripts/build-geo.mjs <folder>                # geo data from Natural Earth downloads
node scripts/build-borders.mjs <folder>            # region borders and city outlines
```

