import { supabase } from '../lib/supabase'

export type NewListing = {
  title: string
  breed: string
  gender: 'Female' | 'Male'
  ageMonths: number
  price: number
  dailyYield: number
  district: string
  city: string
  description: string
  health: string
  vaccination: string
  pregnancy: string
}

export async function createListing(listing: NewListing, photos: File[]) {
  if (!supabase) return null
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) throw userError || new Error('You must be signed in to create a listing.')
  const { data, error } = await supabase.from('cow_listings').insert({
    seller_id: userData.user.id,
    title: listing.title,
    breed: listing.breed,
    gender: listing.gender,
    estimated_age_months: listing.ageMonths,
    asking_price_lkr: listing.price,
    daily_yield_liters: listing.dailyYield,
    district: listing.district,
    city: listing.city,
    description: listing.description,
    health_condition: listing.health,
    vaccination_status: listing.vaccination,
    pregnancy_status: listing.pregnancy,
    listing_status: 'pending',
    verification_status: 'pending',
  }).select('id').single()
  if (error) throw error
  for (const [index, photo] of photos.entries()) {
    const path = `${userData.user.id}/${data.id}/${index}-${photo.name}`
    const upload = await supabase.storage.from('cattle-images').upload(path, photo, { contentType: photo.type, upsert: false })
    if (upload.error) throw upload.error
    const { data: publicUrl } = supabase.storage.from('cattle-images').getPublicUrl(path)
    const imageInsert = await supabase.from('cow_images').insert({ cow_listing_id: data.id, image_url: publicUrl.publicUrl, is_primary: index === 0, display_order: index })
    if (imageInsert.error) throw imageInsert.error
  }
  return data.id as string
}

export async function toggleFavourite(listingId: string, saved: boolean) {
  if (!supabase) return
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new Error('You must be signed in to save listings.')
  if (saved) {
    const { error } = await supabase.from('favourites').delete().eq('user_id', data.user.id).eq('cow_listing_id', listingId)
    if (error) throw error
  } else {
    const { error } = await supabase.from('favourites').insert({ user_id: data.user.id, cow_listing_id: listingId })
    if (error) throw error
  }
}
