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
}

function toCattle(row: ListingRow): Cattle {
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
    seller: 'Pasu seller',
    phone: '',
    image: image || '',
    description: row.description,
  }
}

export async function fetchApprovedCattle(): Promise<Cattle[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('cow_listings')
    .select('id,title,breed,gender,estimated_age_months,asking_price_lkr,daily_yield_liters,district,city,description,health_condition,vaccination_status,cow_images(image_url,is_primary,display_order)')
    .eq('listing_status', 'approved')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as ListingRow[]).map(toCattle)
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
    .select('id,title,breed,gender,estimated_age_months,asking_price_lkr,daily_yield_liters,district,city,description,health_condition,vaccination_status,cow_images(image_url,is_primary,display_order)')
    .eq('listing_status', 'approved')
  if (filters.query) request = request.or(`title.ilike.%${filters.query}%,breed.ilike.%${filters.query}%,city.ilike.%${filters.query}%`)
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
