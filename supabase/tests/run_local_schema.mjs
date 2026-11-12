// Applies supabase/APPLY_ALL.sql to a real PostgreSQL running locally in WASM
// (PGlite), then checks the schema and exercises the seller-contact privacy rule.
//
// Supabase supplies the auth and storage schemas, the anon/authenticated roles
// and the supabase_realtime publication. This script creates stand-ins for those
// so the migration chain can be executed end to end without a project.
//
//   npm run db:check
//
import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'

const SELLER = '11111111-1111-1111-1111-111111111111'
const STRANGER = '33333333-3333-3333-3333-333333333333'
const ADMIN = '44444444-4444-4444-4444-444444444444'
const LISTING = '22222222-2222-2222-2222-222222222222'

const bootstrap = `
create role anon noinherit;
create role authenticated noinherit;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  phone text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  created_at timestamptz not null default now()
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid,
  created_at timestamptz not null default now()
);
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1]
$$;

create publication supabase_realtime;
`

const schema = readFileSync(new URL('../APPLY_ALL.sql', import.meta.url), 'utf8')

let failures = 0
const pass = (label, detail = '') => console.log(`  ok   ${label}${detail ? ' — ' + detail : ''}`)
const fail = (label, detail = '') => {
  failures++
  console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`)
}
const check = (label, condition, detail = '') => (condition ? pass(label, detail) : fail(label, detail))

const one = async (sql, params) => {
  const result = await db.query(sql, params)
  return result.rows[0]
}
const count = async (sql, params) => Number((await one(sql, params)).count)

const db = new PGlite()
await db.waitReady
console.log('PostgreSQL', (await one('show server_version')).server_version, 'via PGlite\n')

console.log('1. Supabase stand-ins')
await db.exec(bootstrap)
pass('auth + storage schemas, anon/authenticated roles, supabase_realtime publication')

// pgcrypto is not bundled with PGlite; it ships with Supabase. gen_random_uuid()
// is core in PostgreSQL 13+, so nothing in the schema actually depends on it.
const pgcryptoStubbed = Number((await one("select count(*) from pg_available_extensions where name = 'pgcrypto'")).count) === 0
const strip = text => pgcryptoStubbed
  ? text.replace(/create extension if not exists "pgcrypto";/i, '-- pgcrypto omitted: core gen_random_uuid() is used')
  : text

console.log('\n2. Applying migrations in order')
const migrationDir = new URL('../migrations/', import.meta.url)
const migrationFiles = readdirSync(migrationDir).filter(name => name.endsWith('.sql')).sort()
for (const file of migrationFiles) {
  try {
    await db.exec(strip(readFileSync(new URL(file, migrationDir), 'utf8')))
    pass(file)
  } catch (error) {
    fail(file, error.message)
  }
}

console.log('\n2b. The same schema as one pasted file')
const bundle = new PGlite()
await bundle.waitReady
try {
  await bundle.exec(bootstrap)
  await bundle.exec(strip(schema))
  pass('supabase/APPLY_ALL.sql applies in a single run')
} catch (error) {
  fail('supabase/APPLY_ALL.sql as one file', error.message)
}
await bundle.close()

console.log('\n3. Objects created')
const tables = await count(`select count(*) from information_schema.tables where table_schema = 'public'`)
check('public tables', tables >= 18, `${tables} tables`)
const policies = await count(`select count(*) from pg_policies where schemaname in ('public', 'storage')`)
check('row level security policies', policies >= 40, `${policies} policies`)
const rlsTables = await count(`select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relrowsecurity`)
check('tables with RLS enabled', rlsTables >= 12, `${rlsTables} tables`)
const expected = ['cow_listings', 'cow_images', 'profiles', 'favourites', 'enquiries', 'transactions', 'conversations', 'messages', 'user_presence', 'message_read_receipts', 'admin_audit_logs', 'user_reports', 'seller_verification_requests', 'platform_announcements']
const present = (await db.query(`select table_name from information_schema.tables where table_schema = 'public'`)).rows.map(row => row.table_name)
const missing = expected.filter(name => !present.includes(name))
check('expected tables present', missing.length === 0, missing.length ? 'missing: ' + missing.join(', ') : `${expected.length} checked`)
const bucket = await one(`select id, public from storage.buckets where id = 'cattle-images'`)
check('cattle-images bucket', Boolean(bucket), bucket ? `public=${bucket.public}` : 'not created')
const storagePolicies = await count(`select count(*) from pg_policies where schemaname = 'storage'`)
check('storage policies', storagePolicies >= 4, `${storagePolicies} policies`)
const rpc = await one(`select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'seller_contact'`)
check('seller_contact function', Boolean(rpc))
const fns = (await db.query(`select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`)).rows.map(row => row.proname)
const adminFns = ['admin_guard', 'admin_review_listing', 'admin_set_user_suspension', 'admin_update_report', 'create_conversation', 'profile_is_complete']
const missingFns = adminFns.filter(name => !fns.includes(name))
check('admin and messaging functions', missingFns.length === 0, missingFns.length ? 'missing: ' + missingFns.join(', ') : `${adminFns.length} checked`)

console.log('\n4. Sign-up trigger')
await db.exec(`insert into auth.users (id, email) values ('${SELLER}', 'seller@example.com'), ('${STRANGER}', 'stranger@example.com'), ('${ADMIN}', 'admin@example.com')`)
const profiles = await count('select count(*) from public.profiles')
check('trigger creates a profile per new user', profiles === 3, `${profiles} profiles`)

await db.exec(`
  update public.profiles set full_name = 'Nimal Perera', phone_number = '+94 77 123 4567', email = 'seller@example.com', district = 'Kandy', city = 'Peradeniya' where id = '${SELLER}';
  update public.profiles set full_name = 'Sunil Silva', phone_number = '+94 71 000 0000', email = 'stranger@example.com', district = 'Galle', city = 'Hikkaduwa' where id = '${STRANGER}';
  update public.profiles set full_name = 'Pasu Owner', phone_number = '+94 11 000 0000', email = 'admin@example.com', district = 'Colombo', city = 'Colombo 07', role = 'admin' where id = '${ADMIN}';
  insert into public.cow_listings (id, seller_id, title, breed, gender, asking_price_lkr, daily_yield_liters, district, city, listing_status)
  values ('${LISTING}', '${SELLER}', 'Nanda', 'Jersey Cross', 'Female', 385000, 15, 'Kandy', 'Peradeniya', 'approved');
`)

console.log('\n5. Seller phone privacy')
const asUser = async id => {
  await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$ select '${id}'::uuid $$`)
  return (await db.query(`select * from public.seller_contact('${LISTING}')`)).rows
}
const owner = await asUser(SELLER)
check('the listing owner sees the phone', owner.length === 1, owner[0]?.phone_number || 'no row')
const stranger = await asUser(STRANGER)
check('another signed-in user sees nothing', stranger.length === 0, stranger.length ? 'LEAK: ' + JSON.stringify(stranger) : 'no row')
const admin = await asUser(ADMIN)
check('an administrator sees the phone', admin.length === 1, admin[0]?.phone_number || 'no row')
const anonymous = await asUser('00000000-0000-0000-0000-000000000000')
check('a visitor with no session sees nothing', anonymous.length === 0, anonymous.length ? 'LEAK' : 'no row')

