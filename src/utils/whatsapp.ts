export function createWhatsAppLink(phone: string, title: string) {
  const digits = phone.replace(/\D/g, '').replace(/^0/, '94')
  const message = encodeURIComponent(`Hello, I am interested in your cattle listing "${title}". Is it still available?`)
  return `https://wa.me/${digits}?text=${message}`
}
