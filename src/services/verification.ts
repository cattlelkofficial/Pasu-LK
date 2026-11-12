import { supabase } from '../lib/supabase'

export type VerificationStatus = 'pending' | 'approved' | 'rejected'

export type VerificationRequest = {
  id: string
  user_id: string
  status: VerificationStatus
  documents: unknown
  rejection_reason: string | null
  reviewed_at: string | null
  created_at: string
  // Aliased embeds are typed as arrays by the client, so accept either shape.
  profile?: VerificationProfile | VerificationProfile[] | null
}

type VerificationProfile = { full_name: string | null; email: string | null; district: string | null; city: string | null; is_verified: boolean | null }

const REQUEST_COLUMNS = 'id,user_id,status,documents,rejection_reason,reviewed_at,created_at'
const REQUEST_WITH_SELLER = REQUEST_COLUMNS + ',profile:profiles!seller_verification_requests_user_id_fkey(full_name,email,district,city,is_verified)'

function sellerOf(row: VerificationRequest): VerificationProfile | null {
  const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile
  return profile || null
}

export function verificationNote(documents: unknown): string {
  if (documents && typeof documents === 'object' && !Array.isArray(documents)) {
    const note = (documents as { note?: unknown }).note
    if (typeof note === 'string') return note
  }
  return ''
}

export type MyVerificationState = { verified: boolean; request: VerificationRequest | null }

// The seller's own view: whether the profile carries the verified flag (an admin
// can set it directly without a request) plus the latest request they submitted.
export async function getMyVerificationState(): Promise<MyVerificationState> {
  if (!supabase) return { verified: false, request: null }
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { verified: false, request: null }
  const [profileResult, requestResult] = await Promise.all([
    supabase.from('profiles').select('is_verified').eq('id', auth.user.id).maybeSingle(),
    supabase.from('seller_verification_requests').select(REQUEST_COLUMNS).eq('user_id', auth.user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (profileResult.error) throw profileResult.error
  if (requestResult.error) throw requestResult.error
  return {
    verified: Boolean(profileResult.data?.is_verified),
    request: (requestResult.data as VerificationRequest | null) ?? null,
  }
}

export async function requestVerification(note?: string) {
  if (!supabase) return null
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError) throw authError
  if (!auth.user) throw new Error('Sign in to request verification.')
  const trimmed = note?.trim()
  const { data, error } = await supabase.from('seller_verification_requests').insert({
    user_id: auth.user.id,
    status: 'pending',
    documents: trimmed ? { note: trimmed } : [],
  }).select('id').single()
  if (error) {
    if (error.code === '23505') throw new Error('You already have a verification request under review.')
    throw error
  }
  return data.id as string
}

// Administrator queue. RLS returns every row to an admin and none to anyone else.
export async function listVerificationRequests(status: VerificationStatus | 'all' = 'pending'): Promise<VerificationRequest[]> {
  if (!supabase) return []
  let query = supabase.from('seller_verification_requests').select(REQUEST_WITH_SELLER)
    .order('created_at', { ascending: true }).limit(100)
  if (status !== 'all') query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw error
  return (data || []) as unknown as VerificationRequest[]
}

export { sellerOf }
