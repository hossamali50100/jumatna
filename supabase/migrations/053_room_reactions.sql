-- (053) التفاعل بالإيموجي على رسايل الدردشات الجماعية (زي الرسائل الخاصة). أعضاء الشات بس.
create table if not exists public.room_reactions (
  message_id uuid not null references public.chat_room_messages(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 8),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.room_reactions enable row level security;
drop policy if exists rr_select on public.room_reactions;
drop policy if exists rr_insert on public.room_reactions;
drop policy if exists rr_update on public.room_reactions;
drop policy if exists rr_delete on public.room_reactions;
create policy rr_select on public.room_reactions for select to authenticated
  using (exists (select 1 from public.chat_room_messages m where m.id = message_id and public.is_room_member(m.room_id, auth.uid())));
create policy rr_insert on public.room_reactions for insert to authenticated
  with check (user_id = auth.uid() and not public.is_banned()
    and exists (select 1 from public.chat_room_messages m where m.id = message_id and public.is_room_member(m.room_id, auth.uid())));
create policy rr_update on public.room_reactions for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.chat_room_messages m where m.id = message_id and public.is_room_member(m.room_id, auth.uid())));
create policy rr_delete on public.room_reactions for delete to authenticated using (user_id = auth.uid());
revoke all on public.room_reactions from anon, authenticated;
grant select, insert, delete on public.room_reactions to authenticated;
grant update (emoji) on public.room_reactions to authenticated;
do $$ begin
  begin alter publication supabase_realtime add table public.room_reactions;
  exception when duplicate_object then null; when undefined_object then null; end;
end $$;
notify pgrst, 'reload schema';