console.log('\n6. Public catalogue columns')
await db.exec(`insert into public.cow_images (cow_listing_id, image_url, is_primary, display_order) values ('${LISTING}', 'https://example.com/cow.jpg', true, 0)`)
const catalogue = await one(`
  select json_build_object(
    'seller', (select json_agg(x) from (select full_name, is_verified from public.profiles p where p.id = l.seller_id) x),
    'hasPhoneColumn', (select count(*) from information_schema.columns where table_name = 'cow_listings' and column_name = 'phone_number')
  ) as payload
  from public.cow_listings l where l.id = '${LISTING}'
`)
check('approved listing is readable', Boolean(catalogue))
check('cow_listings has no phone column', Number(catalogue.payload.hasPhoneColumn) === 0)

console.log('\n7. Clearing the first-admin path')
await db.exec(`
  update public.profiles set role = 'admin' where lower(email) = lower('admin@example.com');
  update public.profiles set role = 'user' where lower(email) = lower('seller@example.com');
`)
const admins = await count(`select count(*) from public.profiles where role = 'admin'`)
check('promotion statement yields exactly one admin', admins === 1, `${admins} admins`)

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failure(s)`)
if (pgcryptoStubbed) console.log('note: pgcrypto was skipped locally; Supabase enables it, and gen_random_uuid() is core on PostgreSQL 13+')
await db.close()
process.exit(failures === 0 ? 0 : 1)
