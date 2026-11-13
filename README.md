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
3. Apply every file in `supabase/migrations/` in filename order, either with `supabase db push` after `supabase link` or by pasting them into the Supabase SQL editor one at a time. `202611100001_storage_bucket.sql` creates the public `cattle-images` bucket and its owner-scoped upload policies.
4. Enable Email and Phone providers in Authentication → Providers. Registration creates the account and returns the user to the login page; returning users sign in with email/password or verified phone/password. Enable email confirmation if you want users to verify their email before the first login. Every registered account can both buy and sell; administrator accounts must be assigned securely by an owner.
5. Apply `202511090003_unified_user_accounts.sql` after the earlier migrations. It normalizes ordinary accounts to the `user` role, stores registration profile fields, and enforces profile completion before listing creation through RLS.
6. Apply `202611090001_realtime_messaging.sql`. Enable Realtime for `messages`, `user_presence`, and `message_read_receipts`, and deploy `supabase/functions/process-unanswered-messages`. Set `AI_MODEL_URL` and `AI_MODEL_API_KEY` as Edge Function secrets; never put the key in Vite environment variables.
7. Apply `202611090002_admin_management.sql` to add administrator audit logs, user reports, seller verification requests, suspension controls, and secure administrator RPCs. Apply `202611090003_customer_admin_roles.sql` to remove the legacy field-agent role and normalize those accounts to customers. There is no public admin registration flow: the first administrator is promoted by trusted SQL. Let the account register normally, set its email in `supabase/scripts/promote_first_admin.sql`, run that script in the SQL editor, and confirm with `select id, email, role from public.profiles where role = 'admin';`. Admins verify sellers from the Users table in the owner dashboard, or by calling `admin_set_seller_verification(user, true)`; approving a row in `seller_verification_requests` through `admin_review_verification()` sets the flag too. `profiles.is_verified` is what shows the "Verified seller" badge on a seller's listings, and nothing else writes to it.

## In-app messaging and AI replies

Approved listings open a private conversation inside the dashboard. Messages, image attachments, read receipts, typing indicators, presence, block/report actions, and unread notifications are protected by participant-only RLS policies.

Schedule the `process-unanswered-messages` Edge Function from a trusted server-side scheduler (for example, Supabase Cron invoking the function every minute). The function checks each recipient's configured timeout, availability, and AI settings before it writes an idempotent, clearly labelled AI message. Configure `ai_assistant_enabled` and `ai_auto_reply_enabled` from the dashboard; human takeover disables both settings.

The migration enables RLS on every protected table, creates the profile-on-signup trigger, prevents users from changing their role, and only exposes approved listings publicly. Seller phone numbers never reach the public catalogue: the listing query reads only the seller's name and verification flag, and numbers come from `public.seller_contact()`, which answers for the listing's owner or an administrator and returns nothing for everyone else. The service-role key must never be placed in frontend environment variables.

## Checks

```bash
npm run build
npm run lint
```

## Deploy

Build with `npm run build` and deploy the `dist` directory to Vercel. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as Vercel environment variables. Configure the Supabase Auth redirect URL to the deployed domain.

## Preview photos

The preview catalogue uses freely licensed photographs from Wikimedia Commons, resized for the web. They illustrate the sample listings and are not photos of the animals described.

| File | Photographer | Licence | Source |
| --- | --- | --- | --- |
| `public/cattle/jersey-barn.jpg` | Jennifer Dickert from Dover, NH, USA | CC BY 2.0 | https://commons.wikimedia.org/wiki/File%3ACute_Jersey%20Cow.jpg |
| `public/cattle/jersey-close.jpg` | ITookSomePhotos | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File%3AFriendly_Jersey%20cow%2C%20near%20Brighstone%2C%20Isle%20of%20Wight%2C%20England.jpg |
| `public/cattle/jersey-herd.jpg` | BartLaridon | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File%3AA_group%20of%20Jersey%20cows.JPG |
| `public/cattle/jersey-profile.jpg` | Missvain | CC BY 4.0 | https://commons.wikimedia.org/wiki/File%3A2024_Sonoma-Marin%20Fair%20-%20Sarah%20Stierch%2009.jpg |
| `public/cattle/ayrshire-profile.jpg` | Sergei S. Scurfield | CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File%3AAyrshire_cattle.JPG |
| `public/cattle/friesian-field.jpg` | Jeff the quiet | CC0 | https://commons.wikimedia.org/wiki/File%3AHixon_Wisconsin%20cows.jpg |
| `public/cattle/local-brown.jpg` | Ebaran | CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File%3ADomestic_cattle%20breed%20-%20Sri%20Lanka.jpg |
| `public/cattle/local-red.jpg` | Ushani Thennakoon | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File%3ASri_Lankan%20Cattle.jpg |
| `public/cattle/sahiwal-red.jpg` | Pavanaja | CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File%3ASahiwala_01.JPG |

