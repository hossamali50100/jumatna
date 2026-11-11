-- (026) رسائل لحظية: نضيف جدول الرسائل لقناة Realtime (آمن لو متضافة قبل كده)
do $$ begin
  begin alter publication supabase_realtime add table public.dm_messages;
  exception when duplicate_object then null; when undefined_object then null; end;
end $$;
