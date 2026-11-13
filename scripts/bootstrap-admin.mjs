#!/usr/bin/env node
// One-time administrator bootstrap for Pasu.
//
// Creates (or reuses) cattlelkofficial@gmail.com in Supabase Auth, marks the
// email confirmed, and grants the administrator role through the service-role
// key. The password is typed interactively and never appears in a command, a
// file, a log or source control.
//
// Usage (pick one):
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/bootstrap-admin.mjs
//   node scripts/bootstrap-admin.mjs            # reads the key from .env.local.bootstrap
//
// Required:
//   SUPABASE_URL               defaults to VITE_SUPABASE_URL read from .env.local
//   SUPABASE_SERVICE_ROLE_KEY  never committed; store it in your shell only
//   ADMIN_EMAIL                defaults to cattlelkofficial@gmail.com

import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'cattlelkofficial@gmail.com'

function readDotEnv(file) {
  const values = {}
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (match && !line.trim().startsWith('#')) values[match[1]] = match[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* file is optional */ }
  return values
}

const env = readDotEnv(path.join(process.cwd(), '.env.local'))
const supabaseUrl = process.env.SUPABASE_URL || env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) {
  console.error('Missing SUPABASE_URL (or VITE_SUPABASE_URL in .env.local).')
  process.exit(1)
}
if (!serviceKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY. Export it in your shell for this one command; never commit it.')
  process.exit(1)
}
if (!serviceKey.startsWith('sb_secret_') && serviceKey.split('.').length !== 3) {
  console.error('That does not look like a service-role key (expected a JWT or sb_secret_... value).')
  process.exit(1)
}

const adminHeaders = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
}

async function api(pathname, init = {}) {
  const response = await fetch(`${supabaseUrl}${pathname}`, { ...init, headers: { ...adminHeaders, ...(init.headers || {}) } })
  const text = await response.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { ok: response.ok, status: response.status, body }
}

function ask(question, { hidden = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  return new Promise((resolve) => {
    if (!hidden) {
      rl.question(question, (answer) => { rl.close(); resolve(answer.trim()) })
      return
    }
    process.stdout.write(question)
    const onData = () => {
      const line = rl.line
      readline.clearLine(process.stdout, 0)
      readline.cursorTo(process.stdout, 0)
      process.stdout.write(question + '*'.repeat(line.length))
    }
    process.stdin.on('data', onData)
    rl.question('', (answer) => {
      process.stdin.off('data', onData)
      process.stdout.write('\n')
      rl.close()
      resolve(answer)
    })
  })
}

async function findUserByEmail(email) {
  for (let page = 1; page <= 20; page += 1) {
    const result = await api(`/auth/v1/admin/users?page=${page}&per_page=100`)
    if (!result.ok) throw new Error(`Could not list auth users: ${result.status} ${JSON.stringify(result.body)}`)
    const users = result.body?.users || []
    const match = users.find((user) => (user.email || '').toLowerCase() === email.toLowerCase())
    if (match) return match
    if (users.length < 100) return null
  }
  return null
}

async function main() {
  console.log(`Pasu administrator bootstrap — ${ADMIN_EMAIL}`)
  const password = await ask('Administrator password (typed, not echoed, min 12 chars): ', { hidden: true })
  if (password.length < 12) {
    console.error('Refusing a password shorter than 12 characters.')
    process.exit(1)
  }

  let user = await findUserByEmail(ADMIN_EMAIL)
  if (user) {
    console.log(`Found existing account ${user.id} — reusing it instead of creating a duplicate.`)
    const updated = await api(`/auth/v1/admin/users/${user.id}`, {
      method: 'PUT',
      body: JSON.stringify({ password, email_confirm: true }),
    })
    if (!updated.ok) throw new Error(`Could not reset the existing account's password: ${updated.status} ${JSON.stringify(updated.body)}`)
    console.log('Existing account password updated and email marked confirmed.')
  } else {
    const created = await api('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email: ADMIN_EMAIL,
        password,
        email_confirm: true,
        user_metadata: { full_name: 'Pasu Administrator' },
      }),
    })
    if (!created.ok) throw new Error(`Could not create the administrator: ${created.status} ${JSON.stringify(created.body)}`)
    user = created.body
    console.log(`Created account ${user.id}.`)
  }

  // The sign-up trigger creates the profile row; wait briefly for it to land.
  let profile = null
  for (let attempt = 0; attempt < 10 && !profile; attempt += 1) {
    const result = await api(`/rest/v1/profiles?id=eq.${user.id}&select=id,email,role`)
    profile = result.ok && Array.isArray(result.body) ? result.body[0] : null
    if (!profile) await new Promise((resolve) => setTimeout(resolve, 500))
  }
  if (!profile) throw new Error('The profile row for this account is missing; check the on_auth_user_created trigger.')

  const granted = await api(`/rest/v1/profiles?id=eq.${user.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ role: 'admin', is_suspended: false }),
  })
  if (!granted.ok) throw new Error(`Could not grant the administrator role: ${granted.status} ${JSON.stringify(granted.body)}`)

  const verify = await api(`/rest/v1/profiles?id=eq.${user.id}&select=id,email,role,is_verified,is_suspended`)
  const row = Array.isArray(verify.body) ? verify.body[0] : null
  if (!verify.ok || !row || row.role !== 'admin') {
    throw new Error(`Role verification failed: ${JSON.stringify(verify.body)}`)
  }

  console.log('')
  console.log('Verified in Supabase:')
  console.log(`  account id : ${row.id}`)
  console.log(`  email      : ${row.email}`)
  console.log(`  role       : ${row.role}`)
  console.log('  password   : (not stored or printed anywhere)')
  console.log('')
  console.log('Sign in at /login with this email and password; administrators land on /admin.')
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
