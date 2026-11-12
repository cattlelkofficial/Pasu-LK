// Applies the migrations to a Supabase project from a personal access token,
// then writes VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.
//
//   npm run supabase:setup
//   npm run supabase:setup -- --dry-run
//   npm run supabase:setup -- --adopt
//
// It is safe to run repeatedly: applied files are recorded in
// public.pasu_setup_migrations, so a second run only reports the state and
// refreshes .env.local. New migration files are picked up on the next run.
//
// Token: put it in .supabase-token (gitignored) or set SUPABASE_ACCESS_TOKEN.
//         Create one at https://supabase.com/dashboard/account/tokens
// Project ref: SUPABASE_PROJECT_REF, a .supabase-project file, or the project URL
//         already in .env.local. Falls back to the known project below.
//
// If the schema was applied by pasting APPLY_ALL.sql into the SQL editor there is
// no ledger; a complete schema is recorded automatically, a partial one stops the
// run so nothing is applied twice. --adopt forces the recording.
//
// Secrets are never printed: the token and key stay in variables only.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_REF = 'rbjzbvzgpolmdmdpjgki'
const DRY = process.argv.includes('--dry-run')
const ADOPT = process.argv.includes('--adopt')
const API = (process.env.SUPABASE_API_URL || 'https://api.supabase.com/v1').replace(/\/+$/, '')
const TOKEN_FILE = resolve(root, '.supabase-token')
const ENV_FILE = resolve(root, '.env.local')
const MIGRATION_DIR = resolve(root, 'supabase/migrations')
const LEDGER = 'public.pasu_setup_migrations'

const firstLine = (path) => {
  if (!existsSync(path)) return ''
  return readFileSync(path, 'utf8').split(/\r?\n/).map(line => line.trim()).find(line => line && !line.startsWith('#')) || ''
}

const readEnvValue = (name) => {
  if (!existsSync(ENV_FILE)) return ''
  return (readFileSync(ENV_FILE, 'utf8').match(new RegExp('^' + name + '=(.+)$', 'm'))?.[1] || '').trim()
}

