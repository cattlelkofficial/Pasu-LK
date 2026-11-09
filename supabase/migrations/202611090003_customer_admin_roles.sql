-- Pasu now exposes two account types: customers and administrators.
-- Keep the legacy enum value and listing column for migration compatibility,
-- but normalize existing field-agent accounts to the customer role.
update public.profiles
set role = 'user'
where role::text = 'field_agent';
