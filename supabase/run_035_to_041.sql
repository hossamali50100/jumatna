-- شغّل الملف ده كله مرة واحدة في Supabase > SQL Editor (بيجمع تحديثات 035 لحد 041 بالترتيب)

-- ===== 035_presence_rpc =====
-- (035) متصل / غير متصل — حل أقوى: النبضة والقراية بقوا دوال على السيرفر
-- (مش بيعتمدوا على صلاحيات الجدول)، والوقت كله من السيرفر.
create or replace function public.heartbeat() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.presence(user_id, last_seen) values (auth.uid(), now())
  on conflict (user_id) do update set last_seen = now();
end $$;
revoke all on function public.heartbeat() from public, anon;
grant execute on function public.heartbeat() to authenticated;

-- الأصدقاء المتصلين دلوقتي (آخر نبضة من أقل من 100 ثانية)
create or replace function public.online_friends() returns setof uuid
language sql stable security definer set search_path = public as $$
  select p.user_id from public.presence p
  where auth.uid() is not null and p.last_seen > now() - interval '100 seconds'
    and p.user_id <> auth.uid() and public.are_friends(p.user_id, auth.uid())
    and not public.blocked_between(p.user_id, auth.uid())
$$;
revoke all on function public.online_friends() from public, anon;
grant execute on function public.online_friends() to authenticated;
notify pgrst, 'reload schema';

-- ===== 036_post_images =====
-- (036) أكتر من صورة في المنشور الواحد (حد أقصى 4):
-- الصورة الأولى في image_url زي الأول، والباقي (لحد 3) في extra_images.
create or replace function public.valid_media_urls(u text[]) returns boolean
language sql immutable as $$
  select coalesce(bool_and(x ~ '^https://[^/]+/storage/v1/object/public/media/'), true) from unnest(u) x
$$;
alter table public.posts add column if not exists extra_images text[] not null default '{}';
alter table public.posts drop constraint if exists posts_extra_images_chk;
alter table public.posts add constraint posts_extra_images_chk
  check (cardinality(extra_images) <= 3 and public.valid_media_urls(extra_images)
         and (cardinality(extra_images) = 0 or image_url is not null));
notify pgrst, 'reload schema';

-- ===== 037_group_post_approval =====
-- (037) موافقة مشرف المجموعة على البوستات:
--  المشرف يقدر يفعّل "الموافقة قبل النشر" (أو يسيبها مفتوحة). لو مفعّلة، بوست أي عضو عادي
--  بيفضل "بانتظار الموافقة" ومش بيظهر غير لصاحبه والمشرفين لحد ما المشرف يوافق (أو يرفض فيتحذف).
alter table public.groups add column if not exists require_approval boolean not null default false;
alter table public.posts  add column if not exists approval text not null default 'approved';
alter table public.posts  drop constraint if exists posts_approval_chk;
alter table public.posts  add constraint posts_approval_chk check (approval in ('approved','pending'));
create index if not exists posts_pending_idx on public.posts (group_id, created_at desc) where approval = 'pending';

-- السيرفر هو اللي بيحدد حالة البوست (العضو ميقدرش يوافق على بوست نفسه)
create or replace function public.posts_set_approval() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.approval := 'approved';
    if new.group_id is not null
       and exists (select 1 from groups g where g.id = new.group_id and g.require_approval)
       and not exists (select 1 from group_members m where m.group_id = new.group_id and m.user_id = new.author_id
                         and m.status = 'active' and m.role in ('owner','admin')) then
      new.approval := 'pending';
    end if;
  elsif new.approval is distinct from old.approval and coalesce(current_setting('app.review', true), '') <> '1' then
    new.approval := old.approval;
  end if;
  return new;
end $$;
drop trigger if exists posts_set_approval_trg on public.posts;
create trigger posts_set_approval_trg before insert or update on public.posts
  for each row execute function public.posts_set_approval();

-- لو المشرف قفل خاصية الموافقة: كل البوستات المعلّقة تتنشر
create or replace function public.groups_release_pending() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.require_approval and not new.require_approval then
    perform set_config('app.review', '1', true);
    update posts set approval = 'approved' where group_id = new.id and approval = 'pending';
    perform set_config('app.review', '', true);
  end if;
  return new;
end $$;
drop trigger if exists groups_release_pending_trg on public.groups;
create trigger groups_release_pending_trg after update of require_approval on public.groups
  for each row execute function public.groups_release_pending();