async function call(token, path, init = {}) {
  const response = await fetch(API + path, {
    ...init,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  const text = await response.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  if (!response.ok) {
    const detail = body && typeof body === 'object' ? (body.message || body.error || JSON.stringify(body)) : String(body)
    throw new Error(path + ' → ' + response.status + ' ' + detail)
  }
  return body
}

const upsertEnv = (values) => {
  const lines = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8').split(/\r?\n/) : []
  const keys = new Set(Object.keys(values))
  const kept = lines.filter(line => {
    const name = line.match(/^([A-Z0-9_]+)=/)?.[1]
    return !(name && keys.has(name))
  })
  while (kept.length && kept[kept.length - 1] === '') kept.pop()
  writeFileSync(ENV_FILE, [...kept, ...Object.entries(values).map(([key, value]) => key + '=' + value), ''].join('\n'))
}

async function main() {
  const token = (process.env.SUPABASE_ACCESS_TOKEN || firstLine(TOKEN_FILE)).trim()
  const envUrl = readEnvValue('VITE_SUPABASE_URL')
  const ref = (process.env.SUPABASE_PROJECT_REF || firstLine(resolve(root, '.supabase-project')) || envUrl.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] || DEFAULT_REF).trim()
  const files = readdirSync(MIGRATION_DIR).filter(name => name.endsWith('.sql')).sort()

  console.log('Pasu · Supabase setup')
  console.log('  project    ' + ref)
  console.log('  migrations ' + files.length + ' files')
  console.log('  token      ' + (token ? 'found (' + token.length + ' characters)' : 'MISSING'))

  if (!token) {
    console.error('\nNo access token. Create one at https://supabase.com/dashboard/account/tokens')
    console.error('and save it as ' + TOKEN_FILE + ' (one line, nothing else).')
    process.exitCode = 1
    return
  }
  if (!/^[a-z0-9]{16,}$/.test(ref)) {
    console.error('\nCould not work out the project ref. Set SUPABASE_PROJECT_REF or add .env.local.')
    process.exitCode = 1
    return
  }

  try {
    const query = async (sql) => call(token, '/projects/' + ref + '/database/query', { method: 'POST', body: JSON.stringify({ query: sql }) })
    const rows = (result) => (Array.isArray(result) ? result : (result?.rows || []))

    await query('create table if not exists ' + LEDGER + ' (migration text primary key, applied_at timestamptz not null default now());\n' +
      'alter table ' + LEDGER + ' enable row level security;\n' +
      'revoke all on table ' + LEDGER + ' from anon, authenticated;')

    const applied = new Set(rows(await query('select migration from ' + LEDGER)).map(row => row.migration))
    // The ledger table always exists by now, so the "has a schema" test looks for
    // a real domain table (profiles) rather than any table in public.
    const state = rows(await query("select (select count(*) from information_schema.tables where table_schema = 'public') as tables, " +
      "(select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'profiles') as profiles, " +
      "(select count(*) from pg_policies where schemaname = 'public') as policies, " +
      "(select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'admin_review_verification') as review_fn, " +
      "(select count(*) from storage.buckets where id = 'cattle-images') as bucket"))[0] || {}
    const existingSchema = Number(state.profiles || 0) > 0
    const completeSchema = existingSchema && Number(state.tables || 0) >= 18 && Number(state.policies || 0) >= 40 && Number(state.review_fn || 0) === 1 && Number(state.bucket || 0) === 1

    if (!applied.size && existingSchema) {
      if (ADOPT || completeSchema) {
        for (const file of files) await query("insert into " + LEDGER + ' (migration) values (' + quote(file) + ') on conflict (migration) do nothing')
        files.forEach(file => applied.add(file))
        console.log('\nRecorded ' + files.length + ' existing migrations in ' + LEDGER + (ADOPT ? ' (--adopt)' : ' (schema already complete)') + '.')
      } else {
        console.error('\nThis project already has part of the schema but no setup ledger.')
        console.error('Apply supabase/APPLY_ALL.sql in the SQL editor once, or re-run with --adopt to record what is there.')
        process.exitCode = 1
        return
      }
    }

    const pending = files.filter(file => !applied.has(file))
    if (DRY) {
      console.log('\nDry run: ' + (pending.length ? pending.length + ' migrations would be applied: ' + pending.join(', ') : 'nothing to apply, schema is up to date'))
      console.log('then the publishable key would be written to ' + ENV_FILE + '. Nothing was sent.')
      return
    }

    if (pending.length) {
      console.log('\n1. Applying ' + pending.length + ' migration(s)')
      for (const file of pending) {
        process.stdout.write('   ' + file + ' … ')
        await query(readFileSync(join(MIGRATION_DIR, file), 'utf8'))
        await query("insert into " + LEDGER + ' (migration) values (' + quote(file) + ') on conflict (migration) do nothing')
        console.log('applied')
      }
    } else {
      console.log('\n1. Nothing to apply — all ' + files.length + ' migrations are already recorded')
    }

    console.log('\n2. Verifying what exists')
    const check = rows(await query("select (select count(*) from information_schema.tables where table_schema = 'public') as tables, " +
      "(select count(*) from pg_policies where schemaname = 'public') as policies, " +
      "(select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'seller_contact') as seller_contact, " +
      "(select count(*) from storage.buckets where id = 'cattle-images') as bucket"))[0] || {}
    console.log('   tables: ' + (check.tables ?? '?') + ' · policies: ' + (check.policies ?? '?') + ' · seller_contact: ' + (check.seller_contact ?? '?') + ' · cattle-images bucket: ' + (check.bucket ?? '?'))

    console.log('\n3. Writing .env.local')
    let payload
    try {
      payload = await call(token, '/projects/' + ref + '/api-keys')
    } catch {
      payload = await call(token, '/projects/' + ref + '/apikeys')
    }
    const list = Array.isArray(payload) ? payload : (payload?.keys || [])
    const pick = list.find(entry => entry.type === 'publishable')
      || list.find(entry => entry.name === 'anon' || entry.name === 'publishable')
      || list.find(entry => typeof (entry.api_key || entry.value) === 'string' && !/secret|service_role/i.test(entry.name || ''))
    const anonKey = pick?.api_key || pick?.value
    if (!anonKey) throw new Error('Could not find a publishable key in the project response.')

    upsertEnv({ VITE_SUPABASE_URL: 'https://' + ref + '.supabase.co', VITE_SUPABASE_ANON_KEY: anonKey })
    console.log('   wrote ' + ENV_FILE + ' (publishable key stored, never printed)')

    console.log('\nDone. Restart the dev server so Vite picks up the new values.')
    console.log('Next: promote your administrator with supabase/scripts/promote_first_admin.sql')
  } catch (error) {
    console.error('\nSetup failed: ' + error.message)
    process.exitCode = 1
  }
}

function quote(value) {
  return "'" + String(value).replace(/'/g, "''") + "'"
}

await main()
