# Play Console answers (draft)

Use these when filling Policy, App content. They match the privacy policy and the code as of this commit. Re-check them whenever a feature changes.

## Data safety form

**Does the app collect or share required user data types?** Yes, but only when a person chooses to create an account. Without an account nothing leaves the phone.
**Is all collected data encrypted in transit?** Yes (HTTPS only, enforced by the app's Content-Security-Policy).
**Do you provide a way for users to request that data is deleted?** Yes. In the app: Settings, account, Delete my account (instant). Web link: https://ofekbp.github.io/globefolio/delete-account.html

| Data type | Collected | Shared | Optional | Purpose |
|---|---|---|---|---|
| Email address | Yes, at sign-in | No | Yes, account is optional | Account management |
| Name (display name) | Yes | No (visible to friends only if the user allows) | Yes | App functionality |
| User IDs (handle) | Yes | No | Yes | App functionality, account management |
| Other user-generated content (trips, wishes, notes) | Yes, only for signed-in users | No | Yes | App functionality (sync, friends, shared trips) |
| Precise or approximate location | **No**. The app never reads the phone's location; places are picked by the user from a list | - | - | - |
| App info and performance: Crash logs (error message, short stack trace, page path, app version, language, browser string; no user id) | **Yes**, sent automatically when the app hits an unexpected error, to our own database, deleted after 30 days | No | No (automatic) | Analytics (diagnostics) |
| Photos, contacts, files, calendar, financial, health, device IDs, ads data, other analytics | **No** | - | - | - |

"Shared" means transferred to a third party. Supabase (database host) and Google (sign-in) act as service providers on our behalf, which Play does not count as sharing. Friends see data only when the user sets their profile to friends or public.

Added 12 Nov 2026: crash reporting (src/errors.ts) is the one automatic collection; declare it, and keep the privacy policy row in sync.

Security practices to tick: data is encrypted in transit; users can request deletion.
Not independently security-reviewed: leave that box unticked.

## Other App content declarations

- **Ads:** No ads.
- **Target audience:** 13 and over (matches the privacy policy). Not designed for children; do not enable "appeals to children".
- **Content rating (IARC questionnaire):** Travel/lifestyle utility. Answer "yes" to users interacting with each other and to user-generated content (friends, shared trips, notes), "no" to sharing the user's location with others, violence, sex, gambling, drugs, purchases. Expect Everyone / 12+ range depending on the answers.
- **User-generated content policy:** the app has friends, blocking and shared trips. In-app Block and Report actions both exist (Friends screen), which is what Play expects. Tell the reviewer where they are.
- **Government app / financial features / health:** No.
- **News app / COVID-19:** No.
- **Advertising ID:** the app does not use it (declare "No").
- **Permissions:** the wrapper asks for none beyond internet. No notifications, no location, no camera.
- **App access for reviewers:** the core app needs no login. For the account features, create a test account (email magic link or a Google test user) and give those details in "App access".
