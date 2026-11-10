-- ============================================================
-- 008: علامة "رسالة جديدة" (غير مقروءة)
-- شغّله مرة واحدة في Supabase ← SQL Editor
-- ============================================================
alter table public.dm_messages add column if not exists read_at timestamptz;
create index if not exists dm_unread_idx on public.dm_messages (recipient_id) where read_at is null;

-- المستلم بس يقدر يعلّم رسالة إنها اتقرت، وده العمود الوحيد اللي يقدر يعدّله
drop policy if exists dm_update on public.dm_messages;
create policy dm_update on public.dm_messages for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
revoke update on public.dm_messages from authenticated, anon;
grant update (read_at) on public.dm_messages to authenticated;

notify pgrst, 'reload schema';
