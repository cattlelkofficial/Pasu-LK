# Pasu — Sri Lankan livestock marketplace

Pasu is a React + Vite marketplace for connecting Sri Lankan dairy farmers and buyers directly. It includes a public marketplace, one shared buy-and-sell workspace, owner approval tools, password authentication, enquiry and transaction views, and a curated preview catalog for local development.

## Run locally

```bash
npm install
copy .env.example .env.local
npm run dev
```

Without credentials, the application uses the preview catalog and a local account fallback so all flows can be explored. With Supabase configured, the public marketplace reads approved listings from PostgreSQL and email/password or phone/password authentication is handled by Supabase Auth. Do not treat the preview catalog as production inventory.

## Supabase setup

1. Create a Supabase project.
2. Copy the project URL and publishable anon key into `.env.local`.
3. Run `supabase/migrations/202511090001_initial_schema.sql` in the Supabase SQL editor or with the Supabase CLI.
4. Enable Email and Phone providers in Authentication → Providers. Registration creates the account and returns the user to the login page; returning users sign in with email/password or verified phone/password. Enable email confirmation if you want users to verify their email before the first login. Every registered account can both buy and sell; administrator accounts must be assigned securely by an owner.
5. Apply `202511090003_unified_user_accounts.sql` after the earlier migrations. It normalizes ordinary accounts to the `user` role, stores registration profile fields, and enforces profile completion before listing creation through RLS.
6. Apply `202611090001_realtime_messaging.sql`. Enable Realtime for `messages`, `user_presence`, and `message_read_receipts`, and deploy `supabase/functions/process-unanswered-messages`. Set `AI_MODEL_URL` and `AI_MODEL_API_KEY` as Edge Function secrets; never put the key in Vite environment variables.
7. Apply `202611090002_admin_management.sql` to add administrator audit logs, user reports, seller verification requests, suspension controls, and secure administrator RPCs. Apply `202611090003_customer_admin_roles.sql` to remove the legacy field-agent role and normalize those accounts to customers. Provision the first administrator manually by trusted SQL; there is no public admin registration flow.

## In-app messaging and AI replies

Approved listings open a private conversation inside the dashboard. Messages, image attachments, read receipts, typing indicators, presence, block/report actions, and unread notifications are protected by participant-only RLS policies.

Schedule the `process-unanswered-messages` Edge Function from a trusted server-side scheduler (for example, Supabase Cron invoking the function every minute). The function checks each recipient's configured timeout, availability, and AI settings before it writes an idempotent, clearly labelled AI message. Configure `ai_assistant_enabled` and `ai_auto_reply_enabled` from the dashboard; human takeover disables both settings.
5. Create a public `cattle-images` storage bucket, then add storage policies matching the listing ownership policies in the migration.

The migration enables RLS on every protected table, creates the profile-on-signup trigger, prevents users from changing their role, and only exposes approved listings publicly. The service-role key must never be placed in frontend environment variables.

## Checks

```bash
npm run build
npm run lint
```

## Deploy

Build with `npm run build` and deploy the `dist` directory to Vercel. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as Vercel environment variables. Configure the Supabase Auth redirect URL to the deployed domain.
