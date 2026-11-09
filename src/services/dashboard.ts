import { supabase } from '../lib/supabase'

export type DashboardSummary = {
  favourites: number
  listings: number
  pendingListings: number
  openEnquiries: number
  unreadMessages: number
  activeTransactions: number
  completedTransactions: number
  completedValue: number
}

export type ListingRow = {
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
  updated_at: string
  cow_images?: { image_url: string; is_primary: boolean; display_order: number }[]
}

async function currentUserId() {
  if (!supabase) return null
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  return data.user?.id || null
}

export async function getDashboardSummary(): Promise<DashboardSummary | null> {
  if (!supabase) return null
  const userId = await currentUserId()
  if (!userId) throw new Error('Your session has expired. Please sign in again.')
  const [favourites, listings, pending, received, sent, transactions, messages, receipts] = await Promise.all([
    supabase.from('favourites').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('cow_listings').select('id', { count: 'exact', head: true }).eq('seller_id', userId),
    supabase.from('cow_listings').select('id', { count: 'exact', head: true }).eq('seller_id', userId).eq('listing_status', 'pending'),
    supabase.from('enquiries').select('id', { count: 'exact', head: true }).eq('seller_id', userId).neq('enquiry_status', 'closed'),
    supabase.from('enquiries').select('id', { count: 'exact', head: true }).eq('buyer_id', userId).neq('enquiry_status', 'closed'),
    supabase.from('transactions').select('transaction_status,agreed_price_lkr').or(`buyer_id.eq.${userId},seller_id.eq.${userId}`),
    supabase.from('messages').select('id,sender_id').neq('sender_id', userId),
    supabase.from('message_read_receipts').select('message_id').eq('user_id', userId),
  ])
  for (const result of [favourites, listings, pending, received, sent, transactions, messages, receipts]) if (result.error) throw result.error
  const readIds = new Set((receipts.data || []).map(row => row.message_id))
  const unreadMessages = (messages.data || []).filter(row => !readIds.has(row.id)).length
  const transactionRows = (transactions.data || []) as { transaction_status: string; agreed_price_lkr: number | null }[]
  return {
    favourites: favourites.count || 0,
    listings: listings.count || 0,
    pendingListings: pending.count || 0,
    openEnquiries: (received.count || 0) + (sent.count || 0),
    unreadMessages,
    activeTransactions: transactionRows.filter(row => !['completed', 'cancelled'].includes(row.transaction_status)).length,
    completedTransactions: transactionRows.filter(row => row.transaction_status === 'completed').length,
    completedValue: transactionRows.filter(row => row.transaction_status === 'completed').reduce((total, row) => total + Number(row.agreed_price_lkr || 0), 0),
  }
}

export async function getMyListings() {
  if (!supabase) return null
  const userId = await currentUserId()
  if (!userId) throw new Error('Your session has expired. Please sign in again.')
  const { data, error } = await supabase.from('cow_listings')
    .select('id,title,breed,asking_price_lkr,daily_yield_liters,district,city,listing_status,verification_status,rejection_reason,created_at,updated_at,cow_images(image_url,is_primary,display_order)')
    .eq('seller_id', userId).order('created_at', { ascending: false })
  if (error) throw error
  return (data || []) as ListingRow[]
}

export async function getSavedListings() {
  if (!supabase) return null
  const { data, error } = await supabase.from('favourites')
    .select('id,cow_listing_id,cow_listings(id,title,breed,gender,estimated_age_months,asking_price_lkr,daily_yield_liters,district,city,description,health_condition,vaccination_status,listing_status,cow_images(image_url,is_primary,display_order))')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function getMyTransactions() {
  if (!supabase) return null
  const userId = await currentUserId()
  if (!userId) throw new Error('Your session has expired. Please sign in again.')
  const { data, error } = await supabase.from('transactions')
    .select('id,listing_id,buyer_id,seller_id,asking_price_lkr,agreed_price_lkr,commission_amount_lkr,total_amount_lkr,transaction_status,payment_status,created_at,updated_at,cow_listings(title)')
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`).order('updated_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function getMyEnquiries() {
  if (!supabase) return null
  const userId = await currentUserId()
  if (!userId) throw new Error('Your session has expired. Please sign in again.')
  const { data, error } = await supabase.from('enquiries')
    .select('id,buyer_id,seller_id,cow_listing_id,message,enquiry_status,created_at,cow_listings(title,asking_price_lkr),buyer:profiles!enquiries_buyer_id_fkey(full_name),seller:profiles!enquiries_seller_id_fkey(full_name)')
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`).order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function getUnreadNotificationCount() {
  if (!supabase) return 0
  const userId = await currentUserId()
  if (!userId) return 0
  const { count, error } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_read', false)
  if (error) throw error
  return count || 0
}

export async function getNotifications() {
  if (!supabase) return null
  const userId = await currentUserId()
  if (!userId) throw new Error('Your session has expired. Please sign in again.')
  const { data, error } = await supabase.from('notifications').select('id,title,message,notification_type,is_read,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(50)
  if (error) throw error
  return data || []
}

export async function markNotificationRead(notificationId: string) {
  if (!supabase) return
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', notificationId)
  if (error) throw error
}

export async function markAllNotificationsRead() {
  if (!supabase) return
  const userId = await currentUserId()
  if (!userId) throw new Error('Your session has expired. Please sign in again.')
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false)
  if (error) throw error
}
