# Trip Track

*Your world, lit up.* A private, friendly 3D globe of everywhere you have been. Log a city and only that city lights up, while its country counts as visited. Zoom from the whole Earth down to street level.

Everything stays in your browser (IndexedDB). No accounts, no server.

## Run

```bash
npm install
npm run dev
```

## Use

- **Log a trip:** press `/` or "Log a trip", search any city (or a whole country), add dates and a note.
- **Light up a city:** pick a city and only that city glows. The country is counted but not filled.
- **Deep zoom:** scroll in to reach real map detail; tap near a city to open it.
- **Home city:** set one to draw light trails and measure distance.
- **Timeline:** drag the years slider to replay your travels.
- **Light / dark:** the sun/moon button; first visit follows your system.
- **Backup:** Export / Import a JSON file.

## Stack

Vite, TypeScript, globe.gl (three.js), idb. Data and credits:

- Country borders and 7,000+ cities: [Natural Earth](https://www.naturalearthdata.com/) (public domain), reduced by `scripts/build-geo.mjs`.
- Map tiles: Esri (Topo and World Imagery), © OpenStreetMap contributors. Tiles are fetched live, so deep zoom needs a connection.
- Flags: [country-flag-icons](https://gitlab.com/catamphetamine/country-flag-icons) (MIT).

## Rebuild the geo data

Download `ne_50m_admin_0_countries.geojson` as `countries.geojson` and `ne_10m_populated_places_simple.geojson` as `places.geojson` from Natural Earth into one folder, then:

```bash
node scripts/build-geo.mjs <that folder>
```

## Roadmap

Photos per trip, wishlist cities, shareable poster export, installable offline PWA.
