-- ============================================================
-- جمعتنا — قاعدة البيانات + الحماية (Row Level Security)
-- شغّل الملف ده كله مرة واحدة في Supabase > SQL Editor > Run
-- ============================================================

-- ---------- الجداول ----------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null default 'مستخدم' check (char_length(name) between 1 and 60),
  avatar_url  text,
  role        text not null default 'user'  check (role in ('user','admin','mod','support')),
  plan        text not null default 'free'  check (plan in ('free','premium')),
  plan_until  timestamptz,
  banned      boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  name        text not null check (char_length(name) between 2 and 80),
  description text not null default '' check (char_length(description) <= 500),
  cover_url   text,
  privacy     text not null default 'public' check (privacy in ('public','private')),
  created_at  timestamptz not null default now()
);

create table public.group_members (
  group_id    uuid not null references public.groups(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text not null default 'member' check (role in ('owner','admin','member')),
  status      text not null default 'active' check (status in ('active','pending')),
  created_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.posts (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid references public.groups(id) on delete cascade,  -- فاضي = منشور شخصي على صفحة صاحبه
  author_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 5000),
  image_url   text,
  created_at  timestamptz not null default now()
);
create index posts_group_idx on public.posts (group_id, created_at desc);
create index posts_author_idx on public.posts (author_id, created_at desc);

create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index comments_post_idx on public.comments (post_id, created_at);
create index comments_author_idx on public.comments (author_id, created_at desc);

create table public.likes (
  post_id     uuid not null references public.posts(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  post_id     uuid references public.posts(id) on delete cascade,
  reason      text not null check (char_length(reason) between 2 and 500),
  status      text not null default 'open' check (status in ('open','done')),
  created_at  timestamptz not null default now()
);

-- ---------- دوال مساعدة (security definer عشان RLS ما تدخلش في دايرة) ----------
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('admin','mod','support'));
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_banned() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select banned from profiles where id = auth.uid()), true);
$$;

create or replace function public.is_member(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members
                 where group_id = gid and user_id = auth.uid() and status = 'active');
$$;

create or replace function public.is_group_admin(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members
                 where group_id = gid and user_id = auth.uid()
                   and status = 'active' and role in ('owner','admin'));
$$;

create or replace function public.group_is_public(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from groups where id = gid and privacy = 'public');
$$;

create or replace function public.can_see_post(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from posts p
                 where p.id = pid
                   and ( (p.group_id is null and (p.author_id = auth.uid() or public.is_staff()))
                      or (p.group_id is not null and (public.group_is_public(p.group_id) or public.is_member(p.group_id) or public.is_staff())) ));
$$;

-- ---------- Triggers ----------
-- 1) إنشاء بروفايل تلقائي أول ما حد يسجل (جوجل أو إيميل)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name, avatar_url)
  values (
    new.id,
    left(coalesce(nullif(new.raw_user_meta_data->>'full_name',''),
                  nullif(new.raw_user_meta_data->>'name',''),
                  split_part(new.email,'@',1), 'مستخدم'), 60),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) حد الإنشاء: مجاني = مجموعة واحدة، مميز = 10 (بيتفرض من السيرفر مش من الموقع)
create or replace function public.enforce_group_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p profiles%rowtype;
  lim int;
  cnt int;
begin
  select * into p from profiles where id = new.owner_id;
  if p.banned then raise exception 'الحساب محظور'; end if;
  if p.plan = 'premium' and (p.plan_until is null or p.plan_until > now()) then lim := 10; else lim := 1; end if;
  select count(*) into cnt from groups where owner_id = new.owner_id;
  if cnt >= lim then
    raise exception 'وصلت للحد الأقصى من المجموعات (%). رقّي حسابك لإنشاء المزيد.', lim;
  end if;
  return new;
end $$;
create trigger groups_limit before insert on public.groups
  for each row execute function public.enforce_group_limit();

