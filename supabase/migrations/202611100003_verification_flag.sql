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
