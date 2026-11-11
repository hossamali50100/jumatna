-- (018) محادثات دعم بجلسات: كل زيارة = محادثة جديدة، وبتتقفل بزرار "إنهاء" أو تلقائيًا بعد 30 دقيقة من آخر نشاط
create table if not exists public.support_chats (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  channel          text not null default 'support' check (channel in ('support','upgrade')),
  status           text not null default 'open' check (status in ('open','closed')),
  closed_by        text check (closed_by in ('user','staff','system')),
  created_at       timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  closed_at        timestamptz
);
create index if not exists support_chats_user_idx on public.support_chats (user_id, channel, status);
create index if not exists support_chats_act_idx on public.support_chats (last_activity_at);
alter table public.support_chats enable row level security;
drop policy if exists sc_select on public.support_chats;
create policy sc_select on public.support_chats for select to authenticated
  using (user_id = auth.uid() or public.is_staff());
grant select on public.support_chats to authenticated;

alter table public.support_messages add column if not exists chat_id uuid references public.support_chats(id) on delete cascade;
create index if not exists support_msg_chat_idx on public.support_messages (chat_id, created_at);

-- الرسائل القديمة: كل (عميل + قناة) يبقى محادثة مقفولة في السجل
with g as (
  select user_id, channel, gen_random_uuid() as id, min(created_at) as c, max(created_at) as l
  from public.support_messages where chat_id is null group by user_id, channel
), ins as (
  insert into public.support_chats(id, user_id, channel, status, closed_by, created_at, last_activity_at, closed_at)
  select id, user_id, channel, 'closed', 'system', c, l, l from g returning id, user_id, channel
)
update public.support_messages m set chat_id = ins.id
  from ins where m.user_id = ins.user_id and m.channel = ins.channel and m.chat_id is null;

-- كل رسالة جديدة لازم تكون في محادثة مفتوحة، وبتجدّد وقت آخر نشاط
create or replace function public.support_msg_chat() returns trigger
language plpgsql security definer set search_path = public as $$
declare c public.support_chats%rowtype;
begin
  if new.chat_id is null then
    select * into c from support_chats
      where user_id = new.user_id and channel = new.channel and status = 'open'
        and last_activity_at > now() - interval '30 minutes'
      order by last_activity_at desc limit 1;
    if not found then
      if new.from_staff then raise exception 'المحادثة مقفولة'; end if;
      insert into support_chats(user_id, channel) values (new.user_id, new.channel) returning * into c;
    end if;
    new.chat_id := c.id;
  else
    select * into c from support_chats where id = new.chat_id;
    if not found or c.user_id <> new.user_id or c.channel <> new.channel then raise exception 'محادثة غير صحيحة'; end if;
    if c.status <> 'open' then raise exception 'المحادثة مقفولة'; end if;
    if c.last_activity_at < now() - interval '30 minutes' then raise exception 'المحادثة اتقفلت تلقائيًا لعدم النشاط'; end if;
  end if;
  update support_chats set last_activity_at = now() where id = c.id;
  return new;
end $$;
drop trigger if exists support_msg_chat_trg on public.support_messages;
create trigger support_msg_chat_trg before insert on public.support_messages
  for each row execute function public.support_msg_chat();

-- بدء محادثة جديدة (بحد أقصى 10 محادثات في الساعة)
create or replace function public.start_support_chat(p_channel text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'سجّل دخول الأول'; end if;
  if public.is_banned() then raise exception 'الحساب محظور'; end if;
  if p_channel not in ('support','upgrade') then raise exception 'محادثة غير صحيحة'; end if;
  if (select count(*) from support_chats where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'محادثات كتير في وقت قصير، جرّب بعد شوية.';
  end if;
  insert into support_chats(user_id, channel) values (auth.uid(), p_channel) returning id into cid;
  return cid;
end $$;

-- إنهاء محادثة: صاحبها أو الفريق
create or replace function public.close_support_chat(p_chat uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c public.support_chats%rowtype;
begin
  select * into c from support_chats where id = p_chat;
  if not found then raise exception 'المحادثة مش موجودة'; end if;
  if c.user_id <> auth.uid() and not public.is_staff() then raise exception 'غير مسموح'; end if;
  if c.status = 'open' then
    update support_chats set status = 'closed', closed_at = now(),
      closed_by = case when c.user_id = auth.uid() then 'user' else 'staff' end where id = p_chat;
  end if;
end $$;

-- قفل تلقائي لأي محادثة ماحصلش فيها نشاط 30 دقيقة (بيتنادى من الموقع وبيشتغل بدون pg_cron)
create or replace function public.support_sweep() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then return 0; end if;
  update support_chats set status = 'closed', closed_by = 'system', closed_at = now()
    where status = 'open' and last_activity_at < now() - interval '30 minutes';
  get diagnostics n = row_count;
  return n;
end $$;

-- حذف محادثة: صاحبها أو الفريق
create or replace function public.delete_support_chat(p_chat uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from support_chats where id = p_chat and (user_id = auth.uid() or public.is_staff())) then
    raise exception 'غير مسموح';
  end if;
  delete from support_chats where id = p_chat;
end $$;

-- مسح كل محادثات قناة معينة (يمسح الجلسات والرسائل معًا)
create or replace function public.clear_support_chat(p_user uuid, p_channel text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'سجّل دخول الأول'; end if;
  if p_channel not in ('support','upgrade') then raise exception 'محادثة غير صحيحة'; end if;
  if p_user <> auth.uid() and not public.is_staff() then raise exception 'غير مسموح'; end if;
  delete from support_chats where user_id = p_user and channel = p_channel;
  delete from support_messages where user_id = p_user and channel = p_channel;
end $$;

revoke all on function public.start_support_chat(text), public.close_support_chat(uuid), public.support_sweep(), public.delete_support_chat(uuid) from public, anon;
grant execute on function public.start_support_chat(text), public.close_support_chat(uuid), public.support_sweep(), public.delete_support_chat(uuid) to authenticated;
notify pgrst, 'reload schema';
