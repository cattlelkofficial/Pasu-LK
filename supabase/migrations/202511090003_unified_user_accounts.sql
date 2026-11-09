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
alter table public.profiles add constraint profiles_required_identity check (
  char_length(trim(full_name)) > 0 and
  char_length(trim(phone_number)) > 0 and
  char_length(trim(email)) > 3 and
  district is not null and char_length(trim(district)) > 0 and
  city is not null and char_length(trim(city)) > 0
) not valid;

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
