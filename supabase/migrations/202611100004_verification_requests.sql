-- Seller-initiated verification requests.
--
-- Until now only administrators could touch this table, so there was no way for a
-- seller to ask for verification in the first place. Sellers may now insert their
-- own pending request and read their own history; approval stays with
-- admin_review_verification(), which is the only path that sets is_verified.

drop policy if exists "sellers request verification" on public.seller_verification_requests;
create policy "sellers request verification" on public.seller_verification_requests
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and reviewed_by is null);

drop policy if exists "sellers view own verification" on public.seller_verification_requests;
create policy "sellers view own verification" on public.seller_verification_requests
  for select to authenticated
  using (user_id = auth.uid());

-- One open request per seller: a unique index stops a queue full of duplicates
-- even if the client tries twice.
drop index if exists public.seller_verification_one_pending;
create unique index seller_verification_one_pending
  on public.seller_verification_requests (user_id)
  where status = 'pending';
