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
create policy "owners update listings" on public.cow_listings for update using ((seller_id = auth.uid() or field_agent_id = auth.uid()) and listing_status in ('draft','pending','rejected')) or public.current_role() = 'admin' with check (public.current_role() = 'admin' or listing_status <> 'approved');
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
using (bucket_id = 'cattle-images' and owner_id = auth.uid()::text);
