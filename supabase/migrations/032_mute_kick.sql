-- (032) كتم إشعارات محادثة (شخص أو مجموعة شات) + طرد عضو من مجموعة الشات (للي أنشأها بس)
create table if not exists public.chat_mutes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  chat_key text not null check (char_length(chat_key) between 1 and 60),
  created_at timestamptz not null default now(),
  primary key (user_id, chat_key)
);
alter table public.chat_mutes enable row level security;
drop policy if exists cmu_select on public.chat_mutes;
drop policy if exists cmu_insert on public.chat_mutes;
drop policy if exists cmu_delete on public.chat_mutes;
create policy cmu_select on public.chat_mutes for select to authenticated using (user_id = auth.uid());
create policy cmu_insert on public.chat_mutes for insert to authenticated with check (user_id = auth.uid());
create policy cmu_delete on public.chat_mutes for delete to authenticated using (user_id = auth.uid());
revoke all on public.chat_mutes from anon, authenticated;
grant select, insert, delete on public.chat_mutes to authenticated;

-- أي عضو يضيف ناس (من أصدقائه)، لكن اللي أنشأ المجموعة بس هو اللي يطرد
create or replace function public.remove_room_member(p_room uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_user = auth.uid() then raise exception 'مش مسموح'; end if;
  if not exists (select 1 from chat_rooms where id = p_room and created_by = auth.uid()) then raise exception 'اللي أنشأ المجموعة بس يقدر يطرد'; end if;
  delete from chat_room_members where room_id = p_room and user_id = p_user;
end $$;
revoke all on function public.remove_room_member(uuid, uuid) from public, anon;
grant execute on function public.remove_room_member(uuid, uuid) to authenticated;
notify pgrst, 'reload schema';
