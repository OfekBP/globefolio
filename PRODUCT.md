# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vite + TypeScript, globe.gl (three.js), IndexedDB. No backend. Chosen with the user; runs fully offline apart from optional place search and web fonts.

## Users

One person: the owner. They use it at a desk or on a couch to look back over every place they have been, and to log a trip right after coming home. Self use first; sharing is a later question.

## Product Purpose

GlobeFolio is a private, interactive 3D globe of everywhere the owner has traveled. Visited countries are lit, trips become a journal (dates, places, notes, later photos), and the whole life of travel can be zoomed from the whole Earth down to a single country or city. Success: opening it feels like looking back at your own life from orbit, and logging a new trip takes seconds.

## Positioning

A keepsake, not a dashboard. The globe is the product; the data is a memory layer on top of it. Unlike travel-tracker apps, it is local, personal, and friendly rather than a social or stats service.

## Operating Context

Entry is manual: the owner types countries, dates, optional places and notes. No import from Google Timeline or photo GPS in v1. Data lives in the browser (IndexedDB) with JSON export/import as backup.

## Capabilities and Constraints

- Trips are city-level: logging a city lights only that city, while its country still counts as visited. Logging a whole country fills it.
- Bundled Natural Earth city list (7k+) for offline search; deep zoom to street-level map tiles (online).
- Click a country or tap near a city: fly there, read its journal entries; flags throughout.
- Log, edit, delete trips (city or whole country, dates, notes).
- Home city; light trails from home to destinations; distance traveled.
- Light and dark themes chosen by the owner.
- Timeline scrubber to replay travel through the years.
- Export/import JSON. No accounts, no server.
- Undecided: photos per trip, wishlist cities, sharing, offline map tiles.

## Brand Commitments

Name: GlobeFolio. Tagline: "Your world, lit up." Feel pinned by the user (second round): friendly like Traviary, Globetrotter, Orvenara; big interactive globe with stats and sentences below; light and dark modes. (Round one was cinematic night Earth, superseded.)

## Evidence on Hand

No real trip data yet; the owner enters it. Demo data must never be seeded into the user's store.

## Product Principles

1. The globe leads; every panel is a guest.
2. Logging a trip must be faster than remembering to.
3. Everything is the owner's: local, exportable, never shared by default.
4. Memory over metrics: numbers support the journal, they do not replace it.

## Accessibility & Inclusion

Keyboard operable (search with "/", Esc to close), visible focus, reduced-motion respected, text contrast AA on the dark ground.
