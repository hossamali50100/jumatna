-- (029) تفاعل بإيموجي على الرسائل الخاصة (يشوفه الطرفين بس)
create table if not exists public.dm_reactions (
  message_id uuid not null references public.dm_messages(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 8),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.dm_reactions enable row level security;
drop policy if exists dmr_select on public.dm_reactions;
drop policy if exists dmr_insert on public.dm_reactions;
drop policy if exists dmr_update on public.dm_reactions;
drop policy if exists dmr_delete on public.dm_reactions;
create policy dmr_select on public.dm_reactions for select to authenticated
  using (exists (select 1 from public.dm_messages m where m.id = message_id and (m.sender_id = auth.uid() or m.recipient_id = auth.uid())));
create policy dmr_insert on public.dm_reactions for insert to authenticated
  with check (user_id = auth.uid() and not public.is_banned()
    and exists (select 1 from public.dm_messages m where m.id = message_id and (m.sender_id = auth.uid() or m.recipient_id = auth.uid())));
create policy dmr_update on public.dm_reactions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy dmr_delete on public.dm_reactions for delete to authenticated using (user_id = auth.uid());
revoke all on public.dm_reactions from anon, authenticated;
grant select, insert, delete on public.dm_reactions to authenticated;
grant update (emoji) on public.dm_reactions to authenticated;
do $$ begin
  begin alter publication supabase_realtime add table public.dm_reactions;
  exception when duplicate_object then null; when undefined_object then null; end;
end $$;
notify pgrst, 'reload schema';
