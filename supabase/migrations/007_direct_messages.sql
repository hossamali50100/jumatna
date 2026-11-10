-- ============================================================
-- 007: الرسائل المباشرة بين الأعضاء (من غير ما يكونوا أصدقاء)
-- شغّله مرة واحدة في Supabase ← SQL Editor
-- ============================================================
create table if not exists public.dm_messages (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body         text not null default '' check (char_length(body) <= 2000),
  image_url    text check (image_url is null or image_url ~ '^https://[^/]+/storage/v1/object/public/media/'),
  created_at   timestamptz not null default now(),
  check (sender_id <> recipient_id),
  check (char_length(body) > 0 or image_url is not null)
);
create index if not exists dm_sender_idx    on public.dm_messages (sender_id, created_at);
create index if not exists dm_recipient_idx on public.dm_messages (recipient_id, created_at);
alter table public.dm_messages enable row level security;

drop policy if exists dm_select on public.dm_messages;
drop policy if exists dm_insert on public.dm_messages;
-- الرسالة يشوفها المرسل والمستلم بس (حتى الإدارة ما تقرأش الرسائل الخاصة)
create policy dm_select on public.dm_messages for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());
create policy dm_insert on public.dm_messages for insert to authenticated
  with check (sender_id = auth.uid() and not public.is_banned());

-- حد الرسائل: 60 في الساعة (ضد الإزعاج والسبام)
create or replace function public.rate_limit_dm() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from dm_messages where sender_id = new.sender_id and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'رسائل كتير في وقت قصير، جرّب بعد شوية.';
  end if;
  return new;
end $$;
drop trigger if exists rate_limit_dm_trg on public.dm_messages;
create trigger rate_limit_dm_trg before insert on public.dm_messages
  for each row execute function public.rate_limit_dm();

notify pgrst, 'reload schema';