## UI components

Interactive pieces come from [Lightswind](https://lightswind.com/components). The scroll area and skeleton loaders sit in `src/components/lightswind/` next to the existing badge, button and card, and the `@/` alias resolves to `src/` for them. Add more with `npx lightswind add <component>`. The library's full stylesheet is deliberately not imported — it resets body colours and ships ~18 kB of rules the site never uses — so `src/App.css` defines the palette-driven scrollbar and skeleton styles those components need.

## One-command setup

With a personal access token saved in `.supabase-token` (gitignored, one line):

```bash
npm run supabase:setup
```

It applies only the migrations that are still pending — applied files are recorded in `public.pasu_setup_migrations`, so running it again on a finished project applies nothing and just re-checks and refreshes `.env.local`. If the schema was created by pasting `APPLY_ALL.sql`, a complete schema is adopted automatically; a partial one stops the run so nothing is applied twice (`--adopt` records it anyway). It then verifies the tables, policies and storage bucket, and writes `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` into `.env.local`. Neither the token nor the key is ever printed. Use `npm run supabase:setup -- --dry-run` to see the resolved project and SQL size without sending anything. The project ref comes from `SUPABASE_PROJECT_REF`, a `.supabase-project` file, or the URL already in `.env.local`.

## Seller verification

Sellers ask for verification from **Get verified** in their dashboard, which submits a `seller_verification_requests` row with an optional note (a unique index allows one pending request per seller). Administrators answer in **Seller verification**, which calls `admin_review_verification()`; approving sets `profiles.is_verified` and with it the "Verified seller" badge on that seller's listings, and rejecting records a reason the seller sees before they can request again.

## Local database check

`supabase/APPLY_ALL.sql` can be verified offline before it is pasted into a project:

```bash
npm run db:check
```

The script applies every migration, in order and then again as the single combined file, to a real PostgreSQL running locally (PGlite) with stand-ins for the Supabase `auth` and `storage` schemas, the `anon`/`authenticated` roles and the `supabase_realtime` publication. It then asserts that the tables, RLS policies, storage bucket and functions exist, exercises the sign-up trigger, checks the first-admin promotion statement, proves that `seller_contact()` returns a phone number only to the listing's owner or an administrator, and switches role to prove that a seller can neither write nor read another seller's verification request. `npm run db:check` also runs the setup idempotency test, which drives `scripts/setup-supabase.mjs` twice against a mock Management API backed by the same database.

## Two dashboards

Customers use `/dashboard` for browsing, selling, saved listings, enquiries,
messages, transactions and their profile. Administrators use `/admin`, which is
gated in the client by the account role and enforced in the database by every RLS
policy through `public.admin_guard()`. A customer who requests `/admin` is
redirected to `/dashboard`; an administrator who opens `/dashboard` lands on
`/admin`. Password recovery lives at `/forgot-password` and `/reset-password`.

## Create the first administrator

Run the bootstrap once, from your own shell, with the service-role key exported
only for that command. The password is typed at the prompt and is never written
to a file, a log or this repository:

```bash
SUPABASE_SERVICE_ROLE_KEY=... node scripts/bootstrap-admin.mjs
```

It is idempotent: an existing `cattlelkofficial@gmail.com` account is reused and
its password updated rather than duplicated, the email is marked confirmed, the
`admin` role is granted through the profiles table, and the script prints the
verified role back. Never put the service-role key in `.env.local` or any
`VITE_` variable: Vite inlines those into the browser bundle.