-- موافقة (true) أو رفض (false = البوست يتحذف)
create or replace function public.review_post(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  select group_id into gid from posts where id = p_id and approval = 'pending';
  if gid is null then raise exception 'البوست ده مش بانتظار موافقة'; end if;
  if not (public.is_group_admin(gid) or public.is_staff()) then raise exception 'مش مسموح'; end if;
  if p_approve then
    perform set_config('app.review', '1', true);
    update posts set approval = 'approved', created_at = now() where id = p_id;
    perform set_config('app.review', '', true);
  else
    delete from posts where id = p_id;
  end if;
end $$;
revoke all on function public.review_post(uuid, boolean) from public, anon;
grant execute on function public.review_post(uuid, boolean) to authenticated;

-- البوست المعلّق يشوفه صاحبه والمشرفين والإدارة بس
create or replace function public.can_see_post(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from posts p
                 where p.id = pid
                   and ( (p.ad_id is not null and (public.ad_live(p.ad_id) or public.is_staff()))
                      or (p.ad_id is null and p.group_id is null and (p.author_id = auth.uid() or public.are_friends(p.author_id, auth.uid()) or public.is_staff()))
                      or (p.group_id is not null and (public.group_is_public(p.group_id) or public.is_member(p.group_id) or public.is_staff())
                          and (p.approval = 'approved' or p.author_id = auth.uid() or public.is_group_admin(p.group_id) or public.is_staff())) ));
$$;
drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts for select to authenticated
  using ( (ad_id is not null and (public.ad_live(ad_id) or public.is_staff()))
       or (ad_id is null and group_id is null and (author_id = auth.uid() or public.are_friends(author_id, auth.uid()) or public.is_staff()))
       or (group_id is not null and (public.group_is_public(group_id) or public.is_member(group_id) or public.is_staff())
           and (approval = 'approved' or author_id = auth.uid() or public.is_group_admin(group_id) or public.is_staff())) );
notify pgrst, 'reload schema';

-- ===== 038_dm_delivered =====
-- (038) علامات الرسائل: ✓ اتبعتت — ✓✓ وصلت للطرف التاني — ✓✓ خضرا اتقرت
alter table public.dm_messages add column if not exists delivered_at timestamptz;
-- المستلم (جهازه/موقعه المفتوح) بيعلّم رسايله إنها "وصلت"
create or replace function public.mark_delivered() returns void
language sql security definer set search_path = public as $$
  update public.dm_messages set delivered_at = now()
  where recipient_id = auth.uid() and delivered_at is null
$$;
revoke all on function public.mark_delivered() from public, anon;
grant execute on function public.mark_delivered() to authenticated;
notify pgrst, 'reload schema';

-- ===== 039_notif_prefs =====
-- (039) تحكم في الإشعارات: كل واحد يقفل أي نوع إشعار (أو الكل) من إعدادات الإشعارات.
create table if not exists public.notification_prefs (
  user_id uuid not null references public.profiles(id) on delete cascade,
  type    text not null check (type in ('all','post_like','post_comment','comment_reply','comment_like','friend_request','friend_accept','group_invite','group_join')),
  enabled boolean not null default true,
  primary key (user_id, type)
);
alter table public.notification_prefs enable row level security;
drop policy if exists np_select on public.notification_prefs;
drop policy if exists np_insert on public.notification_prefs;
drop policy if exists np_update on public.notification_prefs;
create policy np_select on public.notification_prefs for select to authenticated using (user_id = auth.uid());
create policy np_insert on public.notification_prefs for insert to authenticated with check (user_id = auth.uid());
create policy np_update on public.notification_prefs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.notification_prefs from anon, authenticated;
grant select, insert, update on public.notification_prefs to authenticated;
grant update (enabled) on public.notification_prefs to authenticated;

-- السيرفر مايبعتش إشعار النوع اللي المستخدم قافله (أو لو قافل الكل)
create or replace function public.push_notif(p_user uuid, p_actor uuid, p_type text, p_post uuid, p_group uuid, p_comment uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_user = p_actor then return; end if;
  if exists (select 1 from notification_prefs where user_id = p_user and type in (p_type, 'all') and not enabled) then return; end if;
  insert into notifications(user_id, actor_id, type, post_id, group_id, comment_id)
    values (p_user, p_actor, p_type, p_post, p_group, p_comment) on conflict do nothing;
end $$;
revoke all on function public.push_notif(uuid,uuid,text,uuid,uuid,uuid) from public, anon, authenticated;
notify pgrst, 'reload schema';

-- ===== 040_feed_hides =====
-- (040) "عدم إظهار منشورات" شخص أو مجموعة في الصفحة الرئيسية (خاص بصاحبه بس، ويقدر يرجّعه).
create table if not exists public.feed_hides (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('user','group')),
  target_id  uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, target_id)
);
alter table public.feed_hides enable row level security;
drop policy if exists fh_select on public.feed_hides;
drop policy if exists fh_insert on public.feed_hides;
drop policy if exists fh_delete on public.feed_hides;
create policy fh_select on public.feed_hides for select to authenticated using (user_id = auth.uid());
create policy fh_insert on public.feed_hides for insert to authenticated with check (user_id = auth.uid() and target_id <> auth.uid());
create policy fh_delete on public.feed_hides for delete to authenticated using (user_id = auth.uid());
revoke all on public.feed_hides from anon, authenticated;
grant select, insert, delete on public.feed_hides to authenticated;
notify pgrst, 'reload schema';

-- ===== 041_admin_chats =====
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
