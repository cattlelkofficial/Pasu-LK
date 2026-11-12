// Applies supabase/APPLY_ALL.sql to a Supabase project from a personal access
// token, then writes VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.
//
//   npm run supabase:setup
//   npm run supabase:setup -- --dry-run
//
// Token: put it in .supabase-token (gitignored) or set SUPABASE_ACCESS_TOKEN.
//         Create one at https://supabase.com/dashboard/account/tokens
// Project ref: SUPABASE_PROJECT_REF, a .supabase-project file, or the project URL
//         already in .env.local. Falls back to the known project below.
//
// Secrets are never printed: the token and key stay in variables only.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_REF = 'rbjzbvzgpolmdmdpjgki'
const DRY = process.argv.includes('--dry-run')
const API = 'https://api.supabase.com/v1'
const TOKEN_FILE = resolve(root, '.supabase-token')
const ENV_FILE = resolve(root, '.env.local')
const SQL_FILE = resolve(root, 'supabase/APPLY_ALL.sql')

const firstLine = (path) => {
  if (!existsSync(path)) return ''
  return readFileSync(path, 'utf8').split(/\r?\n/).map(line => line.trim()).find(line => line && !line.startsWith('#')) || ''
}

const readEnvValue = (name) => {
  if (!existsSync(ENV_FILE)) return ''
  return (readFileSync(ENV_FILE, 'utf8').match(new RegExp('^' + name + '=(.+)$', 'm'))?.[1] || '').trim()
}

async function call(path, token, init = {}) {
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
  const sql = readFileSync(SQL_FILE, 'utf8')

  console.log('Pasu · Supabase setup')
  console.log('  project   ' + ref)
  console.log('  sql       ' + (sql.length / 1024).toFixed(1) + ' KB from supabase/APPLY_ALL.sql')
  console.log('  token     ' + (token ? 'found (' + token.length + ' characters)' : 'MISSING'))

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
  if (DRY) {
    console.log('\nDry run: would POST the SQL to ' + API + '/projects/' + ref + '/database/query,')
    console.log('then fetch the publishable key and write ' + ENV_FILE + '. Nothing was sent.')
    return
  }

  try {
    console.log('\n1. Applying the schema')
    await call('/projects/' + ref + '/database/query', token, { method: 'POST', body: JSON.stringify({ query: sql }) })
    console.log('   applied')

    console.log('\n2. Verifying what exists')
    const probe = "select (select count(*) from information_schema.tables where table_schema = 'public') as tables, " +
      "(select count(*) from pg_policies where schemaname = 'public') as policies, " +
      "(select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'seller_contact') as seller_contact, " +
      "(select count(*) from storage.buckets where id = 'cattle-images') as bucket"
    const result = await call('/projects/' + ref + '/database/query', token, { method: 'POST', body: JSON.stringify({ query: probe }) })
    const row = Array.isArray(result) ? result[0] : result
    console.log('   tables: ' + (row?.tables ?? '?') + ' · policies: ' + (row?.policies ?? '?') + ' · seller_contact: ' + (row?.seller_contact ?? '?') + ' · cattle-images bucket: ' + (row?.bucket ?? '?'))

    console.log('\n3. Writing .env.local')
    let payload
    try {
      payload = await call('/projects/' + ref + '/api-keys', token)
    } catch {
      payload = await call('/projects/' + ref + '/apikeys', token)
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

await main()
