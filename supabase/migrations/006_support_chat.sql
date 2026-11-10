-- ============================================================
-- 006: محادثة الدعم مع "فريق جمعتنا" (للترقية وغيرها)
-- شغّله مرة واحدة في Supabase ← SQL Editor
-- ============================================================
create table if not exists public.support_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,   -- صاحب المحادثة (العميل)
  sender_id  uuid not null references public.profiles(id) on delete cascade,   -- مين كتب الرسالة
  from_staff boolean not null default false,
  body       text not null default '' check (char_length(body) <= 2000),
  image_url  text check (image_url is null or image_url ~ '^https://[^/]+/storage/v1/object/public/media/'),
  created_at timestamptz not null default now(),
  check (char_length(body) > 0 or image_url is not null)
);
create index if not exists support_user_idx on public.support_messages (user_id, created_at);
alter table public.support_messages enable row level security;

drop policy if exists sm_select on public.support_messages;
drop policy if exists sm_insert on public.support_messages;
-- العميل يشوف محادثته بس، والإدارة تشوف الكل
create policy sm_select on public.support_messages for select to authenticated
  using (user_id = auth.uid() or public.is_staff());
create policy sm_insert on public.support_messages for insert to authenticated
  with check (
    (user_id = auth.uid() and sender_id = auth.uid() and from_staff = false and not public.is_banned())
    or (public.is_staff() and sender_id = auth.uid() and from_staff = true)
  );

-- حد الرسائل للعملاء: 30 في الساعة (ضد الإزعاج)
create or replace function public.rate_limit_support() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not new.from_staff and
     (select count(*) from support_messages where sender_id = new.sender_id and not from_staff and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'رسائل كتير في وقت قصير، جرّب بعد شوية.';
  end if;
  return new;
end $$;
drop trigger if exists rate_limit_support_trg on public.support_messages;
create trigger rate_limit_support_trg before insert on public.support_messages
  for each row execute function public.rate_limit_support();

notify pgrst, 'reload schema';
