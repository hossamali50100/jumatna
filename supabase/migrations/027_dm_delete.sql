-- (027) حذف الرسائل الخاصة: المرسل بس يقدر يمسح رسالته (بتتمسح عند الطرفين)
drop policy if exists dm_delete on public.dm_messages;
create policy dm_delete on public.dm_messages for delete to authenticated using (sender_id = auth.uid());
grant delete on public.dm_messages to authenticated;
notify pgrst, 'reload schema';
