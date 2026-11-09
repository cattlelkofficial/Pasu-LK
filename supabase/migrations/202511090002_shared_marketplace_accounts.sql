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
