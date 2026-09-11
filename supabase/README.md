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
