-- Pasu database bootstrap: every migration in apply order.
-- Paste this whole file into the Supabase SQL editor on a fresh project,
-- or run `supabase link` then `supabase db push` to apply them individually.

-- ===========================================================
-- 202511090001_initial_schema.sql
-- ===========================================================
create extension if not exists "pgcrypto";

create type public.user_role as enum ('buyer', 'seller', 'field_agent', 'admin');
create type public.listing_status as enum ('draft', 'pending', 'approved', 'rejected', 'sold', 'inactive');
create type public.transaction_status as enum ('initiated', 'negotiation', 'agreed', 'completed', 'cancelled');
create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded', 'not_applicable');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone_number text not null default '',
  email text,
  role public.user_role not null default 'buyer',
  district text,
  city text,
  address text,
  profile_image_url text,
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cow_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id),
  field_agent_id uuid references public.profiles(id),
  title text not null check (char_length(title) between 2 and 120),
  breed text not null,
  gender text not null check (gender in ('Female', 'Male')),
  date_of_birth date,
  estimated_age_months integer check (estimated_age_months is null or estimated_age_months between 0 and 360),
  asking_price_lkr numeric(12,2) not null check (asking_price_lkr > 0),
  daily_yield_liters numeric(6,2) not null default 0 check (daily_yield_liters >= 0),
  morning_yield_liters numeric(6,2) not null default 0 check (morning_yield_liters >= 0),
  evening_yield_liters numeric(6,2) not null default 0 check (evening_yield_liters >= 0),
  district text not null,
  city text not null,
  description text not null default '',
  health_condition text not null default 'Not provided',
  vaccination_status text not null default 'Not provided',
  pregnancy_status text,
  veterinary_inspection_status text not null default 'Pending',
  listing_status public.listing_status not null default 'pending',
  verification_status text not null default 'pending',
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cow_images (
  id uuid primary key default gen_random_uuid(),
  cow_listing_id uuid not null references public.cow_listings(id) on delete cascade,
  image_url text not null,
  is_primary boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.favourites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  cow_listing_id uuid not null references public.cow_listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, cow_listing_id)
);

create table public.enquiries (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id),
  seller_id uuid not null references public.profiles(id),
  cow_listing_id uuid not null references public.cow_listings(id),
  message text not null check (char_length(message) between 1 and 2000),
  enquiry_status text not null default 'open' check (enquiry_status in ('open', 'replied', 'closed')),
  created_at timestamptz not null default now()
);