-- 3) صاحب المجموعة يتضاف كعضو (owner) تلقائيًا
create or replace function public.add_owner_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into group_members (group_id, user_id, role, status) values (new.id, new.owner_id, 'owner', 'active');
  return new;
end $$;
create trigger groups_add_owner after insert on public.groups
  for each row execute function public.add_owner_member();

-- 4) منع السبام: حد أقصى للبوستات والتعليقات في الساعة
create or replace function public.rate_limit_posts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from posts where author_id = new.author_id and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'بوستات كتير في وقت قصير، جرّب بعد شوية.';
  end if;
  return new;
end $$;
create trigger posts_rate before insert on public.posts
  for each row execute function public.rate_limit_posts();

create or replace function public.rate_limit_comments() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from comments where author_id = new.author_id and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'تعليقات كتير في وقت قصير، جرّب بعد شوية.';
  end if;
  return new;
end $$;
create trigger comments_rate before insert on public.comments
  for each row execute function public.rate_limit_comments();

-- ---------- تفعيل الحماية على كل الجداول ----------
alter table public.profiles       enable row level security;
alter table public.groups         enable row level security;
alter table public.group_members  enable row level security;
alter table public.posts          enable row level security;
alter table public.comments       enable row level security;
alter table public.likes          enable row level security;
alter table public.reports        enable row level security;

-- ---------- الصلاحيات (policies) ----------
-- profiles: الكل المسجّل يشوف الأسماء؛ كل واحد يعدّل اسمه وصورته بس (مش الباقة ولا الصلاحية ولا الحظر)
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated, anon;
grant  update (name, avatar_url) on public.profiles to authenticated;
-- الأدمن يعدّل الباقة والحظر عن طريق دوال محمية (تحت)

-- groups
create policy groups_select on public.groups for select to authenticated
  using (privacy = 'public' or public.is_member(id) or public.is_staff());
create policy groups_insert on public.groups for insert to authenticated
  with check (owner_id = auth.uid() and not public.is_banned());
create policy groups_update on public.groups for update to authenticated
  using (public.is_group_admin(id) or public.is_admin())
  with check (public.is_group_admin(id) or public.is_admin());
create policy groups_delete on public.groups for delete to authenticated
  using (owner_id = auth.uid() or public.is_admin());

-- group_members
create policy gm_select on public.group_members for select to authenticated
  using (user_id = auth.uid() or public.group_is_public(group_id)
         or public.is_member(group_id) or public.is_staff());
create policy gm_join on public.group_members for insert to authenticated
  with check (
    user_id = auth.uid() and role = 'member' and not public.is_banned()
    and ( (public.group_is_public(group_id) and status = 'active')
       or (not public.group_is_public(group_id) and status = 'pending') )
  );
create policy gm_update on public.group_members for update to authenticated
  using (public.is_group_admin(group_id) and role <> 'owner')
  with check (public.is_group_admin(group_id) and role in ('admin','member'));
create policy gm_delete on public.group_members for delete to authenticated
  using ((user_id = auth.uid() and role <> 'owner') or public.is_group_admin(group_id) or public.is_admin());

-- posts
create policy posts_select on public.posts for select to authenticated
  using ( (group_id is null and (author_id = auth.uid() or public.is_staff()))
       or (group_id is not null and (public.group_is_public(group_id) or public.is_member(group_id) or public.is_staff())) );
create policy posts_insert on public.posts for insert to authenticated
  with check (author_id = auth.uid() and not public.is_banned()
              and (group_id is null or public.is_member(group_id)));
create policy posts_update on public.posts for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy posts_delete on public.posts for delete to authenticated
  using (author_id = auth.uid() or (group_id is not null and public.is_group_admin(group_id)) or public.is_staff());

-- comments
create policy comments_select on public.comments for select to authenticated
  using (public.can_see_post(post_id));
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = auth.uid() and not public.is_banned()
              and exists (select 1 from posts p where p.id = post_id
                          and ( (p.group_id is null and p.author_id = auth.uid())
                             or (p.group_id is not null and public.is_member(p.group_id)) )));
