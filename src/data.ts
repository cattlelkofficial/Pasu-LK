export type Cattle = {
  id: string
  title: string
  breed: string
  gender: string
  age: number
  district: string
  city: string
  dailyYield: number
  price: number
  health: string
  vaccination: string
  seller: string
  phone: string
  image: string
  description: string
}

export const districts = [
  'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo', 'Galle',
  'Gampaha', 'Hambantota', 'Jaffna', 'Kalutara', 'Kandy', 'Kegalle',
  'Kilinochchi', 'Kurunegala', 'Mannar', 'Matale', 'Matara', 'Monaragala',
  'Mullaitivu', 'Nuwara Eliya', 'Polonnaruwa', 'Puttalam', 'Ratnapura',
  'Trincomalee', 'Vavuniya',
]

// Curated preview catalogue used when Supabase is not configured, so every
// screen can be explored locally. It is not production inventory: live
// listings replace it as soon as a Supabase project is connected.
export const cattle: Cattle[] = [
  {
    id: 'preview-nanda',
    title: 'Nanda',
    breed: 'Jersey Cross',
    gender: 'Female',
    age: 4,
    district: 'Kandy',
    city: 'Gampola',
    dailyYield: 15,
    price: 385000,
    health: 'Excellent',
    vaccination: 'Up to date',
    seller: 'Nimal Perera',
    phone: '+94 77 123 4567',
    image: '/cattle/jersey-close.jpg',
    description: 'A calm, hand-milked Jersey cross that has calved twice and settles easily in the shed. Steady at 15 litres a day on a grass and concentrate ration, and used to being handled around the family.',
  },
  {
    id: 'preview-sudu-menike',
    title: 'Sudu Menike',
    breed: 'Friesian Cross',
    gender: 'Female',
    age: 5,
    district: 'Nuwara Eliya',
    city: 'Ambewela',
    dailyYield: 21,
    price: 520000,
    health: 'Excellent',
    vaccination: 'Up to date',
    seller: 'S. Rajendran',
    phone: '+94 76 908 2210',
    image: '/cattle/friesian-field.jpg',
    description: 'Our highest yielder this season, grass-fed on up-country pasture and machine-milked morning and evening. Health records and AI certificates are available for inspection.',
  },
  {
    id: 'preview-kumari',
    title: 'Kumari',
    breed: 'Ayrshire',
    gender: 'Female',
    age: 3,
    district: 'Kurunegala',
    city: 'Narammala',
    dailyYield: 13,
    price: 345000,
    health: 'Good',
    vaccination: 'Up to date',
    seller: 'Chaminda Bandara',
    phone: '+94 71 445 3390',
    image: '/cattle/ayrshire-profile.jpg',
    description: 'Young Ayrshire in her second lactation, gentle with strangers and easy to lead. Well suited to a smallholder herd of five to ten animals.',
  },
  {
    id: 'preview-rani',
    title: 'Rani',
    breed: 'Jersey Cross',
    gender: 'Female',
    age: 6,
    district: 'Matale',
    city: 'Rattota',
    dailyYield: 12,
    price: 310000,
    health: 'Good',
    vaccination: 'Partially complete',
    seller: 'Anoma Kumari',
    phone: '+94 77 662 1184',
    image: '/cattle/jersey-herd.jpg',
    description: 'Bred from our own herd and raised on the same pasture she grazes today. Reliable in the shed, quiet on the halter, and due for her next vaccination round this month.',
  },
  {
    id: 'preview-laali',
    title: 'Laali',
    breed: 'Jersey Cross',
    gender: 'Female',
    age: 7,
    district: 'Badulla',
    city: 'Bandarawela',
    dailyYield: 11,
    price: 275000,
    health: 'Good',
    vaccination: 'Up to date',
    seller: 'A. H. Fuard',
    phone: '+94 75 330 7742',
    image: '/cattle/jersey-barn.jpg',
    description: 'An older cow with a settled temperament and an even production curve across the year. Ideal as a first animal for a family starting a home dairy.',
  },
  {
    id: 'preview-siththi',
    title: 'Siththi',
    breed: 'Jersey Cross',
    gender: 'Female',
    age: 5,
    district: 'Kegalle',
    city: 'Warakapola',
    dailyYield: 14,
    price: 360000,
    health: 'Excellent',
    vaccination: 'Up to date',
    seller: 'Dilrukshi Fernando',
    phone: '+94 72 815 6620',
    image: '/cattle/jersey-profile.jpg',
    description: 'Compact frame, good udder placement and a strong appetite for fodder. Milked by hand at 5.30am and 4pm, with a clean mastitis history.',
  },
  {
    id: 'preview-menike',
    title: 'Menike',
    breed: 'Sahiwal',
    gender: 'Female',
    age: 4,
    district: 'Puttalam',
    city: 'Chilaw',
    dailyYield: 9,
    price: 240000,
    health: 'Good',
    vaccination: 'Up to date',
    seller: 'M. I. Sameer',
    phone: '+94 71 220 5587',
    image: '/cattle/sahiwal-red.jpg',
    description: 'Hardy Sahiwal that handles heat and dry-season grazing well. A sensible choice for a farm in the dry zone where fodder is not always plenty.',
  },
  {
    id: 'preview-ganga',
    title: 'Ganga',
    breed: 'Local Cross',
    gender: 'Female',
    age: 5,
    district: 'Anuradhapura',
    city: 'Kekirawa',
    dailyYield: 7,
    price: 185000,
    health: 'Good',
    vaccination: 'Up to date',
    seller: 'W. M. Herath',
    phone: '+94 77 401 2298',
    image: '/cattle/local-brown.jpg',
    description: 'Village-bred local cross that lives on crop residue and roadside grazing without extra concentrate. Disease-resistant and used to open grazing.',
  },
  {
    id: 'preview-bindu',
    title: 'Bindu',
    breed: 'Local Cross',
    gender: 'Female',
    age: 6,
    district: 'Hambantota',
    city: 'Walasmulla',
    dailyYield: 8,
    price: 210000,
    health: 'Good',
    vaccination: 'Partially complete',
    seller: 'K. P. Sirisena',
    phone: '+94 76 118 4435',
    image: '/cattle/local-red.jpg',
    description: 'Raised on a mixed farm with goats and poultry, so she is used to company and easy to move. Currently giving eight litres on home-grown fodder.',
  },
]

export function formatLkr(value: number) {
  return new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 0 }).format(value).replace('LKR', 'LKR ')
}