create table public.commission_settings (
  id uuid primary key default gen_random_uuid(),
  minimum_price_lkr numeric(12,2) not null check (minimum_price_lkr >= 0),
  maximum_price_lkr numeric(12,2) check (maximum_price_lkr is null or maximum_price_lkr > minimum_price_lkr),
  commission_percentage numeric(5,2) not null check (commission_percentage between 0 and 100),
  condition_adjustment numeric(5,2) not null default 0 check (condition_adjustment between -100 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.cow_listings(id),
  buyer_id uuid not null references public.profiles(id),
  seller_id uuid not null references public.profiles(id),
  asking_price_lkr numeric(12,2) not null check (asking_price_lkr > 0),
  agreed_price_lkr numeric(12,2) check (agreed_price_lkr is null or agreed_price_lkr > 0),
  commission_amount_lkr numeric(12,2) not null default 0 check (commission_amount_lkr >= 0),
  commission_rate_snapshot numeric(5,2) not null default 0,
  total_amount_lkr numeric(12,2) not null default 0 check (total_amount_lkr >= 0),
  transaction_status public.transaction_status not null default 'initiated',
  payment_status public.payment_status not null default 'not_applicable',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.verification_logs (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.cow_listings(id) on delete cascade,
  verified_by uuid not null references public.profiles(id),
  previous_status text not null,
  new_status text not null,
  remarks text,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  notification_type text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index cow_listings_status_idx on public.cow_listings(listing_status);
create index cow_listings_verification_idx on public.cow_listings(verification_status);
create index cow_listings_district_idx on public.cow_listings(district);
create index cow_listings_breed_idx on public.cow_listings(breed);
create index cow_listings_price_idx on public.cow_listings(asking_price_lkr);
create index cow_listings_yield_idx on public.cow_listings(daily_yield_liters);
create index cow_listings_seller_idx on public.cow_listings(seller_id);
create index cow_listings_created_idx on public.cow_listings(created_at desc);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger cow_listings_updated_at before update on public.cow_listings for each row execute function public.set_updated_at();
create trigger transactions_updated_at before update on public.transactions for each row execute function public.set_updated_at();
create trigger commission_settings_updated_at before update on public.commission_settings for each row execute function public.set_updated_at();

create or replace function public.current_role() returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, phone_number, email) values (new.id, coalesce(new.phone, ''), new.email);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.cow_listings enable row level security;
alter table public.cow_images enable row level security;
alter table public.favourites enable row level security;
alter table public.enquiries enable row level security;
alter table public.commission_settings enable row level security;
alter table public.transactions enable row level security;
alter table public.verification_logs enable row level security;
alter table public.notifications enable row level security;

create policy "public can view approved listings" on public.cow_listings for select using (listing_status = 'approved' or seller_id = auth.uid() or field_agent_id = auth.uid() or public.current_role() = 'admin');
create policy "users and field agents create listings" on public.cow_listings for insert with check (((seller_id = auth.uid()) and public.current_role() in ('buyer', 'seller')) or ((field_agent_id = auth.uid()) and public.current_role() = 'field_agent'));
create policy "owners update listings" on public.cow_listings for update using (((seller_id = auth.uid() or field_agent_id = auth.uid()) and listing_status in ('draft','pending','rejected')) or public.current_role() = 'admin') with check (public.current_role() = 'admin' or listing_status <> 'approved');
create policy "admins delete listings" on public.cow_listings for delete using (public.current_role() = 'admin');
create policy "users view relevant profiles" on public.profiles for select using (id = auth.uid() or public.current_role() = 'admin' or exists (select 1 from public.cow_listings l where l.seller_id = profiles.id and l.listing_status = 'approved'));
create policy "users update own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));
create policy "images follow listing access" on public.cow_images for select using (exists (select 1 from public.cow_listings l where l.id = cow_listing_id and (l.listing_status = 'approved' or l.seller_id = auth.uid() or l.field_agent_id = auth.uid() or public.current_role() = 'admin')));
create policy "listing owners manage images" on public.cow_images for all using (exists (select 1 from public.cow_listings l where l.id = cow_listing_id and (l.seller_id = auth.uid() or l.field_agent_id = auth.uid() or public.current_role() = 'admin')));
create policy "users manage own favourites" on public.favourites for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "participants view enquiries" on public.enquiries for select using (buyer_id = auth.uid() or seller_id = auth.uid() or public.current_role() = 'admin');
create policy "users create enquiries" on public.enquiries for insert with check (buyer_id = auth.uid() and public.current_role() in ('buyer', 'seller'));
create policy "participants update enquiries" on public.enquiries for update using (buyer_id = auth.uid() or seller_id = auth.uid() or public.current_role() = 'admin');
create policy "participants view transactions" on public.transactions for select using (buyer_id = auth.uid() or seller_id = auth.uid() or public.current_role() = 'admin');
create policy "buyers create transactions" on public.transactions for insert with check (buyer_id = auth.uid());
create policy "admins manage commission" on public.commission_settings for all using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy "admins manage verification logs" on public.verification_logs for all using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy "users view own notifications" on public.notifications for select using (user_id = auth.uid() or public.current_role() = 'admin');
create policy "users update own notifications" on public.notifications for update using (user_id = auth.uid());

insert into public.commission_settings (minimum_price_lkr, maximum_price_lkr, commission_percentage, condition_adjustment)
values (0, 300000, 2.5, 0), (300000, 500000, 3.5, 0), (500000, null, 5, 0);

insert into storage.buckets (id, name, public) values ('cattle-images', 'cattle-images', true)
on conflict (id) do nothing;
create policy "public can view cattle images" on storage.objects for select
using (bucket_id = 'cattle-images');
create policy "listing owners upload cattle images" on storage.objects for insert
with check (bucket_id = 'cattle-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "listing owners delete cattle images" on storage.objects for delete
using (bucket_id = 'cattle-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- ===========================================================
-- 202511090002_shared_marketplace_accounts.sql
-- ===========================================================
drop policy if exists "sellers and field agents create listings" on public.cow_listings;
drop policy if exists "users and field agents create listings" on public.cow_listings;
create policy "users and field agents create listings"
  on public.cow_listings for insert
  with check (
    (seller_id = auth.uid() and public.current_role() in ('buyer', 'seller'))
    or (field_agent_id = auth.uid() and public.current_role() = 'field_agent')
  );

drop policy if exists "buyers create enquiries" on public.enquiries;
drop policy if exists "users create enquiries" on public.enquiries;
create policy "users create enquiries"
  on public.enquiries for insert
  with check (buyer_id = auth.uid() and public.current_role() in ('buyer', 'seller'));

-- ===========================================================
-- 202511090003_unified_user_accounts.sql
-- ===========================================================
drop policy if exists "public can view approved listings" on public.cow_listings;
drop policy if exists "users and field agents create listings" on public.cow_listings;
drop policy if exists "owners update listings" on public.cow_listings;
drop policy if exists "admins delete listings" on public.cow_listings;
drop policy if exists "users view relevant profiles" on public.profiles;
drop policy if exists "users update own profile" on public.profiles;
drop policy if exists "images follow listing access" on public.cow_images;
drop policy if exists "listing owners manage images" on public.cow_images;
drop policy if exists "users manage own favourites" on public.favourites;
drop policy if exists "participants view enquiries" on public.enquiries;
drop policy if exists "users create enquiries" on public.enquiries;
drop policy if exists "participants update enquiries" on public.enquiries;
drop policy if exists "participants view transactions" on public.transactions;
drop policy if exists "buyers create transactions" on public.transactions;
drop policy if exists "admins manage commission" on public.commission_settings;
drop policy if exists "admins manage verification logs" on public.verification_logs;
drop policy if exists "users view own notifications" on public.notifications;
drop policy if exists "users update own notifications" on public.notifications;
drop function if exists public.current_role();

alter type public.user_role rename to legacy_user_role;
create type public.user_role as enum ('user', 'field_agent', 'admin');
alter table public.profiles alter column role drop default;
alter table public.profiles alter column role type public.user_role
  using case when role::text in ('admin', 'field_agent') then role::text::public.user_role else 'user'::public.user_role end;
alter table public.profiles alter column role set default 'user'::public.user_role;
drop type public.legacy_user_role;

update public.profiles set email = '' where email is null;
alter table public.profiles alter column email set not null;
-- Profile completion is enforced by public.profile_is_complete() inside the
-- listing-creation policy, not by a table constraint: handle_new_user() inserts
-- a blank profile at sign-up, and a check constraint (even a NOT VALID one,
-- which still governs new rows) makes every registration fail with
-- "Database error saving new user".

create or replace function public.current_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.profile_is_complete(profile_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = profile_id
      and char_length(trim(full_name)) > 0
      and char_length(trim(coalesce(email, ''))) > 3
      and char_length(trim(phone_number)) > 0
      and char_length(trim(coalesce(district, ''))) > 0
      and char_length(trim(coalesce(city, ''))) > 0
  )
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone_number, email, role, district, city)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone_number', new.phone, ''),
    new.email,
    'user',
    nullif(new.raw_user_meta_data->>'district', ''),
    nullif(new.raw_user_meta_data->>'city', '')
  );
  return new;
end $$;

create policy "public can view approved listings" on public.cow_listings for select
using (listing_status = 'approved' or seller_id = auth.uid() or field_agent_id = auth.uid() or public.current_role() in ('admin', 'field_agent'));
create policy "complete users create listings" on public.cow_listings for insert
with check (seller_id = auth.uid() and public.current_role() = 'user' and public.profile_is_complete(auth.uid()));
create policy "owners update listings" on public.cow_listings for update
using ((seller_id = auth.uid() and listing_status in ('draft','pending','rejected')) or public.current_role() = 'admin')
with check (public.current_role() = 'admin' or (seller_id = auth.uid() and listing_status <> 'approved'));
create policy "admins delete listings" on public.cow_listings for delete using (public.current_role() = 'admin');
create policy "users view relevant profiles" on public.profiles for select using (id = auth.uid() or public.current_role() = 'admin' or exists (select 1 from public.cow_listings l where l.seller_id = profiles.id and l.listing_status = 'approved'));
create policy "users update own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));
create policy "images follow listing access" on public.cow_images for select using (exists (select 1 from public.cow_listings l where l.id = cow_listing_id and (l.listing_status = 'approved' or l.seller_id = auth.uid() or public.current_role() = 'admin')));
create policy "listing owners manage images" on public.cow_images for all using (exists (select 1 from public.cow_listings l where l.id = cow_listing_id and (l.seller_id = auth.uid() or public.current_role() = 'admin')));
create policy "users manage own favourites" on public.favourites for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "participants view enquiries" on public.enquiries for select using (buyer_id = auth.uid() or seller_id = auth.uid() or public.current_role() = 'admin');
create policy "users create enquiries" on public.enquiries for insert with check (buyer_id = auth.uid() and public.current_role() = 'user');
create policy "participants update enquiries" on public.enquiries for update using (buyer_id = auth.uid() or seller_id = auth.uid() or public.current_role() = 'admin');
create policy "participants view transactions" on public.transactions for select using (buyer_id = auth.uid() or seller_id = auth.uid() or public.current_role() = 'admin');
create policy "users create transactions" on public.transactions for insert with check (buyer_id = auth.uid() and public.current_role() = 'user');
create policy "admins manage commission" on public.commission_settings for all using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy "admins manage verification logs" on public.verification_logs for all using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy "users view own notifications" on public.notifications for select using (user_id = auth.uid() or public.current_role() = 'admin');
create policy "users update own notifications" on public.notifications for update using (user_id = auth.uid());

-- ===========================================================
-- 202611090001_realtime_messaging.sql
-- ===========================================================
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

-- ===========================================================
-- 202611090002_admin_management.sql
-- ===========================================================
alter table public.profiles
  add column if not exists is_suspended boolean not null default false,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspension_reason text;

create table if not exists public.seller_verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  documents jsonb not null default '[]'::jsonb,
  rejection_reason text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reported_user_id uuid references public.profiles(id),
  reported_listing_id uuid references public.cow_listings(id),
  reported_conversation_id uuid references public.conversations(id),
  reported_by uuid not null references public.profiles(id),
  category text not null,
  description text not null check (char_length(description) between 2 and 4000),
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'dismissed')),
  resolution_notes text,
  assigned_admin_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (reported_user_id is not null or reported_listing_id is not null or reported_conversation_id is not null)
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id),
  action_type text not null,
  target_entity text not null,
  target_id uuid,
  reason text,
  before_values jsonb,
  after_values jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 160),
  message text not null check (char_length(message) between 2 and 4000),
  audience text not null default 'all',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists seller_verification_status_idx on public.seller_verification_requests(status, created_at desc);
