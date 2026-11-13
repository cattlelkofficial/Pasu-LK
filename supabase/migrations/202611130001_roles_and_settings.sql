-- Roles and platform settings.
--
-- The requirement list asks for user_roles and platform_settings. Both already
-- had a home: profiles.role holds the single role an account can carry, and
-- commission_settings holds the pricing rules. Rather than duplicate the role
-- model and risk two sources of truth, user_roles is an auditable mirror of
-- profiles.role that only the database writes, and platform_settings covers the
-- remaining key/value platform configuration that no table modelled.

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.user_role not null,
  granted_by uuid references public.profiles(id),
  granted_at timestamptz not null default now(),
  unique (user_id, role)
);

create index if not exists user_roles_user_idx on public.user_roles(user_id);
create index if not exists user_roles_role_idx on public.user_roles(role);

-- profiles.role is the column every policy and the client read. Keep it as the
-- fast lookup and mirror it here so role changes leave a trail with a timestamp
-- and the administrator who made them.
create or replace function public.sync_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_roles (user_id, role, granted_by)
  values (new.id, new.role, case when new.role = 'admin' then auth.uid() else null end)
  on conflict (user_id, role) do nothing;

  delete from public.user_roles
  where user_id = new.id
    and role <> new.role
    and role <> 'admin';

  if new.role <> 'admin' then
    delete from public.user_roles where user_id = new.id and role = 'admin';
  end if;
  return new;
end $$;

drop trigger if exists profiles_sync_user_roles on public.profiles;
create trigger profiles_sync_user_roles
after insert or update of role on public.profiles
for each row execute function public.sync_profile_role();

insert into public.user_roles (user_id, role)
select id, role from public.profiles
on conflict (user_id, role) do nothing;

alter table public.user_roles enable row level security;

drop policy if exists "users view own roles" on public.user_roles;
create policy "users view own roles" on public.user_roles
  for select using (user_id = auth.uid() or public.admin_guard());

-- No insert, update or delete policy exists on purpose: roles change only
-- through the function below, which checks administrator access itself.

create or replace function public.admin_grant_role(target_user uuid, new_role public.user_role)
returns void language plpgsql security definer set search_path = public as $$
declare
  before_role public.user_role;
begin
  if not public.admin_guard() then raise exception 'Administrator access required'; end if;
  if target_user = auth.uid() and new_role <> 'admin' then
    raise exception 'You cannot remove your own administrator access';
  end if;
  select role into before_role from public.profiles where id = target_user for update;
  if before_role is null then raise exception 'User not found'; end if;
  update public.profiles set role = new_role where id = target_user;
  insert into public.admin_audit_logs (admin_id, action_type, target_entity, target_id, before_values, after_values)
  values (auth.uid(), 'role_granted', 'profile', target_user,
    jsonb_build_object('role', before_role), jsonb_build_object('role', new_role));
end $$;

revoke all on function public.admin_grant_role(uuid, public.user_role) from public;
grant execute on function public.admin_grant_role(uuid, public.user_role) to authenticated;

create table if not exists public.platform_settings (
  key text primary key check (char_length(key) between 2 and 80),
  value jsonb not null default '{}'::jsonb,
  description text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

alter table public.platform_settings enable row level security;

drop policy if exists "admins manage platform settings" on public.platform_settings;
create policy "admins manage platform settings" on public.platform_settings
  for all using (public.admin_guard()) with check (public.admin_guard());

-- Non-administrators may read a single setting through this function, which is
-- how the client picks up things like the support address without exposing the
-- whole table.
create or replace function public.platform_setting(setting_key text)
returns jsonb language sql stable security definer set search_path = public as $$
  select value from public.platform_settings where key = setting_key
$$;

revoke all on function public.platform_setting(text) from public;
grant execute on function public.platform_setting(text) to anon, authenticated;

create or replace function public.admin_set_platform_setting(setting_key text, setting_value jsonb, setting_description text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.admin_guard() then raise exception 'Administrator access required'; end if;
  insert into public.platform_settings (key, value, description, updated_by, updated_at)
  values (setting_key, setting_value, setting_description, auth.uid(), now())
  on conflict (key) do update
    set value = excluded.value,
        description = coalesce(excluded.description, public.platform_settings.description),
        updated_by = auth.uid(),
        updated_at = now();
  insert into public.admin_audit_logs (admin_id, action_type, target_entity, target_id, after_values)
  values (auth.uid(), 'platform_setting_changed', 'platform_setting', null,
    jsonb_build_object('key', setting_key, 'value', setting_value));
end $$;

revoke all on function public.admin_set_platform_setting(text, jsonb, text) from public;
grant execute on function public.admin_set_platform_setting(text, jsonb, text) to authenticated;

insert into public.platform_settings (key, value, description) values
  ('support_email', '"hello@pasu.lk"'::jsonb, 'Address shown on public support pages'),
  ('listing_requires_approval', 'true'::jsonb, 'New listings stay pending until an administrator approves them'),
  ('max_listing_images', '6'::jsonb, 'How many photos a seller may attach to one listing')
on conflict (key) do nothing;

-- conversation_reports was created with policies in an earlier migration; make
-- sure RLS is on here too so the file stands on its own if it is ever replayed.
alter table public.conversation_reports enable row level security;
