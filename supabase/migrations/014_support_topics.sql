-- (014) موضوع رسالة الدعم (مشكلة في المنصة / اقتراح / استفسار ...) عشان يظهر لفريق الدعم
alter table public.support_messages add column if not exists topic text;
alter table public.support_messages drop constraint if exists support_messages_topic_check;
alter table public.support_messages add constraint support_messages_topic_check
  check (topic is null or topic in ('bug','suggestion','question','account','report','premium','other'));
notify pgrst, 'reload schema';
