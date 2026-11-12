// Runs scripts/setup-supabase.mjs against a mock Supabase Management API backed
// by a real PostgreSQL (PGlite), twice, to prove a re-run applies nothing and
// leaves .env.local alone.
//
//   npm run db:setup-check
//
import { PGlite } from '@electric-sql/pglite'
import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bootstrap } from './supabase_stubs.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const script = resolve(root, 'scripts/setup-supabase.mjs')
const envFile = resolve(root, '.env.local')
const backup = resolve(root, '.env.local.idempotency-backup')
const REF = 'testprojectref123456'
const KEY = 'sb_publishable_idempotency_test'

let failures = 0
const pass = (label, detail = '') => console.log(`  ok   ${label}${detail ? ' — ' + detail : ''}`)
const fail = (label, detail = '') => {
  failures++
  console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`)
}
const check = (label, condition, detail = '') => (condition ? pass(label, detail) : fail(label, detail))

const db = new PGlite()
await db.waitReady
await db.exec(bootstrap)

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1')
  const send = (status, body) => {
    response.writeHead(status, { 'content-type': 'application/json' })
    response.end(JSON.stringify(body))
  }
  if (request.method === 'GET' && url.pathname.endsWith('/api-keys')) {
    return send(200, [{ name: 'anon', type: 'publishable', api_key: KEY }])
  }
  if (request.method === 'POST' && url.pathname.endsWith('/database/query')) {
    let raw = ''
    for await (const chunk of request) raw += chunk
    try {
      const { query } = JSON.parse(raw)
      const results = await db.exec(query)
      const last = Array.isArray(results) ? results[results.length - 1] : results
      return send(200, { rows: last?.rows || [] })
    } catch (error) {
      return send(400, { message: error.message })
    }
  }
  return send(404, { message: 'not found' })
})

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
const base = 'http://127.0.0.1:' + port + '/v1'
const migrations = readdirSync(resolve(root, 'supabase/migrations')).filter(name => name.endsWith('.sql')).length

// Async on purpose: the mock API runs in this process, so the event loop has to
// stay free to answer the child while it waits.
const run = (...args) => new Promise(resolveRun => {
  const child = spawn(process.execPath, [script, ...args], {
    cwd: root,
    env: { ...process.env, SUPABASE_API_URL: base, SUPABASE_ACCESS_TOKEN: 'test-token-0000000000', SUPABASE_PROJECT_REF: REF },
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', chunk => { stdout += chunk })
  child.stderr.on('data', chunk => { stderr += chunk })
  child.on('close', status => resolveRun({ status, stdout, stderr }))
})

const envBeforeTest = existsSync(envFile)
if (envBeforeTest) copyFileSync(envFile, backup)
if (existsSync(envFile)) rmSync(envFile)

try {
  console.log('Setup idempotency (' + migrations + ' migrations, mock API on port ' + port + ')\n')

  console.log('1. First run on an empty project')
  const first = await run()
  check('exits successfully', first.status === 0, first.status === 0 ? '' : first.stderr.trim().split('\n').pop())
  check('applies every migration', first.stdout.includes('Applying ' + migrations + ' migration(s)'), (first.stdout.match(/Applying .* migration\(s\)/) || [''])[0])
  check('writes .env.local', existsSync(envFile))
  const envAfterFirst = existsSync(envFile) ? readFileSync(envFile, 'utf8') : ''
  check('writes the project URL', envAfterFirst.includes('VITE_SUPABASE_URL=https://' + REF + '.supabase.co'))
  check('writes the publishable key', envAfterFirst.includes('VITE_SUPABASE_ANON_KEY=' + KEY))
  check('never prints the key', !first.stdout.includes(KEY) && !first.stderr.includes(KEY))

  const ledger = await db.query('select count(*)::int as n from public.pasu_setup_migrations')
  check('records every migration in the ledger', Number(ledger.rows[0].n) === migrations, ledger.rows[0].n + ' rows')
  const before = await db.query("select count(*)::int as n from information_schema.tables where table_schema = 'public'")

  console.log('\n2. Second run on the project that already has the schema')
  const second = await run()
  check('exits successfully', second.status === 0, second.status === 0 ? '' : second.stderr.trim().split('\n').pop())
  check('applies nothing', second.stdout.includes('Nothing to apply'), 'no re-run of existing SQL')
  check('does not print an apply step', !/Applying \d+ migration/.test(second.stdout))
  check('still verifies the schema', second.stdout.includes('tables:'), (second.stdout.match(/tables: [^\n]+/) || [''])[0])
  check('.env.local is unchanged', existsSync(envFile) && readFileSync(envFile, 'utf8') === envAfterFirst)
  const after = await db.query("select count(*)::int as n from information_schema.tables where table_schema = 'public'")
  check('the schema is unchanged', Number(after.rows[0].n) === Number(before.rows[0].n), before.rows[0].n + ' tables')

  console.log('\n3. Dry run')
  const dry = await run('--dry-run')
  check('reports nothing pending', dry.status === 0 && /nothing to apply/i.test(dry.stdout))
} finally {
  await new Promise(resolve => server.close(resolve))
  await db.close()
  if (existsSync(backup)) {
    copyFileSync(backup, envFile)
    rmSync(backup)
  } else if (existsSync(envFile)) {
    rmSync(envFile)
  }
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
