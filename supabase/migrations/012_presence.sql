-- (012) النقطة الخضراء (متصل الآن): كل مستخدم بيسجّل "آخر ظهور" كل دقيقة وهو فاتح الموقع.
-- آخر ظهور بيشوفه صاحبه وأصدقاؤه والإدارة بس (مش الغرباء).
create table if not exists public.presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_seen timestamptz not null default now()
);
alter table public.presence enable row level security;
drop policy if exists presence_select on public.presence;
drop policy if exists presence_insert on public.presence;
drop policy if exists presence_update on public.presence;
create policy presence_select on public.presence for select to authenticated
  using (user_id = auth.uid() or public.are_friends(user_id, auth.uid()) or public.is_staff());
create policy presence_insert on public.presence for insert to authenticated
  with check (user_id = auth.uid());
create policy presence_update on public.presence for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.presence from anon, authenticated;
grant select, insert on public.presence to authenticated;
grant update (last_seen) on public.presence to authenticated;
notify pgrst, 'reload schema';
