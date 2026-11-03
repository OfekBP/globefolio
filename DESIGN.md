# Trip Track design system

**World:** a friendly travel keepsake. A big, real-looking globe you can fall into, with soft rounded surfaces, warm coral for "you were here", and plain-spoken sentences below it. Light and dark are both first-class; the owner chooses.

## Themes
| Token | Light | Dark | Role |
|---|---|---|---|
| `--bg` | #f1f7fc | #0a1424 | page |
| `--surface` / `--surface-2` | #fff / #eef5fb | #111f36 / #182a47 | cards, drawer / inputs, entries |
| `--ink` | #12263f | #eaf1fb | text |
| `--dim` | #556a83 | #9db0c8 | secondary text (AA) |
| `--accent` | #ff5a2c | #ff8a5c | lit cities, whole-country fill, bars, slider |
| `--btn` | #d63f12 (white text) | #ff8a5c (dark text) | primary actions |
| tints | coral #ffe2d6, sun #ffefbf, teal #d3f2ee, sky #d7eafc | same hues at ~15% alpha | stat tiles |

The first visit follows the system theme; after that the choice is saved. Globe skin follows the theme: light uses the Esri Topo basemap on a sky-blue stage; dark uses Esri satellite imagery on deep navy with stars.

## Type
- Display: **Bricolage Grotesque** 700 (headline clamp 36-64px, tile numbers 62px, drawer title 32-42px, section titles 28px).
- Body: **Figtree** 16/1.55, 500-700 for labels and chips. Tabular numerals for dates and distances.

## Shape and depth
Large radii (stage 36px, tiles 30px, drawer 30px, chips and buttons fully round). Depth is a soft offset shadow, never a halo. Surfaces are solid; no blur.

## Components
- **Stage:** the globe in a rounded sky panel with a floating search pill, zoom stack, hint chip and a year-timeline pill.
- **Pins:** a coral dot with a white ring and a slow pulse; the city name chip appears when you are zoomed in.
- **Drawer:** floating rounded sheet from the right (bottom sheet on phones). Modes: search (cities and countries with flags), country, city, trip form.
- **Story:** one sentence headline with highlighted counts, four asymmetric pastel tiles (world %, continents, distance, trips), flag chips for each country, a recent-trips list.

## Behaviour
- Logging a city lights only that city (pin + trail from home); the country counts as visited but is not filled. Logging "whole country" fills it.
- Deep zoom swaps to street-level map tiles; click a spot near a city to open it.
- Motion: opening descent, drawer slide (550ms ease-out), pulsing pins, travelling trails. All collapse under `prefers-reduced-motion`.

## Rules
No neon, no glass or blur, no section numbers or kickers, no icon-heading-text card grids as page structure, no emoji flags (real SVG flags).
