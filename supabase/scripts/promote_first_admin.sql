-- Promote the first administrator.
--
-- There is no public admin registration flow, so the first admin is created by
-- running this once in the Supabase SQL editor as the project owner, or with the
-- service-role key from a trusted machine. Never expose it through the app.
--
-- Order matters: the account must register normally first, because the sign-up
-- trigger creates its row in public.profiles. Then set the email below to that
-- account and run the script.

do $$
declare
  target_email text := 'owner@example.com';  -- change this
  target_id uuid;
begin
  select id into target_id
    from public.profiles
   where lower(email) = lower(target_email)
   order by created_at
   limit 1;

  if target_id is null then
    raise exception 'No profile found for % — register that account first', target_email;
  end if;

  update public.profiles
     set role = 'admin'
   where id = target_id;

  raise notice 'Promoted % (%) to administrator', target_email, target_id;
end $$;

-- Confirm the result. Exactly one admin should appear here.
select id, email, full_name, role, is_suspended
  from public.profiles
 where role = 'admin'
 order by created_at;

-- Further admins: repeat the update above with the next account's email, or
-- promote from the dashboard. The role column is an enum
-- (user | field_agent | admin); customers are 'user' and must be 'user'.
