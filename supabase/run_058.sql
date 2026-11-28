-- (058) الرد على رسالة معيّنة (زي ماسنجر) في الرسايل الخاصة والشات الجماعي
-- لو الرسالة الأصلية اتمسحت، الرد بيفضل موجود بس من غير الاقتباس.
alter table public.dm_messages add column if not exists reply_to uuid references public.dm_messages(id) on delete set null;
alter table public.chat_room_messages add column if not exists reply_to uuid references public.chat_room_messages(id) on delete set null;

-- الرد لازم يكون على رسالة من نفس المحادثة (مايتعملش على رسالة من محادثة حد تاني)
create or replace function public.check_dm_reply() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.reply_to is not null and not exists (
    select 1 from dm_messages r where r.id = new.reply_to
      and ((r.sender_id = new.sender_id and r.recipient_id = new.recipient_id)
        or (r.sender_id = new.recipient_id and r.recipient_id = new.sender_id))) then
    raise exception 'الرسالة اللي بترد عليها مش في المحادثة دي.';
  end if;
  return new;
end $$;
drop trigger if exists check_dm_reply_trg on public.dm_messages;
create trigger check_dm_reply_trg before insert or update of reply_to on public.dm_messages
  for each row execute function public.check_dm_reply();

create or replace function public.check_room_reply() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.reply_to is not null and not exists (
    select 1 from chat_room_messages r where r.id = new.reply_to and r.room_id = new.room_id) then
    raise exception 'الرسالة اللي بترد عليها مش في المحادثة دي.';
  end if;
  return new;
end $$;
drop trigger if exists check_room_reply_trg on public.chat_room_messages;
create trigger check_room_reply_trg before insert or update of reply_to on public.chat_room_messages
  for each row execute function public.check_room_reply();

notify pgrst, 'reload schema';
