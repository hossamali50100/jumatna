-- (041) الأدمن (دور admin بس — مش المشرف ولا الدعم) يقدر يشوف محادثات أي مستخدم من لوحة التحكم.
-- كل مرة بيتفتح فيها محتوى محادثة بيتسجّل في سجل الاطلاع (مين فتح محادثات مين ومتى) وبيظهر للأدمن.
create table if not exists public.admin_audit (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid not null references public.profiles(id) on delete cascade,
  action     text not null,
  subject_id uuid references public.profiles(id) on delete cascade,   -- صاحب الحساب اللي اتفتحت محادثاته
  other_id   uuid references public.profiles(id) on delete set null,  -- الطرف التاني (محادثة خاصة)
  room_id    uuid references public.chat_rooms(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_subject_idx on public.admin_audit (subject_id, created_at desc);
alter table public.admin_audit enable row level security;
drop policy if exists aa_select on public.admin_audit;
create policy aa_select on public.admin_audit for select to authenticated using (public.is_admin());
revoke all on public.admin_audit from anon, authenticated;
grant select on public.admin_audit to authenticated;

-- قايمة محادثات المستخدم (خاصة + جماعية) من غير محتوى
create or replace function public.admin_user_chats(p_user uuid)
returns table (kind text, other_id uuid, room_id uuid, title text, avatar text, last_body text, last_at timestamptz, msg_count bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'مش مسموح'; end if;
  return query
  with d as (
    select case when m.sender_id = p_user then m.recipient_id else m.sender_id end as o, m.body, m.image_url, m.created_at
    from dm_messages m where m.sender_id = p_user or m.recipient_id = p_user
  ), dd as (
    select o, count(*) as c, max(created_at) as la,
           (array_agg(coalesce(nullif(body,''), 'صورة') order by created_at desc))[1] as lb
    from d group by o
  )
  select 'dm'::text, dd.o, null::uuid, p.name, p.avatar_url, dd.lb, dd.la, dd.c
  from dd left join profiles p on p.id = dd.o
  union all
  select 'room'::text, null::uuid, r.id, r.name, r.avatar_url,
         (select coalesce(nullif(x.body,''), 'صورة') from chat_room_messages x where x.room_id = r.id order by x.created_at desc limit 1),
         (select max(x.created_at) from chat_room_messages x where x.room_id = r.id),
         (select count(*) from chat_room_messages x where x.room_id = r.id)
  from chat_rooms r join chat_room_members cm on cm.room_id = r.id and cm.user_id = p_user
  order by 7 desc nulls last;
end $$;
revoke all on function public.admin_user_chats(uuid) from public, anon;
grant execute on function public.admin_user_chats(uuid) to authenticated;

-- رسائل محادثة خاصة بين اتنين (بتتسجّل في سجل الاطلاع)
create or replace function public.admin_dm_messages(p_user uuid, p_other uuid)
returns table (id uuid, sender_id uuid, body text, image_url text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'مش مسموح'; end if;
  insert into admin_audit(admin_id, action, subject_id, other_id) values (auth.uid(), 'view_dm', p_user, p_other);
  return query select m.id, m.sender_id, m.body, m.image_url, m.created_at from dm_messages m
    where (m.sender_id = p_user and m.recipient_id = p_other) or (m.sender_id = p_other and m.recipient_id = p_user)
    order by m.created_at asc limit 500;
end $$;
revoke all on function public.admin_dm_messages(uuid, uuid) from public, anon;
grant execute on function public.admin_dm_messages(uuid, uuid) to authenticated;

-- رسائل شات جماعي (بتتسجّل)
create or replace function public.admin_room_messages(p_user uuid, p_room uuid)
returns table (id uuid, sender_id uuid, sender_name text, body text, image_url text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'مش مسموح'; end if;
  insert into admin_audit(admin_id, action, subject_id, room_id) values (auth.uid(), 'view_room', p_user, p_room);
  return query select m.id, m.sender_id, p.name, m.body, m.image_url, m.created_at from chat_room_messages m
    left join profiles p on p.id = m.sender_id where m.room_id = p_room order by m.created_at asc limit 500;
end $$;
revoke all on function public.admin_room_messages(uuid, uuid) from public, anon;
grant execute on function public.admin_room_messages(uuid, uuid) to authenticated;
notify pgrst, 'reload schema';
