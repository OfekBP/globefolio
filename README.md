# Tripglobe

*Light up your world.* A private, friendly 3D globe of everywhere you have been. Log a city and only that city lights up, while its country counts as visited. Every country and city you add is stamped into a passport.

Everything stays on your phone (IndexedDB). No accounts, no server, works offline once installed.

## Use

It is built phone-first; on a wide screen it shows as a phone-sized column. Tabs: **Map**, **Passport**, **Discover**, **Journal**, plus the **+** button to log a trip.

- **Log a trip:** tap **+**, search any city (or a whole country), add dates and a note.
- **Flags on the globe:** cities wear a round flag, whole countries a banner. Visited places glow; overlapping flags fold into the most important one with a +N badge.
- **Dream list:** add any city or country to it from its page. Dream places show as dashed flags and leave the list when you log a trip there.
- **Passport:** a stamp for every country and city, with milestones.
- **Timeline and replay:** drag the years slider, or press play to watch your travels fill in.
- **Backup:** Journal → Export / Import a JSON file (your trips, dream list and home city).
- **Light / dark:** the sun/moon button; the first visit follows your system.

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

The brand guide lives in `brand.html` (served at `/brand.html`) and `BRAND.md`.
