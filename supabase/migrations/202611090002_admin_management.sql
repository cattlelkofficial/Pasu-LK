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
