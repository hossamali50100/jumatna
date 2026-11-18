-- (052) "إلغاء الإرسال لديك": الرسالة بتختفي عندك بس (على كل أجهزتك)، والطرف التاني يفضل شايفها.
create table if not exists public.message_hides (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  msg_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, msg_id)
);
alter table public.message_hides enable row level security;
drop policy if exists message_hides_select on public.message_hides;
create policy message_hides_select on public.message_hides for select to authenticated using (user_id = auth.uid());
drop policy if exists message_hides_insert on public.message_hides;
create policy message_hides_insert on public.message_hides for insert to authenticated with check (user_id = auth.uid());
drop policy if exists message_hides_delete on public.message_hides;
create policy message_hides_delete on public.message_hides for delete to authenticated using (user_id = auth.uid());
grant select, insert, delete on public.message_hides to authenticated;
notify pgrst, 'reload schema';
