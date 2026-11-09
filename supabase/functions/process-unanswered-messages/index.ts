import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const modelUrl = Deno.env.get('AI_MODEL_URL')
const modelKey = Deno.env.get('AI_MODEL_API_KEY')

type PendingMessage = {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  sent_at: string
  conversation: {
    listing_id: string
    cow_listings: { title: string; breed: string; description: string; daily_yield_liters: number; asking_price_lkr: number; health_condition: string; vaccination_status: string }
    conversation_participants: { user_id: string }[]
  }
}

function fallbackReply(listing: PendingMessage['conversation']['cow_listings']) {
  return `I’m Pasu’s automated assistant. I can share the information listed here: ${listing.title} is ${listing.breed}, with a listed daily yield of ${listing.daily_yield_liters} litres and an asking price of LKR ${listing.asking_price_lkr.toLocaleString()}. For availability, health details, inspection, or offers, the seller needs to confirm directly.`
}

async function generateReply(listing: PendingMessage['conversation']['cow_listings'], message: string) {
  if (!modelUrl || !modelKey) return fallbackReply(listing)
  const response = await fetch(modelUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${modelKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: 'You are Pasu’s automated assistant. Identify yourself as AI. Use only the supplied listing facts. Never negotiate, confirm availability, make health claims, or invent facts. Say the seller must confirm missing information.' },
        { role: 'user', content: JSON.stringify({ listing, incoming_message: message }) },
      ],
    }),
  })
  if (!response.ok) throw new Error(`AI provider returned ${response.status}`)
  const data = await response.json()
  return String(data.choices?.[0]?.message?.content || fallbackReply(listing))
}

Deno.serve(async () => {
  const { data: pending, error } = await supabase.from('messages')
    .select('id,conversation_id,sender_id,body,sent_at,conversation:conversations(listing_id,cow_listings(title,breed,description,daily_yield_liters,asking_price_lkr,health_condition,vaccination_status),conversation_participants(user_id))')
    .eq('sender_type', 'human')
    .lt('sent_at', new Date(Date.now() - 60000).toISOString())
    .limit(50)
  if (error) return new Response(error.message, { status: 500 })

  let processed = 0
  for (const message of (pending || []) as unknown as PendingMessage[]) {
    const { data: latest } = await supabase.from('messages')
      .select('id,sender_type')
      .eq('conversation_id', message.conversation_id)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!latest || latest.id !== message.id || latest.sender_type !== 'human') continue
    const recipient = message.conversation.conversation_participants.find(participant => participant.user_id !== message.sender_id)
    if (!recipient) continue
    const { data: settings } = await supabase.from('profiles').select('ai_assistant_enabled,ai_auto_reply_enabled,ai_reply_timeout_seconds,availability_status').eq('id', recipient.user_id).single()
    if (!settings?.ai_assistant_enabled || !settings.ai_auto_reply_enabled || settings.availability_status === 'online') continue
    if (new Date(message.sent_at).getTime() > Date.now() - settings.ai_reply_timeout_seconds * 1000) continue
    const { data: existing } = await supabase.from('ai_reply_logs').select('id').eq('source_message_id', message.id).maybeSingle()
    if (existing) continue
    const { data: log } = await supabase.from('ai_reply_logs').insert({ conversation_id: message.conversation_id, source_message_id: message.id, recipient_id: recipient.user_id, status: 'queued' }).select('id').single()
    if (!log) continue
    try {
      const body = await generateReply(message.conversation.cow_listings, message.body)
      const { data: aiMessage, error: insertError } = await supabase.from('messages').insert({ conversation_id: message.conversation_id, sender_type: 'ai', body, ai_label: 'Automated AI response' }).select('id').single()
      if (insertError) throw insertError
      await supabase.from('ai_reply_logs').update({ ai_message_id: aiMessage.id, status: 'sent', processed_at: new Date().toISOString() }).eq('id', log.id)
      await supabase.from('notifications').insert({ user_id: recipient.user_id, title: 'Automated reply sent', message: 'Pasu’s assistant replied to an unanswered conversation. Review it when you return.', notification_type: 'ai_reply' })
      processed += 1
    } catch (reason) {
      await supabase.from('ai_reply_logs').update({ status: 'failed', reason: reason instanceof Error ? reason.message : 'Unknown error', processed_at: new Date().toISOString() }).eq('id', log.id)
    }
  }
  return Response.json({ processed })
})