create policy comments_delete on public.comments for delete to authenticated
  using (author_id = auth.uid() or public.is_staff()
         or exists (select 1 from posts p where p.id = post_id
                    and (p.author_id = auth.uid() or (p.group_id is not null and public.is_group_admin(p.group_id)))));

-- likes
create policy likes_select on public.likes for select to authenticated using (public.can_see_post(post_id));
create policy likes_insert on public.likes for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from posts p where p.id = post_id
              and ( (p.group_id is null and p.author_id = auth.uid())
                 or (p.group_id is not null and public.is_member(p.group_id)) )));
create policy likes_delete on public.likes for delete to authenticated using (user_id = auth.uid());

-- reports: أي عضو يبلّغ، والإدارة بس هي اللي تشوف
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = auth.uid());
create policy reports_select on public.reports for select to authenticated using (public.is_staff());
create policy reports_update on public.reports for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ---------- دوال الإدارة (الأدمن بس، والتحقق من السيرفر) ----------
create or replace function public.admin_set_plan(target uuid, new_plan text, days int default 30)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  if new_plan not in ('free','premium') then raise exception 'باقة غير صحيحة'; end if;
  update profiles set plan = new_plan,
         plan_until = case when new_plan = 'premium' then now() + make_interval(days => days) else null end
   where id = target;
end $$;

create or replace function public.admin_set_banned(target uuid, flag boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'غير مسموح'; end if;
  if (select role from profiles where id = target) in ('admin','mod','support') then
    raise exception 'مينفعش تحظر حد من الإدارة';
  end if;
  update profiles set banned = flag where id = target;
end $$;

revoke all on function public.admin_set_plan(uuid,text,int) from public, anon;
revoke all on function public.admin_set_banned(uuid,boolean) from public, anon;
grant execute on function public.admin_set_plan(uuid,text,int) to authenticated;
grant execute on function public.admin_set_banned(uuid,boolean) to authenticated;

-- ---------- تخزين الصور ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

-- الرفع مسموح بس جوه فولدر باسم الـ id بتاع صاحب الصورة
create policy media_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy media_read on storage.objects for select using (bucket_id = 'media');

-- ---------- (003) الأصدقاء + دعوات المجموعات ----------

-- ---------- الأصدقاء ----------
create table if not exists public.friendships (
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','accepted')),
  created_at   timestamptz not null default now(),
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
-- يمنع تكرار نفس الزوج بالعكس (أ→ب و ب→أ)
create unique index if not exists friendships_pair_uniq on public.friendships
  (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_addressee_idx on public.friendships (addressee_id);
alter table public.friendships enable row level security;

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from friendships
                 where status = 'accepted'
                   and ((requester_id = a and addressee_id = b) or (requester_id = b and addressee_id = a)));
$$;

drop policy if exists fr_select on public.friendships;
drop policy if exists fr_insert on public.friendships;
drop policy if exists fr_update on public.friendships;
drop policy if exists fr_delete on public.friendships;
create policy fr_select on public.friendships for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid() or public.is_staff());
create policy fr_insert on public.friendships for insert to authenticated
  with check (requester_id = auth.uid() and status = 'pending' and not public.is_banned());
-- اللي اتبعتله الطلب بس هو اللي يقبل
create policy fr_update on public.friendships for update to authenticated
  using (addressee_id = auth.uid() and status = 'pending')
  with check (addressee_id = auth.uid() and status = 'accepted');
create policy fr_delete on public.friendships for delete to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());
revoke update on public.friendships from authenticated, anon;
grant  update (status) on public.friendships to authenticated;

-- ---------- دعوات المجموعات ----------
create table if not exists public.group_invites (
  group_id   uuid not null references public.groups(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, invitee_id),
  check (inviter_id <> invitee_id)
);
create index if not exists group_invites_invitee_idx on public.group_invites (invitee_id);
alter table public.group_invites enable row level security;

