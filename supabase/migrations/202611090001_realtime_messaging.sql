create type public.message_sender_type as enum ('human', 'ai', 'system');
create type public.presence_status as enum ('online', 'away', 'offline');

alter table public.profiles
  add column if not exists ai_assistant_enabled boolean not null default false,
  add column if not exists ai_auto_reply_enabled boolean not null default false,
  add column if not exists ai_reply_timeout_seconds integer not null default 300
    check (ai_reply_timeout_seconds between 60 and 86400),
  add column if not exists availability_status public.presence_status not null default 'offline';

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.cow_listings(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  last_message_at timestamptz,
  ai_handover_at timestamptz,
  blocked_at timestamptz,
  blocked_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, created_by)
);

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz,
  primary key (conversation_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid references public.profiles(id),
  sender_type public.message_sender_type not null default 'human',
  body text not null check (char_length(body) between 1 and 5000),
  attachment_path text,
  attachment_name text,
  sent_at timestamptz not null default now(),
  ai_label text,
  constraint messages_sender_required check (
    (sender_type = 'ai' and sender_id is null) or
    (sender_type <> 'ai' and sender_id is not null)
  )
);

create table public.user_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status public.presence_status not null default 'offline',
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.message_read_receipts (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table public.ai_reply_logs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  source_message_id uuid not null references public.messages(id) on delete cascade,
  ai_message_id uuid references public.messages(id) on delete set null,
  recipient_id uuid not null references public.profiles(id),
  status text not null check (status in ('queued', 'sent', 'skipped', 'failed')),
  reason text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (source_message_id)
);

create table public.conversation_reports (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  reported_by uuid not null references public.profiles(id),
  reason text not null check (char_length(reason) between 2 and 1000),
  created_at timestamptz not null default now()
);

create index conversations_listing_idx on public.conversations(listing_id);
create index conversations_last_message_idx on public.conversations(last_message_at desc);
create index conversation_participants_user_idx on public.conversation_participants(user_id);
create index messages_conversation_sent_idx on public.messages(conversation_id, sent_at);
create index messages_unanswered_idx on public.messages(sent_at) where sender_type = 'human';
create index message_receipts_user_idx on public.message_read_receipts(user_id);
create index ai_reply_logs_status_idx on public.ai_reply_logs(status, created_at);
create index conversation_reports_conversation_idx on public.conversation_reports(conversation_id);

create or replace function public.is_conversation_participant(target_conversation uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.conversation_participants
    where conversation_id = target_conversation and user_id = auth.uid()
  )
$$;

create or replace function public.create_conversation(target_listing uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  conversation_id uuid;
  seller uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select seller_id into seller from public.cow_listings
  where id = target_listing and listing_status = 'approved';
  if seller is null then raise exception 'Listing is not available'; end if;
  if seller = auth.uid() then raise exception 'You cannot message yourself'; end if;

  insert into public.conversations (listing_id, created_by)
  values (target_listing, auth.uid())
  on conflict (listing_id, created_by) do update set updated_at = now()
  returning id into conversation_id;

  insert into public.conversation_participants (conversation_id, user_id)
  values (conversation_id, auth.uid()), (conversation_id, seller)
  on conflict do nothing;
  return conversation_id;
end $$;

create or replace function public.block_conversation(target_conversation uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_conversation_participant(target_conversation) then raise exception 'Conversation access denied'; end if;
  update public.conversations
  set blocked_at = now(), blocked_by = auth.uid()
  where id = target_conversation;
end $$;

create or replace function public.handover_conversation(target_conversation uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_conversation_participant(target_conversation) then raise exception 'Conversation access denied'; end if;
  update public.conversations set ai_handover_at = now() where id = target_conversation;
end $$;

create or replace function public.touch_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.conversations
  set last_message_at = new.sent_at, updated_at = now()
  where id = new.conversation_id;
  return new;
end $$;

create trigger messages_touch_conversation
after insert on public.messages
for each row execute function public.touch_conversation();

create trigger conversations_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

create trigger presence_updated_at
before update on public.user_presence
for each row execute function public.set_updated_at();

create or replace function public.notify_message_recipient()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, title, message, notification_type)
  select cp.user_id,
    case when new.sender_type = 'ai' then 'Pasu assistant replied' else 'New message' end,
    case when new.sender_type = 'ai' then 'An automated assistant reply is waiting for your review.'
         else 'You have a new private marketplace message.' end,
    case when new.sender_type = 'ai' then 'ai_reply' else 'message' end
  from public.conversation_participants cp
  where cp.conversation_id = new.conversation_id
    and cp.user_id is distinct from new.sender_id;
  return new;
end $$;

create trigger messages_notify_recipient
after insert on public.messages
for each row execute function public.notify_message_recipient();

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.user_presence enable row level security;
alter table public.message_read_receipts enable row level security;
alter table public.ai_reply_logs enable row level security;

create policy "participants view conversations" on public.conversations
for select using (public.is_conversation_participant(id) or public.current_role() = 'admin');
create policy "participants view participant rows" on public.conversation_participants
for select using (user_id = auth.uid() or public.is_conversation_participant(conversation_id));

create policy "participants view messages" on public.messages
for select using (public.is_conversation_participant(conversation_id) or public.current_role() = 'admin');
create policy "users send messages" on public.messages
for insert with check (
  sender_id = auth.uid() and sender_type = 'human'
  and public.is_conversation_participant(conversation_id)
  and not exists (select 1 from public.conversations where id = conversation_id and blocked_at is not null)
);

create policy "users manage own presence" on public.user_presence
for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "participants view presence" on public.user_presence
for select using (user_id = auth.uid() or public.current_role() = 'admin');

create policy "users manage own read receipts" on public.message_read_receipts
for all using (user_id = auth.uid()) with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.messages m
    where m.id = message_id and public.is_conversation_participant(m.conversation_id)
  )
);

create policy "participants view ai logs" on public.ai_reply_logs
for select using (recipient_id = auth.uid() or public.is_conversation_participant(conversation_id) or public.current_role() = 'admin');

create policy "participants report conversations" on public.conversation_reports
for insert with check (reported_by = auth.uid() and public.is_conversation_participant(conversation_id));
create policy "reporters view own reports" on public.conversation_reports
for select using (reported_by = auth.uid() or public.current_role() = 'admin');

insert into storage.buckets (id, name, public)
values ('message-attachments', 'message-attachments', false)
on conflict (id) do nothing;

create policy "participants upload message attachments"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'message-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "participants read message attachments"
on storage.objects for select to authenticated
using (
  bucket_id = 'message-attachments'
  and exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = ((storage.foldername(name))[2])::uuid
      and cp.user_id = auth.uid()
  )
);

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.user_presence;
alter publication supabase_realtime add table public.message_read_receipts;
