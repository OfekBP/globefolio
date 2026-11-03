# Wayfarer design system

**World:** Earth at night from orbit. Your travels are the city lights. The globe leads; the journal is a guest.

## Color
| Token | Value | Role |
|---|---|---|
| `--void` | #04060b | page and globe ground |
| `--sheet` | #070a11 | journal drawer, tooltip |
| `--ink` | #e9e4da | text (moonlight-warm white) |
| `--dim` | #9a9cab | secondary text, labels (AA on void/sheet) |
| `--sodium` | #ffb454 | the only light that means "you were here": lit countries, key numbers, focus ring, primary action |
| `--sodium-hot` | #ffd89b | hover/selected lit land, timeline thumb |
| `--alert` | #ff9d8a | errors, destructive hover |
| atmosphere | #5f93d4 | thin airglow on the limb, 3D only |

Lit land is an additive amber fill (`#ff8c1a`, 0.48 opacity, 0.7 on hover/selected). Unvisited land is untouched night texture.

## Type
- Display: **Tenor Sans** (wordmark tracked 0.46em caps; sentence stat clamp 28-46px; drawer title clamp 36-54px).
- Body: **Hanken Grotesk** 15/1.55; tabular numerals for dates and distances; 11px tracked caps for field labels.

## Components
- Drawer: solid, hairline left rule, slides from right (bottom sheet under 800px). Modes: search, country journal, trip form. No blur, no cards.
- Entries: dated hairline-separated list, amber uppercase date, display-face place, notes in ink.
- Buttons: squared (3px radius). Outline amber for "Log a trip", solid amber for the single primary action in a sheet, text buttons for everything else.
- Inputs: underline only; amber underline on focus.
- Timeline: 1px hairline filled amber to the chosen year; right end = all time.

## Motion
One authored moment: the opening descent from high orbit to home. Drawer ease `cubic-bezier(.16,1,.3,1)` 550ms. Light trails travel from home to each destination. All motion collapses under `prefers-reduced-motion`.

## Rules
No glass or blur, no neon cyan, no stat-tile cards, no kickers or section numbers, no gradient text.
