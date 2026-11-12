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
