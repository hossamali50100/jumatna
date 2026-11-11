-- (031) مجموعات الشات (دردشة جماعية بالاسم والصورة، زي ماسنجر)
create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  avatar_url text check (avatar_url is null or avatar_url ~ '^https://[^/]+/storage/v1/object/public/media/'),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.chat_room_members (
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists crm_user_idx on public.chat_room_members (user_id);
create table if not exists public.chat_room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 2000),
  image_url text check (image_url is null or image_url ~ '^https://[^/]+/storage/v1/object/public/media/'),
  created_at timestamptz not null default now(),
  check (char_length(body) > 0 or image_url is not null)
);
create index if not exists crmsg_room_idx on public.chat_room_messages (room_id, created_at);

create or replace function public.is_room_member(r uuid, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from chat_room_members where room_id = r and user_id = u);
$$;
revoke all on function public.is_room_member(uuid, uuid) from public, anon;
grant execute on function public.is_room_member(uuid, uuid) to authenticated;

alter table public.chat_rooms enable row level security;
alter table public.chat_room_members enable row level security;
alter table public.chat_room_messages enable row level security;
drop policy if exists cr_select on public.chat_rooms;
drop policy if exists crm_select on public.chat_room_members;
drop policy if exists crm_update on public.chat_room_members;
drop policy if exists crmsg_select on public.chat_room_messages;
drop policy if exists crmsg_insert on public.chat_room_messages;
drop policy if exists crmsg_delete on public.chat_room_messages;
create policy cr_select on public.chat_rooms for select to authenticated using (public.is_room_member(id, auth.uid()));
create policy crm_select on public.chat_room_members for select to authenticated using (public.is_room_member(room_id, auth.uid()));
create policy crm_update on public.chat_room_members for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy crmsg_select on public.chat_room_messages for select to authenticated using (public.is_room_member(room_id, auth.uid()));
create policy crmsg_insert on public.chat_room_messages for insert to authenticated
  with check (sender_id = auth.uid() and not public.is_banned() and public.is_room_member(room_id, auth.uid()));
create policy crmsg_delete on public.chat_room_messages for delete to authenticated using (sender_id = auth.uid());
revoke all on public.chat_rooms, public.chat_room_members, public.chat_room_messages from anon, authenticated;
grant select on public.chat_rooms, public.chat_room_members to authenticated;
grant update (last_read_at) on public.chat_room_members to authenticated;
grant select, insert, delete on public.chat_room_messages to authenticated;

create or replace function public.rate_limit_room_msg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from chat_room_messages where sender_id = new.sender_id and created_at > now() - interval '1 hour') >= 120 then
    raise exception 'رسائل كتير في وقت قصير، جرّب بعد شوية.';
  end if;
  return new;
end $$;
drop trigger if exists rate_limit_room_msg_trg on public.chat_room_messages;
create trigger rate_limit_room_msg_trg before insert on public.chat_room_messages for each row execute function public.rate_limit_room_msg();

-- إنشاء مجموعة شات: لازم اسم + صديقين على الأقل (من أصدقائك بس)، وبحد أقصى 30 عضو
create or replace function public.create_chat_room(p_name text, p_avatar text, p_members uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); rid uuid; m uuid; others uuid[];
begin
  if me is null or public.is_banned() then raise exception 'مش مسموح'; end if;
  if char_length(btrim(coalesce(p_name,''))) < 1 then raise exception 'اكتب اسم للمجموعة'; end if;
  select coalesce(array_agg(distinct x), '{}') into others from unnest(p_members) x where x <> me;
  if coalesce(array_length(others,1),0) < 2 then raise exception 'اختار صديقين على الأقل'; end if;
  if array_length(others,1) > 29 then raise exception 'الحد الأقصى 30 عضو'; end if;
  foreach m in array others loop
    if not public.are_friends(me, m) or public.blocked_between(me, m) then raise exception 'تقدر تضيف أصدقاءك بس'; end if;
  end loop;
  insert into chat_rooms(name, avatar_url, created_by) values (btrim(p_name), nullif(p_avatar,''), me) returning id into rid;
  insert into chat_room_members(room_id, user_id) values (rid, me);
  foreach m in array others loop insert into chat_room_members(room_id, user_id) values (rid, m); end loop;
  return rid;
end $$;

create or replace function public.add_room_members(p_room uuid, p_members uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); m uuid;
begin
  if me is null or not public.is_room_member(p_room, me) then raise exception 'مش مسموح'; end if;
  if (select count(*) from chat_room_members where room_id = p_room) + coalesce(array_length(p_members,1),0) > 30 then raise exception 'الحد الأقصى 30 عضو'; end if;
  foreach m in array p_members loop
    if not public.are_friends(me, m) or public.blocked_between(me, m) then raise exception 'تقدر تضيف أصدقاءك بس'; end if;
    insert into chat_room_members(room_id, user_id) values (p_room, m) on conflict do nothing;
  end loop;
end $$;

create or replace function public.update_chat_room(p_room uuid, p_name text, p_avatar text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_room_member(p_room, auth.uid()) then raise exception 'مش مسموح'; end if;
  update chat_rooms set name = coalesce(nullif(btrim(p_name),''), name), avatar_url = coalesce(nullif(p_avatar,''), avatar_url) where id = p_room;
end $$;

create or replace function public.leave_chat_room(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from chat_room_members where room_id = p_room and user_id = auth.uid();
  if not exists (select 1 from chat_room_members where room_id = p_room) then delete from chat_rooms where id = p_room; end if;
end $$;

-- مجموع الرسائل غير المقروءة في مجموعات الشات (للعدّاد فوق)
create or replace function public.room_unread_total() returns bigint
language sql stable security definer set search_path = public as $$
  select count(*) from chat_room_messages m join chat_room_members me on me.room_id = m.room_id and me.user_id = auth.uid()
  where m.sender_id <> auth.uid() and m.created_at > me.last_read_at;
$$;
revoke all on function public.create_chat_room(text,text,uuid[]), public.add_room_members(uuid,uuid[]), public.update_chat_room(uuid,text,text), public.leave_chat_room(uuid), public.room_unread_total() from public, anon;
grant execute on function public.create_chat_room(text,text,uuid[]), public.add_room_members(uuid,uuid[]), public.update_chat_room(uuid,text,text), public.leave_chat_room(uuid), public.room_unread_total() to authenticated;

do $$ begin
  begin alter publication supabase_realtime add table public.chat_room_messages;
  exception when duplicate_object then null; when undefined_object then null; end;
end $$;
notify pgrst, 'reload schema';