drop policy if exists gi_select on public.group_invites;
drop policy if exists gi_insert on public.group_invites;
drop policy if exists gi_delete on public.group_invites;
create policy gi_select on public.group_invites for select to authenticated
  using (inviter_id = auth.uid() or invitee_id = auth.uid() or public.is_staff());
-- تدعو بس لو: انت عضو في المجموعة + المدعو صديقك + مش عضو أصلًا
create policy gi_insert on public.group_invites for insert to authenticated
  with check (
    inviter_id = auth.uid() and not public.is_banned()
    and public.is_member(group_id)
    and public.are_friends(auth.uid(), invitee_id)
    and not exists (select 1 from group_members gm where gm.group_id = group_invites.group_id and gm.user_id = invitee_id)
  );
create policy gi_delete on public.group_invites for delete to authenticated
  using (invitee_id = auth.uid() or inviter_id = auth.uid() or public.is_group_admin(group_id));

-- حد الدعوات: 50 في الساعة (ضد الإزعاج)
create or replace function public.rate_limit_invites() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from group_invites where inviter_id = new.inviter_id and created_at > now() - interval '1 hour') >= 50 then
    raise exception 'دعوات كتير في وقت قصير، جرّب بعد شوية.';
  end if;
  return new;
end $$;
drop trigger if exists rate_limit_invites_trg on public.group_invites;
create trigger rate_limit_invites_trg before insert on public.group_invites
  for each row execute function public.rate_limit_invites();

-- قبول الدعوة: دالة محمية (المدعو ما يقدرش يضيف نفسه "نشط" في مجموعة خاصة بنفسه)
-- لو المجموعة خاصة والداعي مجرد عضو عادي → الطلب بيروح لموافقة المشرف
create or replace function public.accept_group_invite(gid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare inv group_invites; st text;
begin
  if public.is_banned() then raise exception 'الحساب محظور'; end if;
  select * into inv from group_invites where group_id = gid and invitee_id = auth.uid();
  if not found then raise exception 'الدعوة غير موجودة'; end if;
  if exists (select 1 from groups where id = gid and privacy = 'public')
     or exists (select 1 from group_members where group_id = gid and user_id = inv.inviter_id
                and status = 'active' and role in ('owner','admin')) then
    st := 'active';
  else
    st := 'pending';
  end if;
  insert into group_members (group_id, user_id, role, status) values (gid, auth.uid(), 'member', st)
    on conflict (group_id, user_id) do nothing;
  delete from group_invites where group_id = gid and invitee_id = auth.uid();
  return st;
end $$;
revoke all on function public.accept_group_invite(uuid) from public, anon;
grant execute on function public.accept_group_invite(uuid) to authenticated;

-- المدعو يقدر يشوف اسم المجموعة الخاصة اللي اتدعى لها
create or replace function public.is_invited(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_invites where group_id = gid and invitee_id = auth.uid());
$$;
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups for select to authenticated
  using (privacy = 'public' or public.is_member(id) or public.is_invited(id) or public.is_staff());

-- ---------- (004) الملف الشخصي ----------
alter table public.profiles add column if not exists bio text not null default '' check (char_length(bio) <= 300);
alter table public.profiles add column if not exists cover_url text;
grant update (bio, cover_url) on public.profiles to authenticated;

-- الأصدقاء المقبولين بيبانوا لأي مسجّل (زي قايمة الأصدقاء في فيسبوك)؛ الطلبات المعلّقة تفضل خاصة
drop policy if exists fr_select on public.friendships;
create policy fr_select on public.friendships for select to authenticated
  using (status = 'accepted' or requester_id = auth.uid() or addressee_id = auth.uid() or public.is_staff());

-- المنشور الشخصي يشوفه: صاحبه + أصدقاؤه + الإدارة
create or replace function public.can_see_post(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from posts p
                 where p.id = pid
                   and ( (p.group_id is null and (p.author_id = auth.uid() or public.are_friends(p.author_id, auth.uid()) or public.is_staff()))
                      or (p.group_id is not null and (public.group_is_public(p.group_id) or public.is_member(p.group_id) or public.is_staff())) ));
$$;
drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts for select to authenticated
  using ( (group_id is null and (author_id = auth.uid() or public.are_friends(author_id, auth.uid()) or public.is_staff()))
       or (group_id is not null and (public.group_is_public(group_id) or public.is_member(group_id) or public.is_staff())) );

-- الأصدقاء يقدروا يعملوا لايك وتعليق على المنشور الشخصي
drop policy if exists likes_insert on public.likes;
create policy likes_insert on public.likes for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from posts p where p.id = post_id
              and ( (p.group_id is null and (p.author_id = auth.uid() or public.are_friends(p.author_id, auth.uid())))
                 or (p.group_id is not null and public.is_member(p.group_id)) )));
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = auth.uid() and not public.is_banned()
              and exists (select 1 from posts p where p.id = post_id
                          and ( (p.group_id is null and (p.author_id = auth.uid() or public.are_friends(p.author_id, auth.uid())))
                             or (p.group_id is not null and public.is_member(p.group_id)) )));

