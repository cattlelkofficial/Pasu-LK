import { useEffect, useState } from 'react'

export type AccountRole = 'user' | 'admin'
export type Account = { name: string; email: string; phone: string; district: string; city: string; role: AccountRole }
import { supabase } from './lib/supabase'

let accountCache: Account | null = null

export function getAccount(): Account | null {
  return accountCache
}

export function saveAccount(account: Account) {
  accountCache = account
}

export function clearAccount() {
  accountCache = null
}

export function isProfileComplete(account: Account | null) {
  return Boolean(account?.name.trim() && account.email.trim() && account.phone.trim() && account.district.trim() && account.city.trim())
}

export async function syncSupabaseAccount(userId: string) {
  if (!supabase) return getAccount()
  const { data, error } = await supabase.from('profiles').select('full_name,phone_number,email,district,city,role').eq('id', userId).maybeSingle()
  if (error) throw error
  // A session can exist without a profile row (the sign-up trigger can be
  // delayed or fail). Fall back to the auth metadata instead of locking the
  // account out of its own dashboard.
  if (!data) {
    const { data: authUser } = await supabase.auth.getUser()
    const meta = (authUser.user?.user_metadata || {}) as Record<string, string | undefined>
    const fallback: Account = {
      name: meta.full_name || authUser.user?.email?.split('@')[0] || 'Pasu User',
      phone: meta.phone_number || '',
      email: authUser.user?.email || '',
      district: meta.district || '',
      city: meta.city || '',
      role: 'user',
    }
    accountCache = fallback
    return fallback
  }
  const account: Account = {
    name: data.full_name || 'Pasu User',
    phone: data.phone_number || '',
    role: data.role === 'admin' ? 'admin' : 'user',
    email: data.email || '',
    district: data.district || '',
    city: data.city || '',
  }
  accountCache = account
  return account
}

export async function signOutAccount() {
  if (supabase) {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }
  clearAccount()
}

export async function updateProfile(fields: Pick<Account, 'name' | 'email' | 'phone' | 'district' | 'city'>) {
  const current = getAccount()
  const next = { ...current, ...fields, role: current?.role || 'user' } as Account
  if (supabase) {
    const { data } = await supabase.auth.getUser()
    if (!data.user) throw new Error('You must be signed in to update your profile.')
    const { error } = await supabase.from('profiles').update({
      full_name: fields.name,
      email: fields.email,
      phone_number: fields.phone,
      district: fields.district,
      city: fields.city,
    }).eq('id', data.user.id)
    if (error) throw error
  }
  accountCache = next
  return next
}

export async function sendPasswordReset(email: string) {
  if (!supabase) throw new Error('Password recovery is unavailable until Supabase is configured.')
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: window.location.origin + '/reset-password',
  })
  if (error) throw error
}

export async function updatePassword(password: string) {
  if (!supabase) throw new Error('Password updates are unavailable until Supabase is configured.')
  if (password.length < 8) throw new Error('Use at least 8 characters for your new password.')
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw error
}

// The header and the shell both need the signed-in account, including after a
// full page load where the in-memory cache is empty but Supabase still holds a
// session. This hook hydrates from that session and follows auth changes.
export function useAccount(): Account | null {
  const [account, setAccount] = useState<Account | null>(() => getAccount())
  useEffect(() => {
    if (!supabase) return
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user
      if (!user) { if (active) setAccount(null); return }
      syncSupabaseAccount(user.id).then(next => { if (active) setAccount(next) }).catch(() => undefined)
    }).catch(() => undefined)
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) { setAccount(null); return }
      syncSupabaseAccount(session.user.id).then(setAccount).catch(() => undefined)
    })
    return () => { active = false; subscription.subscription.unsubscribe() }
  }, [])
  return account
}
