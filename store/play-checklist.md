# Publishing GlobeFolio on Google Play

Everything that can be prepared without the developer account is in this folder:

| File | What it is |
|---|---|
| `listing.md` | Title, short and full description in 10 languages |
| `graphics/<lang>/` | Per language: 4 phone screenshots (1080x1920) and the feature graphic (1024x500). Regenerate with `node store/render-graphics.mjs` after re-shooting the app. Git-ignored. |
| `data-safety.md` | Draft answers for Data safety, content rating, target audience |
| `twa-manifest.json` | Bubblewrap config that wraps the web app as an Android app |
| `../public/icons/icon-512.png` | The 512x512 store icon |
| `../delete-account.html` | The public account-deletion page Play requires (live at /globefolio/delete-account.html) |

## 1. Account (you, in progress)
- Play Console developer account as an organization (D&B number). Organizations are normally exempt from the "12 testers for 14 days" rule that personal accounts face; confirm in the console once it opens.
- Identity and contact verification, then the one-time registration fee ($25), which is the only unavoidable cost.

## 2. The Android app (built)
The web app is wrapped as a Trusted Web Activity with Bubblewrap. Built 8 Nov 2026, version 1, package `io.github.ofekbp.globefolio`, Android 7+ (API 24), target API 36.
- Files (git-ignored, on this PC): `android/release/GlobeFolio.aab` (upload to Play) and `android/release/GlobeFolio-test.apk` (install on a phone to try it).
- Upload key: `_secrets/globefolio-upload.keystore`, password in `_secrets/keystore-password.txt` (folder `C:\Users\User\Documents\Wayfarer\_secrets`). **Back both up now** (password manager plus a second copy); never commit or share them. Play App Signing keeps the real release key; if the upload key is ever lost, Play support can reset it.
- New store version: raise `appVersion` and `appVersionCode` in `android/twa-manifest.json`, run `npx @bubblewrap/cli update --skipVersionUpgrade` and `gradlew bundleRelease` in `android/`, then sign the bundle with `jarsigner` using the upload key. The web content itself updates instantly for everyone without a new store version.
- `twa-manifest.json` in this folder is the config source of truth (the copy in `android/` points at the local keystore path).

## 3. Digital Asset Links (removes the browser bar)
A TWA only hides the address bar if the site proves it belongs to the app, via `https://<host>/.well-known/assetlinks.json`.
The site lives at `ofekbp.github.io/globefolio/`, but that file must be at the **root** of `ofekbp.github.io`. Two options:
- **Free:** create a GitHub repo named `OfekBP.github.io`, enable Pages on it, and put `store/assetlinks.json` at `.well-known/assetlinks.json` in it. It holds the upload-key fingerprint (good for the test APK). After the first upload, Play Console shows the **App signing key** fingerprint (Setup, App signing): add it to the same file, because real users' installs are signed with that key.
- **Cleaner:** buy a domain, point it at the site, and change `host` and `startUrl` in `twa-manifest.json`. The landing page could then become the home page.
Without it the app still works but shows a small browser bar at the top.

## 4. Store listing
Main store listing: copy from `listing.md`, upload the 512 icon, `graphics/en/feature-graphic.png` and `graphics/en/phone-*.png`. For each extra language, add a translation and upload that language's folder.
Privacy policy URL: https://ofekbp.github.io/globefolio/privacy.html (replace the placeholder operator name and address in it first).

## 5. App content
Follow `data-safety.md`. Account deletion URL: https://ofekbp.github.io/globefolio/delete-account.html

## 6. Release
Internal testing first (instant, up to 100 testers), then production. Review usually takes a few days for a new account.

## Before you submit
- [ ] Real phone test of sign-in, sync, friends, shared trips
- [x] Operator name (Ofek Ben Porat) filled in
- [ ] Postal address and registration number on the privacy page (the bracketed line)
- [ ] Back up `_secrets/`
- [ ] Legal pages reviewed by someone qualified
- [ ] Magic-link email sender (SMTP) set up
- [ ] Native-speaker pass on the translations

## Added 13 Nov 2026 (profiles, friends, cheers)
- [ ] Data safety form: declare **Photos** (optional profile picture the user uploads: collected, shared with other users, optional, deletable). See the update note at the end of `data-safety.md`.
- [ ] App content, App access: choose "All or some functionality is restricted" and add instructions: open Friends, choose Sign in, enter the reviewer email and password you created (you type them in the console, never in the repo). Everything else works without an account.
- [ ] User-generated content: Play asks about it. Answer that users can report and block (Friends, Report and Block), and moderation is described in `docs/MODERATION.md`. Review reports at least every 48 hours.
- [ ] Supabase migrations are all applied (`supabase/migrations/`, latest is `20261113000001_reactions_iso.sql`).
- [ ] The web app updates instantly; the existing `GlobeFolio.aab` (version 1) does not need rebuilding for these changes.
