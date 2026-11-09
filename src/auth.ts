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
  const { data, error } = await supabase.from('profiles').select('full_name,phone_number,email,district,city,role').eq('id', userId).single()
  if (error) throw error
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
