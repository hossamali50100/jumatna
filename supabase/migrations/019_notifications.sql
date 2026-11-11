-- (019) الإشعارات: إعجاب/تعليق/رد على بوستك، طلبات الصداقة، دعوات المجموعات وطلبات الانضمام
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,   -- اللي بيستلم الإشعار
  actor_id   uuid references public.profiles(id) on delete cascade,            -- اللي عمل الحدث
  type       text not null check (type in ('post_like','post_comment','comment_reply','comment_like','friend_request','friend_accept','group_invite','group_join')),
  post_id    uuid references public.posts(id) on delete cascade,
  group_id   uuid references public.groups(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create unique index if not exists notifications_dedupe_idx on public.notifications
  (user_id, actor_id, type, coalesce(post_id,'00000000-0000-0000-0000-000000000000'::uuid), coalesce(group_id,'00000000-0000-0000-0000-000000000000'::uuid), coalesce(comment_id,'00000000-0000-0000-0000-000000000000'::uuid));
alter table public.notifications enable row level security;
drop policy if exists n_select on public.notifications;
drop policy if exists n_update on public.notifications;
drop policy if exists n_delete on public.notifications;
create policy n_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy n_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy n_delete on public.notifications for delete to authenticated using (user_id = auth.uid());
revoke update on public.notifications from authenticated, anon;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create or replace function public.push_notif(p_user uuid, p_actor uuid, p_type text, p_post uuid, p_group uuid, p_comment uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_user = p_actor then return; end if;
  insert into notifications(user_id, actor_id, type, post_id, group_id, comment_id)
    values (p_user, p_actor, p_type, p_post, p_group, p_comment) on conflict do nothing;
end $$;
revoke all on function public.push_notif(uuid,uuid,text,uuid,uuid,uuid) from public, anon, authenticated;

-- إعجاب على بوست
create or replace function public.trg_notif_like() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform push_notif((select author_id from posts where id = new.post_id), new.user_id, 'post_like', new.post_id, null, null);
  return new;
end $$;
drop trigger if exists notif_like_trg on public.likes;
create trigger notif_like_trg after insert on public.likes for each row execute function public.trg_notif_like();

-- تعليق أو رد
create or replace function public.trg_notif_comment() returns trigger language plpgsql security definer set search_path = public as $$
declare pa uuid; ca uuid;
begin
  select author_id into pa from posts where id = new.post_id;
  if new.parent_id is not null then
    select author_id into ca from comments where id = new.parent_id;
    perform push_notif(ca, new.author_id, 'comment_reply', new.post_id, null, new.id);
    if pa is distinct from ca then perform push_notif(pa, new.author_id, 'post_comment', new.post_id, null, new.id); end if;
  else
    perform push_notif(pa, new.author_id, 'post_comment', new.post_id, null, new.id);
  end if;
  return new;
end $$;
drop trigger if exists notif_comment_trg on public.comments;
create trigger notif_comment_trg after insert on public.comments for each row execute function public.trg_notif_comment();

-- إعجاب على تعليق
create or replace function public.trg_notif_clike() returns trigger language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select author_id, post_id into c from comments where id = new.comment_id;
  perform push_notif(c.author_id, new.user_id, 'comment_like', c.post_id, null, new.comment_id);
  return new;
end $$;
drop trigger if exists notif_clike_trg on public.comment_likes;
create trigger notif_clike_trg after insert on public.comment_likes for each row execute function public.trg_notif_clike();

-- صداقة: طلب جديد / قبول
create or replace function public.trg_notif_friend() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform push_notif(new.addressee_id, new.requester_id, 'friend_request', null, null, null);
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status <> 'accepted' then
    perform push_notif(new.requester_id, new.addressee_id, 'friend_accept', null, null, null);
  end if;
  return new;
end $$;
drop trigger if exists notif_friend_trg on public.friendships;
create trigger notif_friend_trg after insert or update on public.friendships for each row execute function public.trg_notif_friend();

-- دعوة لمجموعة
create or replace function public.trg_notif_invite() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform push_notif(new.invitee_id, new.inviter_id, 'group_invite', null, new.group_id, null);
  return new;
end $$;
drop trigger if exists notif_invite_trg on public.group_invites;
create trigger notif_invite_trg after insert on public.group_invites for each row execute function public.trg_notif_invite();

-- طلب انضمام لمجموعة (بيوصل لصاحب المجموعة)
create or replace function public.trg_notif_join() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pending' then
    perform push_notif((select owner_id from groups where id = new.group_id), new.user_id, 'group_join', null, new.group_id, null);
  end if;
  return new;
end $$;
drop trigger if exists notif_join_trg on public.group_members;
create trigger notif_join_trg after insert on public.group_members for each row execute function public.trg_notif_join();
notify pgrst, 'reload schema';
