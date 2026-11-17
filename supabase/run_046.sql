-- (046) رسائل صوتية في الرسائل الخاصة والدردشات الجماعية.
-- الملف الصوتي بيترفع في نفس مخزن الصور (media)، والرسالة بتشيل رابطه ومدته بالثواني.
alter table public.dm_messages add column if not exists audio_url text;
alter table public.dm_messages add column if not exists audio_secs integer;
alter table public.dm_messages drop constraint if exists dm_audio_chk;
alter table public.dm_messages add constraint dm_audio_chk check (
  (audio_url is null and audio_secs is null)
  or (audio_url is not null and audio_secs is not null and audio_url ~ '^https://[^/]+/storage/v1/object/public/media/[^?#]+\.(webm|m4a|ogg)$' and audio_secs between 1 and 125));

alter table public.chat_room_messages add column if not exists audio_url text;
alter table public.chat_room_messages add column if not exists audio_secs integer;
alter table public.chat_room_messages drop constraint if exists crm_audio_chk;
alter table public.chat_room_messages add constraint crm_audio_chk check (
  (audio_url is null and audio_secs is null)
  or (audio_url is not null and audio_secs is not null and audio_url ~ '^https://[^/]+/storage/v1/object/public/media/[^?#]+\.(webm|m4a|ogg)$' and audio_secs between 1 and 125));

-- السماح برفع ملفات الصوت في المخزن (الحد الأقصى للملف زي ما هو: 5 ميجا)
update storage.buckets
set allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','audio/webm','audio/mp4','audio/ogg']
where id = 'media';
notify pgrst, 'reload schema';