create index if not exists user_reports_status_idx on public.user_reports(status, created_at desc);
create index if not exists admin_audit_target_idx on public.admin_audit_logs(target_entity, target_id, created_at desc);

create or replace function public.admin_guard()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and not is_suspended
  )
$$;

create or replace function public.admin_review_listing(
  target_listing uuid,
  decision text,
  review_reason text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  before_row jsonb;
  next_status public.listing_status;
begin
  if not public.admin_guard() then raise exception 'Administrator access required'; end if;
  if decision not in ('approved', 'rejected') then raise exception 'Invalid listing decision'; end if;
  if decision = 'rejected' and coalesce(trim(review_reason), '') = '' then raise exception 'A rejection reason is required'; end if;
  select to_jsonb(l) into before_row from public.cow_listings l where l.id = target_listing for update;
  if before_row is null then raise exception 'Listing not found'; end if;
  next_status := decision::public.listing_status;
  update public.cow_listings
  set listing_status = next_status, verification_status = decision, rejection_reason = nullif(trim(review_reason), '')
  where id = target_listing;
  insert into public.verification_logs(listing_id, verified_by, previous_status, new_status, remarks)
  values (target_listing, auth.uid(), coalesce(before_row->>'listing_status', 'unknown'), decision, review_reason);
  insert into public.admin_audit_logs(admin_id, action_type, target_entity, target_id, reason, before_values, after_values)
  values (auth.uid(), 'listing_' || decision, 'cow_listing', target_listing, review_reason, before_row,
    jsonb_build_object('listing_status', decision, 'verification_status', decision, 'rejection_reason', nullif(trim(review_reason), '')));
end $$;

create or replace function public.admin_set_user_suspension(
  target_user uuid,
  should_suspend boolean,
  suspension_reason text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  before_row jsonb;
begin
  if not public.admin_guard() then raise exception 'Administrator access required'; end if;
  if target_user = auth.uid() then raise exception 'You cannot suspend your own administrator account'; end if;
  select jsonb_build_object('is_suspended', is_suspended, 'suspension_reason', suspension_reason)
  into before_row from public.profiles where id = target_user for update;
  if before_row is null then raise exception 'User not found'; end if;
  update public.profiles
  set is_suspended = should_suspend,
      suspended_at = case when should_suspend then now() else null end,
      suspension_reason = case when should_suspend then nullif(trim(suspension_reason), '') else null end
  where id = target_user;
  insert into public.admin_audit_logs(admin_id, action_type, target_entity, target_id, reason, before_values, after_values)
  values (auth.uid(), case when should_suspend then 'user_suspended' else 'user_reactivated' end, 'profile', target_user,
    suspension_reason, before_row, jsonb_build_object('is_suspended', should_suspend, 'suspension_reason', nullif(trim(suspension_reason), '')));
end $$;

create or replace function public.admin_update_report(
  target_report uuid,
  next_status text,
  resolution text default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.admin_guard() then raise exception 'Administrator access required'; end if;
  if next_status not in ('open', 'investigating', 'resolved', 'dismissed') then raise exception 'Invalid report status'; end if;
  update public.user_reports set status = next_status, resolution_notes = nullif(trim(resolution), ''), assigned_admin_id = auth.uid() where id = target_report;
  insert into public.admin_audit_logs(admin_id, action_type, target_entity, target_id, reason)
  values (auth.uid(), 'report_' || next_status, 'user_report', target_report, resolution);
end $$;

alter table public.seller_verification_requests enable row level security;
alter table public.user_reports enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.platform_announcements enable row level security;

create policy "admins manage seller verification" on public.seller_verification_requests
for all using (public.admin_guard()) with check (public.admin_guard());
create policy "reporters and admins view reports" on public.user_reports
for select using (reported_by = auth.uid() or public.admin_guard());
create policy "users create reports" on public.user_reports
for insert with check (reported_by = auth.uid());
create policy "admins update reports" on public.user_reports
for update using (public.admin_guard()) with check (public.admin_guard());
create policy "admins view audit logs" on public.admin_audit_logs
for select using (public.admin_guard());
create policy "admins create announcements" on public.platform_announcements
for all using (public.admin_guard()) with check (public.admin_guard());

-- ===========================================================
-- 202611090003_customer_admin_roles.sql
-- ===========================================================
-- Pasu now exposes two account types: customers and administrators.
-- Keep the legacy enum value and listing column for migration compatibility,
-- but normalize existing field-agent accounts to the customer role.
update public.profiles
set role = 'user'
where role::text = 'field_agent';

-- ===========================================================
-- 202611100001_storage_bucket.sql
-- ===========================================================
-- Storage for cattle listing photos.
-- Public read, owner-scoped writes. Upload paths are built as
-- {user_id}/{listing_id}/{index}-{filename}, so the first folder segment
-- must match the signed-in user.

insert into storage.buckets (id, name, public)
values ('cattle-images', 'cattle-images', true)
on conflict (id) do update set public = true;

drop policy if exists "public can view cattle images" on storage.objects;
drop policy if exists "listing owners upload cattle images" on storage.objects;
drop policy if exists "listing owners delete cattle images" on storage.objects;
drop policy if exists "cattle images are public" on storage.objects;
create policy "cattle images are public" on storage.objects
  for select using (bucket_id = 'cattle-images');

drop policy if exists "sellers upload cattle images" on storage.objects;
create policy "sellers upload cattle images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cattle-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "sellers update own cattle images" on storage.objects;
create policy "sellers update own cattle images" on storage.objects
  for update to authenticated
  using (bucket_id = 'cattle-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "sellers delete own cattle images" on storage.objects;
create policy "sellers delete own cattle images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'cattle-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- ===========================================================
-- 202611100002_seller_contact.sql
-- ===========================================================
-- Seller contact details.
--
-- The public catalogue shows a seller's name and whether they are verified, but
-- never their phone number. Phone numbers stay in public.profiles and are read
-- only through this function, which returns a row for the listing's seller or an
-- administrator and nothing at all for everyone else. Callers cannot tell the
-- difference between "not allowed" and "no number", which is the point.

create or replace function public.seller_contact(target_listing uuid)
returns table (full_name text, phone_number text)
language sql
stable
security definer
set search_path = public
as $$
  select p.full_name, p.phone_number
  from public.cow_listings l
  join public.profiles p on p.id = l.seller_id
  where l.id = target_listing
    and (l.seller_id = auth.uid() or public.admin_guard())
$$;

revoke all on function public.seller_contact(uuid) from public;
grant execute on function public.seller_contact(uuid) to authenticated;

-- ===========================================================
-- 202611100003_verification_flag.sql
-- ===========================================================
-- Seller verification.
--
-- public.profiles.is_verified is what the public listing query reads to decide
-- whether to show the "Verified seller" badge, but nothing in the application or
-- the schema ever wrote to it. These two functions are the only writers, and
-- both audit the change. Only administrators can call them.

create or replace function public.admin_set_seller_verification(
  target_user uuid,
  should_verify boolean
)
returns void language plpgsql security definer set search_path = public as $$
declare
  before_verified boolean;
begin
  if not public.admin_guard() then raise exception 'Administrator access required'; end if;
  select is_verified into before_verified from public.profiles where id = target_user for update;
  if before_verified is null then raise exception 'User not found'; end if;
  update public.profiles set is_verified = should_verify where id = target_user;
  insert into public.admin_audit_logs(admin_id, action_type, target_entity, target_id, before_values, after_values)
  values (auth.uid(), case when should_verify then 'seller_verified' else 'seller_unverified' end, 'profile', target_user,
    jsonb_build_object('is_verified', before_verified), jsonb_build_object('is_verified', should_verify));
end $$;

-- Reviewing a verification request decides the flag as well, so approving in the
-- queue is what makes the badge appear on the seller's listings.
create or replace function public.admin_review_verification(
  target_request uuid,
  decision text,
  review_reason text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  request_user uuid;
  before_status text;
  before_verified boolean;
begin
  if not public.admin_guard() then raise exception 'Administrator access required'; end if;
  if decision not in ('approved', 'rejected') then raise exception 'Invalid verification decision'; end if;
  if decision = 'rejected' and coalesce(trim(review_reason), '') = '' then raise exception 'A rejection reason is required'; end if;

  select r.user_id, r.status, p.is_verified
    into request_user, before_status, before_verified
    from public.seller_verification_requests r
    join public.profiles p on p.id = r.user_id
   where r.id = target_request
     for update of r;
  if request_user is null then raise exception 'Verification request not found'; end if;

  update public.seller_verification_requests
     set status = decision,
         rejection_reason = case when decision = 'rejected' then nullif(trim(review_reason), '') else null end,
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = target_request;

  update public.profiles set is_verified = (decision = 'approved') where id = request_user;

  insert into public.admin_audit_logs(admin_id, action_type, target_entity, target_id, reason, before_values, after_values)
  values (auth.uid(), 'verification_' || decision, 'seller_verification_request', target_request, review_reason,
    jsonb_build_object('status', before_status, 'is_verified', before_verified),
    jsonb_build_object('status', decision, 'is_verified', decision = 'approved'));
end $$;

revoke all on function public.admin_set_seller_verification(uuid, boolean) from public;
revoke all on function public.admin_review_verification(uuid, text, text) from public;
grant execute on function public.admin_set_seller_verification(uuid, boolean) to authenticated;
grant execute on function public.admin_review_verification(uuid, text, text) to authenticated;
