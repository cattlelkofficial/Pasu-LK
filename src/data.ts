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

export const cattle: Cattle[] = []

export function formatLkr(value: number) {
  return new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 0 }).format(value).replace('LKR', 'LKR ')
}
