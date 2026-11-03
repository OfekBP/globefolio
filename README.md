# Wayfarer

*Your world, lit up.* A private, interactive 3D globe of everywhere you have been. Visited countries glow like city lights, trips become a journal, and a timeline replays your travels.

Everything stays on your machine (IndexedDB). Optional place search uses OpenStreetMap Nominatim.

## Run

```bash
npm install
npm run dev
```

## Use

- Click a country to fly there and read its journal.
- Press `/` (or "Log a trip") to log a trip. Esc closes the journal.
- Set a home country to draw light trails to every destination.
- Drag the years slider to replay your travels.
- Export / Import a JSON backup.

## Stack

Vite, TypeScript, globe.gl (three.js), idb. Country borders from Natural Earth (public domain), night texture from three-globe examples.

## Roadmap

Photos per trip, wishlist countries, city-level deep zoom, shareable poster export.
