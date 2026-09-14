# Supabase setup notes

Schema lives in `migrations/`, applied through the Management API (`POST /v1/projects/<ref>/database/query`).

## Sign-in email

Supabase's built-in mailer is for development only: two emails an hour, and templates cannot be
customized, so it can only send a magic link. Fluttr signs in with a 6-digit code instead, which
works from any mail app without a browser hand-off. That needs custom SMTP:

1. Set the SMTP fields (`smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`, `smtp_admin_email`,
   `smtp_sender_name`) on `PATCH /v1/projects/<ref>/config/auth`, or in the dashboard under
   Authentication > SMTP Settings. Credentials never go in this repo.
2. Apply `auth-email.json` with the same PATCH: 6-digit codes, 10-minute expiry, 30 emails an hour,
   and templates whose subject and body carry the code (and the link as a fallback).

The app (`src/app/account.tsx`) asks for the code first; the link still works when tapped in Chrome.

## Push notifications

Notifications are rows in `public.notifications`, written by triggers on reactions, comments,
and friendships (`migrations/20260913200000_notifications.sql`). Each insert calls the `push`
Edge Function (`functions/push/index.ts`) through pg_net with a shared secret, and the function
sends to the recipient's devices through Firebase Cloud Messaging (FCM HTTP v1). The app shows
the same rows in its Activity screen, so the in-app list works even with push off.

Deploy and configure:

```
SUPABASE_ACCESS_TOKEN=<pat> npx supabase@2 functions deploy push --project-ref <ref> --no-verify-jwt
SUPABASE_ACCESS_TOKEN=<pat> npx supabase@2 secrets set --project-ref <ref> PUSH_SECRET=<same value as private.push_config 'secret'>
SUPABASE_ACCESS_TOKEN=<pat> npx supabase@2 secrets set --project-ref <ref> FCM_SERVICE_ACCOUNT="$(cat service-account.json | tr -d '\n')"
```

Firebase (one-time, in the Firebase console):

1. Create a project and add an Android app with package `com.fluttr.app`.
2. Download `google-services.json` into `app/` (gitignored) and set
   `"android": { "googleServicesFile": "./google-services.json" }` in `app.json`.
3. Project settings > Service accounts > Generate new private key, and store that JSON only as the
   `FCM_SERVICE_ACCOUNT` secret above.
4. iOS needs an APNs key from the Apple Developer Program uploaded to the Firebase project.

Rebuild the app after adding `google-services.json`; without it the app still runs and the
device simply never registers a push token.
