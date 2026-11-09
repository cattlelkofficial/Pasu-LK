import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type Conversation = {
  id: string
  listing_id: string
  last_message_at: string | null
  cow_listings: { title: string; asking_price_lkr: number; seller_id: string }
  conversation_participants: { user_id: string; profiles: { full_name: string; availability_status: string } }[]
}

export type Message = {
  id: string
  conversation_id: string
  sender_id: string | null
  sender_type: 'human' | 'ai' | 'system'
  body: string
  attachment_path: string | null
  attachment_name: string | null
  sent_at: string
  ai_label: string | null
}

export async function getCurrentUserId() {
  if (!supabase) return null
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  return data.user?.id || null
}

export async function listConversations() {
  if (!supabase) return []
  const { data, error } = await supabase.from('conversations')
    .select('id,listing_id,last_message_at,cow_listings(title,asking_price_lkr,seller_id),conversation_participants(user_id,profiles(full_name,availability_status))')
    .order('last_message_at', { ascending: false, nullsFirst: false })
  if (error) throw error
  return (data || []) as unknown as Conversation[]
}

export async function createConversation(listingId: string) {
  if (!supabase) throw new Error('Messaging is unavailable until Supabase is configured.')
  const { data, error } = await supabase.rpc('create_conversation', { target_listing: listingId })
  if (error) throw error
  return data as string
}

export async function getMessages(conversationId: string) {
  if (!supabase) return []
  const { data, error } = await supabase.from('messages').select('*')
    .eq('conversation_id', conversationId).order('sent_at', { ascending: true })
  if (error) throw error
  return (data || []) as Message[]
}

export async function sendMessage(conversationId: string, body: string, file?: File) {
  if (!supabase) throw new Error('Messaging is unavailable until Supabase is configured.')
  const userId = await getCurrentUserId()
  if (!userId) throw new Error('You must be signed in to send messages.')
  let attachmentPath: string | null = null
  if (file) {
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) throw new Error('Please attach an image under 5 MB.')
    attachmentPath = `${userId}/${conversationId}/${crypto.randomUUID()}-${file.name}`
    const upload = await supabase.storage.from('message-attachments').upload(attachmentPath, file, { contentType: file.type })
    if (upload.error) throw upload.error
  }
  const { data, error } = await supabase.from('messages').insert({
    conversation_id: conversationId, sender_id: userId, sender_type: 'human',
    body: body.trim(), attachment_path: attachmentPath, attachment_name: file?.name || null,
  }).select('*').single()
  if (error) throw error
  return data as Message
}

export async function markMessageRead(messageId: string) {
  if (!supabase) return
  const userId = await getCurrentUserId()
  if (!userId) return
  const { error } = await supabase.from('message_read_receipts').upsert({ message_id: messageId, user_id: userId })
  if (error) throw error
}

export async function getUnreadCount(conversationId: string, userId: string) {
  if (!supabase) return 0
  const { data: incoming, error } = await supabase.from('messages').select('id').eq('conversation_id', conversationId).neq('sender_id', userId)
  if (error) throw error
  if (!incoming?.length) return 0
  const { data: receipts, error: receiptError } = await supabase.from('message_read_receipts').select('message_id').eq('user_id', userId).in('message_id', incoming.map(message => message.id))
  if (receiptError) throw receiptError
  const read = new Set((receipts || []).map(receipt => receipt.message_id))
  return incoming.filter(message => !read.has(message.id)).length
}

export async function blockConversation(conversationId: string) {
  if (!supabase) throw new Error('Messaging is unavailable until Supabase is configured.')
  const { error } = await supabase.rpc('block_conversation', { target_conversation: conversationId })
  if (error) throw error
}

export async function reportConversation(conversationId: string, reason: string) {
  if (!supabase) throw new Error('Messaging is unavailable until Supabase is configured.')
  const userId = await getCurrentUserId()
  if (!userId) throw new Error('You must be signed in to report a conversation.')
  const { error } = await supabase.from('conversation_reports').insert({ conversation_id: conversationId, reported_by: userId, reason })
  if (error) throw error
}

export async function handoverConversation(conversationId: string) {
  if (!supabase) throw new Error('Messaging is unavailable until Supabase is configured.')
  const { error } = await supabase.rpc('handover_conversation', { target_conversation: conversationId })
  if (error) throw error
  await updateAiSettings({ ai_assistant_enabled: false, ai_auto_reply_enabled: false, ai_reply_timeout_seconds: 300 })
}

export async function updatePresence(status: 'online' | 'away' | 'offline') {
  if (!supabase) return
  const userId = await getCurrentUserId()
  if (!userId) return
  const { error } = await supabase.from('user_presence').upsert({ user_id: userId, status, last_seen_at: new Date().toISOString() })
  if (error) throw error
  const { error: profileError } = await supabase.from('profiles').update({ availability_status: status }).eq('id', userId)
  if (profileError) throw profileError
}

export async function updateAiSettings(settings: {
  ai_assistant_enabled: boolean
  ai_auto_reply_enabled: boolean
  ai_reply_timeout_seconds: number
}) {
  if (!supabase) throw new Error('Messaging is unavailable until Supabase is configured.')
  const userId = await getCurrentUserId()
  if (!userId) throw new Error('You must be signed in to update AI settings.')
  const { error } = await supabase.from('profiles').update(settings).eq('id', userId)
  if (error) throw error
}

export function subscribeToConversation(conversationId: string, onMessage: (message: Message) => void): RealtimeChannel | null {
  if (!supabase) return null
  return supabase.channel(`conversation:${conversationId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, payload => onMessage(payload.new as Message))
    .subscribe()
}

export function subscribeToTyping(channel: RealtimeChannel, onTyping: (userId: string, isTyping: boolean) => void) {
  channel.on('broadcast', { event: 'typing' }, payload => {
    if (payload.payload?.userId) onTyping(payload.payload.userId as string, Boolean(payload.payload.isTyping))
  })
}

export async function broadcastTyping(channel: RealtimeChannel, userId: string, isTyping: boolean) {
  await channel.send({ type: 'broadcast', event: 'typing', payload: { userId, isTyping } })
}

export async function getAttachmentUrl(path: string) {
  if (!supabase) return null
  const { data, error } = await supabase.storage.from('message-attachments').createSignedUrl(path, 3600)
  if (error) throw error
  return data.signedUrl
}
