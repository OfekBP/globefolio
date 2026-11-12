# Handling reports (Google Play user-generated-content policy)

Reports from the app land in the Supabase table `reports` (reporter, reported, reason, created_at).
Nobody but the operator can read it (no API access): open Supabase > Table Editor > `reports`.

Routine: check at least every 48 hours (we promise 72 on the Safety page).
1. Read the reason; open the reported profile's trips/notes through the dashboard if needed.
2. If it breaks the rules: delete the content or the account (Authentication > Users > delete; data cascades).
3. If it involves a child or a threat: delete immediately, keep the record, and report to the authorities as the law requires.
4. Delete handled rows from `reports`.

Crash reports are separate: Table Editor > `error_reports`.


## Profile pictures, names, bios (added 12 Nov 2026)
Profiles can have a picture (preset or a small uploaded photo), display name, bio and status, visible to anyone who can find the person. Reports use the reasons Harassment, Spam, Inappropriate name or picture, Something else, and land in `reports.reason`. When a report concerns a picture, bio or name: open Supabase, Table Editor, `profiles`, find the row by handle, set `avatar`, `bio`, `status` and/or `display_name` to NULL, and mark the report handled. Repeat offenders: delete the user under Authentication, Users (this removes everything they own). Review reports at least every 48 hours.
