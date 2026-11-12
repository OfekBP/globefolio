# GlobeFolio: internal privacy and security records (not published)

Operator: Ofek Ben Porat, Beit Nehmia HaKalanit 33, Israel. Registration no. 327741815. Contact: obporat55@gmail.com.
Keep this file current when anything below changes. It is the paperwork for GDPR Art. 30 and the Israeli data-security regulations.
This is a working record, not legal advice: have a lawyer confirm what applies (see "Open questions").

## What we store, why, where
| Data | Purpose | Where | Kept |
|---|---|---|---|
| Email, sign-in provider, user id | accounts | Supabase Auth (EU region) | until account deletion |
| Handle, display name, home city, visibility | profile and friends | Supabase `profiles` | until deletion |
| Trips, dream list (city, dates, notes, hidden flag) | sync and sharing | Supabase `trips`, `wishes` | until deleted; tombstones purged after 30 days |
| Friendships, blocks, reports, shared trips and stops | social features | Supabase tables | until deletion; reports as needed for safety |
| Crash reports (message, short stack, page path, version, language, browser) | fix bugs | Supabase `error_reports` | 30 days (daily purge job) |
| Local-only data (guest mode) | app function | user's own browser (IndexedDB) | until user clears it |

No GPS or background location, no contacts, no photos, no advertising IDs, no third-party analytics.

## Processors
Supabase (database, auth, realtime; EU region), Google (optional sign-in), Brevo (sign-in emails; free plan, sender obporat55@gmail.com), GitHub Pages (static hosting; sees IP), Google Play (distribution). Review each provider's DPA/terms is accepted in their dashboards.

## Security measures
TLS everywhere; row level security on every table (tests in `tests/rls.test.ts`); anon key only in the client, no service key in the repo; CSP on every page; `npm audit` gate in CI; weekly encrypted database backup (`.github/workflows/backup.yml`) once the two secrets are added; keystore and password backed up off-device (TODO by owner).

## Rights requests (access, export, correction, deletion)
In-app: Journal > Your account > Download my data / Delete my account. By email: reply within 30 days. Deleting an account removes live data immediately; provider backups expire within 30 days.

## Breach procedure (GDPR 72 hours; Israeli law: report serious incidents to the Privacy Protection Authority)
1. Contain: rotate keys (Supabase > API keys, Google client secret, Brevo SMTP key), force sign-out if needed.
2. Assess what data and whose; write down time of discovery (the 72-hour clock starts when we become aware).
3. Notify the supervisory authority within 72 hours when there is a risk to people; notify affected users without delay if the risk is high.
4. Record the incident, cause and fix here.

## Open questions for a lawyer
- Is an EU representative (GDPR Art. 27) needed given we do not target the EU specifically?
- Does any Israeli registration or notification duty apply at our size (post Amendment 13)? Is a DPO needed?
- Review of Privacy Policy and Terms wording; whether 327741815 should be public.