-- ---------- (005) حذف الحساب ----------
alter table public.profiles add column if not exists deletion_requested_at timestamptz;
-- المستخدم ما يقدر يعدّل العمود ده مباشرة (الـ grant على أعمدة محددة بس) — بيتعدّل من الدوال تحت

-- طلب الحذف: بيطبّق على صاحب الجلسة بس (ما بياخدش id من برة)
create or replace function public.request_account_deletion() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'لازم تسجل دخول'; end if;
  if exists (select 1 from profiles where id = auth.uid() and role <> 'user') then
    raise exception 'حسابات الإدارة ما تتحذفش من هنا';
  end if;
  update profiles set deletion_requested_at = now() where id = auth.uid();
end $$;

-- إلغاء الحذف: بيتنادى أوتوماتيك لما الشخص يسجل دخول تاني
create or replace function public.cancel_account_deletion() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'لازم تسجل دخول'; end if;
  update profiles set deletion_requested_at = null where id = auth.uid();
end $$;

-- الحذف الفعلي: بيتشغّل من جدولة السيرفر بس (مش من الموقع)
create or replace function public.purge_deleted_accounts() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with gone as (
    delete from auth.users
    where id in (select id from public.profiles
                 where deletion_requested_at is not null
                   and deletion_requested_at <= now() - interval '24 hours'
                   and role = 'user')
    returning 1)
  select count(*) into n from gone;
  return n;
end $$;

revoke all on function public.request_account_deletion() from public, anon;
revoke all on function public.cancel_account_deletion()  from public, anon;
revoke all on function public.purge_deleted_accounts()   from public, anon, authenticated;
grant execute on function public.request_account_deletion() to authenticated;
grant execute on function public.cancel_account_deletion()  to authenticated;

-- جدولة: كل نص ساعة (محتاجة إضافة pg_cron؛ لو مش متاحة هتظهر ملاحظة ومش هيفشل الملف)
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('purge-deleted-accounts', '*/30 * * * *', 'select public.purge_deleted_accounts()');
exception when others then
  raise notice 'pg_cron مش متاحة: فعّلها من Database ← Extensions ثم شغّل الملف تاني. السبب: %', sqlerrm;
end $$;

notify pgrst, 'reload schema';

-- ---------- (006) محادثة الدعم ----------
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

-- ---------- (007) الرسائل المباشرة ----------
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

-- ============================================================
-- بعد ما تسجل أول مرة بحسابك، خليه أدمن (غيّر الإيميل بإيميلك):
--   update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'hossamali50100@gmail.com');
-- ============================================================
