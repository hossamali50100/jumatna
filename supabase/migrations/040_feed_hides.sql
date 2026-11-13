-- (040) "عدم إظهار منشورات" شخص أو مجموعة في الصفحة الرئيسية (خاص بصاحبه بس، ويقدر يرجّعه).
create table if not exists public.feed_hides (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('user','group')),
  target_id  uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, target_id)
);
alter table public.feed_hides enable row level security;
drop policy if exists fh_select on public.feed_hides;
drop policy if exists fh_insert on public.feed_hides;
drop policy if exists fh_delete on public.feed_hides;
create policy fh_select on public.feed_hides for select to authenticated using (user_id = auth.uid());
create policy fh_insert on public.feed_hides for insert to authenticated with check (user_id = auth.uid() and target_id <> auth.uid());
create policy fh_delete on public.feed_hides for delete to authenticated using (user_id = auth.uid());
revoke all on public.feed_hides from anon, authenticated;
grant select, insert, delete on public.feed_hides to authenticated;
notify pgrst, 'reload schema';
