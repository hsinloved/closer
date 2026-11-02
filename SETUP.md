# Setting up Closer (two-player version)

About 20 minutes, once. You need the Supabase project ("closer") and a Vercel account.

## 1. Database (Supabase)

1. Supabase → your **closer** project → **SQL Editor** → New query. Paste all of
   `supabase/migrations/0001_closer.sql` and **Run**. It creates the tables and the privacy rules.
2. **Authentication → Sign In / Providers → Email**: leave Email on. Turn **Confirm email** on.
3. **Authentication → Emails → Magic Link** template: make sure the body shows the code, for example

   ```html
   <h2>Your Closer code</h2>
   <p>Type this into Closer: <strong>{{ .Token }}</strong></p>
   ```

   The app asks for this six-digit code instead of a link, because a link would open Safari rather than the
   home-screen app. Do the same for the **Confirm signup** template (first sign-in uses that one).
4. **Project Settings → API**: you'll need the **Project URL**, the **anon public** key and the
   **service_role** key for step 3. The service_role key is a master key: only ever put it in Vercel.
5. Once you've both signed in and paired, you can turn off **Allow new users to sign up** (Authentication →
   Sign In / Providers) so no one else can create an account.

## 2. Notification keys

On any computer with Node: `npx web-push generate-vapid-keys`. Keep the two keys for step 3.
(Or ask Claude to generate them into a file for you; don't paste them into a chat.)

## 3. Hosting (Vercel)

1. Vercel → **Add New → Project** → import `hsinloved/closer`. Framework: Vite (detected).
2. **Environment Variables** (or sync them from Infisical):

   | Name | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | Project URL |
   | `VITE_SUPABASE_ANON_KEY` | anon public key |
   | `VITE_VAPID_PUBLIC_KEY` | VAPID public key |
   | `SUPABASE_URL` | Project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
   | `VAPID_PUBLIC_KEY` | VAPID public key |
   | `VAPID_PRIVATE_KEY` | VAPID private key |
   | `VAPID_SUBJECT` | `mailto:` + your email |
   | `CRON_SECRET` | any long random string |

3. **Deploy**. Note the address, e.g. `https://closer-xyz.vercel.app`.
4. Supabase → **Authentication → URL Configuration**: set **Site URL** to that address.

## 4. The daily card

GitHub → the repo → **Settings → Secrets and variables → Actions** → add `CLOSER_URL` (the Vercel address)
and `CRON_SECRET` (the same value as in Vercel). The **Daily card** workflow then runs hourly and deals the
card once your chosen time has passed. Whoever opens the app first after that time also deals it, so it
works even if the job is late.

## 5. On your iPhones

1. Open the Vercel address in **Safari** → Share → **Add to Home Screen**. Open Closer from the home screen.
2. Sign in with your email and the code. The first of you taps **I'm first** and reads out the invite code;
   the second taps **I have a code**.
3. **Settings → Turn on notifications**. A test notification should arrive.

## 6. Retire the old site

Once the Vercel address works, turn off GitHub Pages (repo → Settings → Pages → Source: None). Pages can't run
the new app; the in-person game lives on at `/together.html`.

## Checking the privacy rules

`test/run-rls.sh` runs the row-level security checks against any Postgres (see the script). They cover:
your partner's answer stays unreadable until you've answered, nobody can answer or draw as the other person,
strangers see nothing, answers lock after the reveal.
