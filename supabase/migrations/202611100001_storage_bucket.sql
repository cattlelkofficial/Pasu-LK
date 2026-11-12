-- Storage for cattle listing photos.
-- Public read, owner-scoped writes. Upload paths are built as
-- {user_id}/{listing_id}/{index}-{filename}, so the first folder segment
-- must match the signed-in user.

insert into storage.buckets (id, name, public)
values ('cattle-images', 'cattle-images', true)
on conflict (id) do update set public = true;

drop policy if exists "cattle images are public" on storage.objects;
create policy "cattle images are public" on storage.objects
  for select using (bucket_id = 'cattle-images');

drop policy if exists "sellers upload cattle images" on storage.objects;
create policy "sellers upload cattle images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cattle-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "sellers update own cattle images" on storage.objects;
create policy "sellers update own cattle images" on storage.objects
  for update to authenticated
  using (bucket_id = 'cattle-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "sellers delete own cattle images" on storage.objects;
create policy "sellers delete own cattle images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'cattle-images' and (storage.foldername(name))[1] = auth.uid()::text);
