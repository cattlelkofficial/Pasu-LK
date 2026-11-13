import { supabase } from '../lib/supabase'
import type { Cattle } from '../data'

type ListingRow = {
  id: string
  title: string
  breed: string
  gender: string
  estimated_age_months: number | null
  asking_price_lkr: number
  daily_yield_liters: number
  district: string
  city: string
  description: string
  health_condition: string
  vaccination_status: string
  cow_images?: { image_url: string; is_primary: boolean; display_order: number }[]
  // An aliased embed is typed as an array by the client, so accept either shape.
  seller?: SellerProfile | SellerProfile[] | null
}

type SellerProfile = { full_name: string | null; is_verified: boolean | null }

// cow_listings points at profiles twice (seller_id and field_agent_id), so the
// seller embed has to name the foreign key or PostgREST rejects the query as
// ambiguous. The public catalogue carries the seller's public name and
// verification flag only: the phone number is fetched separately, and only for
// the listing's owner or an administrator.
const LISTING_COLUMNS = 'id,title,breed,gender,estimated_age_months,asking_price_lkr,daily_yield_liters,district,city,description,health_condition,vaccination_status,cow_images(image_url,is_primary,display_order),seller:profiles!cow_listings_seller_id_fkey(full_name,is_verified)'

function toCattle(row: ListingRow): Cattle {
  const seller = Array.isArray(row.seller) ? row.seller[0] : row.seller
  const image = [...(row.cow_images || [])].sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.display_order - b.display_order)[0]?.image_url
  return {
    id: row.id,
    title: row.title,
    breed: row.breed,
    gender: row.gender,
    age: Math.round((row.estimated_age_months || 0) / 12),
    district: row.district,
    city: row.city,
    dailyYield: row.daily_yield_liters,
    price: row.asking_price_lkr,
    health: row.health_condition,
    vaccination: row.vaccination_status,
    seller: seller?.full_name?.trim() || 'Pasu seller',
    phone: '',
    sellerVerified: Boolean(seller?.is_verified),
    image: image || '',
    description: row.description,
  }
}

export type SellerContact = { name: string; phone: string }

// The seller's phone number is deliberately absent from the public catalogue.
// This calls a security-definer function that only returns a row when the caller
// owns the listing or is an administrator, so nobody else can read the number.
export async function fetchSellerContact(cowId: string): Promise<SellerContact | null> {
  if (!supabase || !cowId) return null
  // Read the session from storage rather than the in-memory account cache, which
  // is only filled once a dashboard route has run. Without this the lookup
  // silently did nothing on a fresh page load or a direct link.
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) return null
  const { data, error } = await supabase.rpc('seller_contact', { target_listing: cowId })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as { full_name: string | null; phone_number: string | null } | undefined
  if (!row?.phone_number) return null
  return { name: row.full_name?.trim() || '', phone: row.phone_number.trim() }
}

export async function fetchApprovedCattle(): Promise<Cattle[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('cow_listings')
    .select(LISTING_COLUMNS)
    .eq('listing_status', 'approved')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as ListingRow[]).map(toCattle)
}

// PostgREST parses the inside of an `or` filter itself, so a term containing a
// comma, parenthesis, double quote or LIKE wildcard made the whole request fail
// with a 400 and the marketplace went blank. Keep the words the buyer typed and
// drop the filter syntax.
function searchPattern(term: string) {
  return term
    .replace(/[%_\\,()"'*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function searchApprovedCattle(filters: {
  query?: string
  district?: string
  city?: string
  breed?: string
  gender?: string
  minPrice?: number
  maxPrice?: number
  minYield?: number
  minAgeMonths?: number
  maxAgeMonths?: number
}) {
  if (!supabase) return null
  let request = supabase.from('cow_listings')
    .select(LISTING_COLUMNS)
    .eq('listing_status', 'approved')
  const term = filters.query ? searchPattern(filters.query) : ''
  // Quoted values keep PostgREST from reading the pattern as syntax. A term made
  // entirely of punctuation is ignored rather than turning into a broken filter.
  if (term) request = request.or(`title.ilike."%${term}%",breed.ilike."%${term}%",city.ilike."%${term}%",district.ilike."%${term}%"`)
  if (filters.district) request = request.eq('district', filters.district)
  if (filters.city) request = request.ilike('city', `%${filters.city}%`)
  if (filters.breed) request = request.eq('breed', filters.breed)
  if (filters.gender) request = request.eq('gender', filters.gender)
  if (filters.minPrice !== undefined) request = request.gte('asking_price_lkr', filters.minPrice)
  if (filters.maxPrice !== undefined) request = request.lte('asking_price_lkr', filters.maxPrice)
  if (filters.minYield !== undefined) request = request.gte('daily_yield_liters', filters.minYield)
  if (filters.minAgeMonths !== undefined) request = request.gte('estimated_age_months', filters.minAgeMonths)
  if (filters.maxAgeMonths !== undefined) request = request.lte('estimated_age_months', filters.maxAgeMonths)
  const { data, error } = await request.order('created_at', { ascending: false }).limit(50)
  if (error) throw error
  return (data as ListingRow[]).map(toCattle)
}
