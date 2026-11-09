import { supabase } from '../lib/supabase'

export type AdminListing = {
  id: string
  title: string
  breed: string
  asking_price_lkr: number
  daily_yield_liters: number
  district: string
  city: string
  listing_status: string
  verification_status: string
  rejection_reason: string | null
  created_at: string
  profiles: { full_name: string; email: string; is_verified: boolean; is_suspended: boolean } | null
  cow_images?: { image_url: string; is_primary: boolean; display_order: number }[]
}

async function assertAdmin() {
  if (!supabase) throw new Error('Supabase is required for administrator access.')
  const { data: user, error: userError } = await supabase.auth.getUser()
  if (userError || !user.user) throw userError || new Error('Your session has expired.')
  const { data: profile, error } = await supabase.from('profiles').select('role,is_suspended').eq('id', user.user.id).single()
  if (error) throw error
  if (profile.role !== 'admin' || profile.is_suspended) throw new Error('Administrator access required.')
  return user.user.id
}

export async function getAdminOverview() {
  await assertAdmin()
  const [users, listings, active, pending, rejected, sold, transactions, completed, revenue, reports] = await Promise.all([
    supabase!.from('profiles').select('id', { count: 'exact', head: true }),
    supabase!.from('cow_listings').select('id', { count: 'exact', head: true }),
    supabase!.from('cow_listings').select('id', { count: 'exact', head: true }).eq('listing_status', 'approved'),
    supabase!.from('cow_listings').select('id', { count: 'exact', head: true }).eq('listing_status', 'pending'),
    supabase!.from('cow_listings').select('id', { count: 'exact', head: true }).eq('listing_status', 'rejected'),
    supabase!.from('cow_listings').select('id', { count: 'exact', head: true }).eq('listing_status', 'sold'),
    supabase!.from('transactions').select('id', { count: 'exact', head: true }),
    supabase!.from('transactions').select('id,commission_amount_lkr', { count: 'exact' }).eq('transaction_status', 'completed'),
    supabase!.from('transactions').select('commission_amount_lkr').eq('transaction_status', 'completed'),
    supabase!.from('user_reports').select('id', { count: 'exact', head: true }).in('status', ['open', 'investigating']),
  ])
  for (const result of [users, listings, active, pending, rejected, sold, transactions, completed, revenue, reports]) if (result.error) throw result.error
  return {
    users: users.count || 0, listings: listings.count || 0, active: active.count || 0, pending: pending.count || 0,
    rejected: rejected.count || 0, sold: sold.count || 0, transactions: transactions.count || 0,
    completed: completed.count || 0, revenue: (revenue.data || []).reduce((sum, row) => sum + Number(row.commission_amount_lkr || 0), 0),
    reports: reports.count || 0,
  }
}

export async function getAdminListings(status = 'pending') {
  await assertAdmin()
  let query = supabase!.from('cow_listings').select('id,title,breed,asking_price_lkr,daily_yield_liters,district,city,listing_status,verification_status,rejection_reason,created_at,profiles!cow_listings_seller_id_fkey(full_name,email,is_verified,is_suspended),cow_images(image_url,is_primary,display_order)').order('created_at', { ascending: false }).limit(100)
  if (status) query = query.eq('listing_status', status)
  const { data, error } = await query
  if (error) throw error
  return (data || []) as unknown as AdminListing[]
}

export async function reviewListing(id: string, decision: 'approved' | 'rejected', reason?: string) {
  await assertAdmin()
  const { error } = await supabase!.rpc('admin_review_listing', { target_listing: id, decision, review_reason: reason || null })
  if (error) throw error
}

export async function getAdminUsers(search = '') {
  await assertAdmin()
  let query = supabase!.from('profiles').select('id,full_name,email,phone_number,role,district,city,is_verified,is_suspended,created_at,last_seen_at').order('created_at', { ascending: false }).limit(100)
  if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone_number.ilike.%${search}%`)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function setUserSuspension(id: string, suspended: boolean, reason?: string) {
  await assertAdmin()
  const { error } = await supabase!.rpc('admin_set_user_suspension', { target_user: id, should_suspend: suspended, suspension_reason: reason || null })
  if (error) throw error
}

export async function getAdminTransactions() {
  await assertAdmin()
  const { data, error } = await supabase!.from('transactions').select('id,asking_price_lkr,agreed_price_lkr,commission_amount_lkr,total_amount_lkr,transaction_status,payment_status,created_at,updated_at,cow_listings(title),buyer:profiles!transactions_buyer_id_fkey(full_name),seller:profiles!transactions_seller_id_fkey(full_name)').order('updated_at', { ascending: false }).limit(100)
  if (error) throw error
  return data || []
}

export async function getCommissionSettings() {
  await assertAdmin()
  const { data, error } = await supabase!.from('commission_settings').select('*').order('minimum_price_lkr')
  if (error) throw error
  return data || []
}
