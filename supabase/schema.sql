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

-- ---------- (008) رسائل غير مقروءة ----------
alter table public.dm_messages add column if not exists read_at timestamptz;
create index if not exists dm_unread_idx on public.dm_messages (recipient_id) where read_at is null;

-- المستلم بس يقدر يعلّم رسالة إنها اتقرت، وده العمود الوحيد اللي يقدر يعدّله
drop policy if exists dm_update on public.dm_messages;
create policy dm_update on public.dm_messages for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
revoke update on public.dm_messages from authenticated, anon;
grant update (read_at) on public.dm_messages to authenticated;

notify pgrst, 'reload schema';

-- ============================================================
-- ---------- (009) المالك يشوف مجموعته (إصلاح إنشاء المجموعة الخاصة) ----------
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups for select to authenticated
  using (privacy = 'public' or owner_id = auth.uid() or public.is_member(id) or public.is_invited(id) or public.is_staff());

-- ---------- (010) قفل الحساب الشخصي ----------
-- ومايشوفش الأصدقاء ولا المجموعات. أصحابك والإدارة يشوفوا كل حاجة.
alter table public.profiles add column if not exists is_locked boolean not null default false;
grant update (is_locked) on public.profiles to authenticated;

-- هل المستخدم الحالي يقدر يشوف تفاصيل الشخص ده (أصدقاءه ومجموعاته)؟
create or replace function public.can_see_details(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select uid = auth.uid()
      or public.is_staff()
      or not coalesce((select is_locked from profiles where id = uid), false)
      or public.are_friends(uid, auth.uid());
$$;
grant execute on function public.can_see_details(uuid) to authenticated;

-- الصداقات المقبولة: تبان بس لو الطرفين مش مقفولين (أو أنا طرف فيها أو صديق للمقفول)
drop policy if exists fr_select on public.friendships;
create policy fr_select on public.friendships for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid() or public.is_staff()
         or (status = 'accepted' and public.can_see_details(requester_id) and public.can_see_details(addressee_id)));

-- عضوية المجموعات: عضو المقفول يختفي عن الغرباء (أعضاء نفس المجموعة يشوفوا بعض)
drop policy if exists gm_select on public.group_members;
create policy gm_select on public.group_members for select to authenticated
  using (user_id = auth.uid() or public.is_staff() or public.is_member(group_id)
         or (public.group_is_public(group_id) and public.can_see_details(user_id)));
notify pgrst, 'reload schema';

-- ---------- (012) متصل الآن ----------
-- آخر ظهور بيشوفه صاحبه وأصدقاؤه والإدارة بس (مش الغرباء).
create table if not exists public.presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_seen timestamptz not null default now()
);
alter table public.presence enable row level security;
drop policy if exists presence_select on public.presence;
drop policy if exists presence_insert on public.presence;
drop policy if exists presence_update on public.presence;
create policy presence_select on public.presence for select to authenticated
  using (user_id = auth.uid() or public.are_friends(user_id, auth.uid()) or public.is_staff());
create policy presence_insert on public.presence for insert to authenticated
  with check (user_id = auth.uid());
create policy presence_update on public.presence for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.presence from anon, authenticated;
grant select, insert on public.presence to authenticated;
grant update (last_seen) on public.presence to authenticated;
notify pgrst, 'reload schema';

-- ---------- (013) الرد على التعليقات والإعجاب بها ----------
alter table public.comments add column if not exists parent_id uuid references public.comments(id) on delete cascade;
create index if not exists comments_parent_idx on public.comments (parent_id);

-- الرد يبقى على مستوى واحد بس، وعلى تعليق في نفس البوست
create or replace function public.check_comment_parent() returns trigger
language plpgsql security definer set search_path = public as $$
declare pp comments;
begin
  if new.parent_id is null then return new; end if;
  select * into pp from comments where id = new.parent_id;
  if not found or pp.post_id <> new.post_id or pp.parent_id is not null then
    raise exception 'الرد لازم يكون على تعليق رئيسي في نفس البوست.';
  end if;
  return new;
end $$;
drop trigger if exists comments_parent_trg on public.comments;
create trigger comments_parent_trg before insert on public.comments
  for each row execute function public.check_comment_parent();

-- مين يقدر يتفاعل (لايك) مع بوست: صاحبه وأصدقاؤه (شخصي) أو أعضاء المجموعة
create or replace function public.can_interact_post(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from posts p where p.id = pid
    and ( (p.group_id is null and (p.author_id = auth.uid() or public.are_friends(p.author_id, auth.uid())))
       or (p.group_id is not null and public.is_member(p.group_id)) ));
$$;
create or replace function public.comment_post(cid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select post_id from comments where id = cid;
$$;
grant execute on function public.can_interact_post(uuid), public.comment_post(uuid) to authenticated;

create table if not exists public.comment_likes (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
alter table public.comment_likes enable row level security;
drop policy if exists cl_select on public.comment_likes;
drop policy if exists cl_insert on public.comment_likes;
drop policy if exists cl_delete on public.comment_likes;
create policy cl_select on public.comment_likes for select to authenticated
  using (public.can_see_post(public.comment_post(comment_id)));
create policy cl_insert on public.comment_likes for insert to authenticated
  with check (user_id = auth.uid() and not public.is_banned() and public.can_interact_post(public.comment_post(comment_id)));
create policy cl_delete on public.comment_likes for delete to authenticated
  using (user_id = auth.uid());
revoke all on public.comment_likes from anon, authenticated;
grant select, insert, delete on public.comment_likes to authenticated;
notify pgrst, 'reload schema';

-- ---------- (014) مواضيع الدعم ----------
alter table public.support_messages add column if not exists topic text;
alter table public.support_messages drop constraint if exists support_messages_topic_check;
alter table public.support_messages add constraint support_messages_topic_check
  check (topic is null or topic in ('bug','suggestion','question','account','report','premium','other'));
notify pgrst, 'reload schema';

-- (015) لوحة الإدارة: إعدادات المنصة (الاسم/الشعار) + تغيير الأدوار (للأدمن بس)
create table if not exists public.platform_settings (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.platform_settings enable row level security;
drop policy if exists ps_select on public.platform_settings;
drop policy if exists ps_write  on public.platform_settings;
create policy ps_select on public.platform_settings for select to anon, authenticated using (true);
create policy ps_write  on public.platform_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
insert into public.platform_settings(key, value) values ('name','جمعتنا'), ('logo_url','')
  on conflict (key) do nothing;

create or replace function public.admin_set_role(target uuid, new_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  if new_role not in ('user','mod','support','admin') then raise exception 'دور غير صحيح'; end if;
  if target = auth.uid() then raise exception 'مينفعش تغيّر دورك أنت'; end if;
  update profiles set role = new_role where id = target;
end $$;
revoke all on function public.admin_set_role(uuid,text) from public, anon;
grant execute on function public.admin_set_role(uuid,text) to authenticated;
notify pgrst, 'reload schema';

-- (016) أول دخول: الاسم + تاريخ الميلاد + الجنس قبل ما يدخل المنصة
-- البيانات الحساسة (تاريخ الميلاد والجنس) في جدول خاص: صاحبها والفريق بس هم اللي يشوفوها
alter table public.profiles add column if not exists onboarded boolean not null default false;
-- كل الحسابات الموجودة قبل التحديث ده تعتبر مكمّلة بياناتها (متتطلبش شاشة البداية)
update public.profiles set onboarded = true where onboarded = false;

create table if not exists public.profile_private (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  birth_date date not null,
  gender     text not null check (gender in ('male','female')),
  updated_at timestamptz not null default now()
);
alter table public.profile_private enable row level security;
drop policy if exists pp_select on public.profile_private;
create policy pp_select on public.profile_private for select to authenticated
  using (user_id = auth.uid() or public.is_staff());
grant select on public.profile_private to authenticated;

create or replace function public.complete_onboarding(p_name text, p_birth date, p_gender text)
returns void language plpgsql security definer set search_path = public as $$
declare nm text := btrim(coalesce(p_name,''));
begin
  if auth.uid() is null then raise exception 'سجّل دخول الأول'; end if;
  if char_length(nm) < 2 or char_length(nm) > 60 then raise exception 'الاسم لازم يكون من 2 لـ 60 حرف'; end if;
  if p_gender not in ('male','female') then raise exception 'اختار الجنس'; end if;
  if p_birth is null or p_birth > current_date or p_birth < date '1900-01-01' then raise exception 'تاريخ الميلاد غير صحيح'; end if;
  if p_birth > (current_date - interval '13 years')::date then raise exception 'لازم يكون عمرك 13 سنة على الأقل'; end if;
  update profiles set name = nm, onboarded = true where id = auth.uid();
  insert into profile_private(user_id, birth_date, gender) values (auth.uid(), p_birth, p_gender)
    on conflict (user_id) do update set birth_date = excluded.birth_date, gender = excluded.gender, updated_at = now();
end $$;
revoke all on function public.complete_onboarding(text,date,text) from public, anon;
grant execute on function public.complete_onboarding(text,date,text) to authenticated;
notify pgrst, 'reload schema';

-- (017) فصل محادثة الدعم عن محادثة طلبات الترقية + مسح المحادثة
alter table public.support_messages add column if not exists channel text not null default 'support';
alter table public.support_messages drop constraint if exists support_messages_channel_check;
alter table public.support_messages add constraint support_messages_channel_check check (channel in ('support','upgrade'));
-- الرسائل القديمة اللي كانت على موضوع "الباقة المميزة" تروح لمحادثة الترقية
update public.support_messages set channel = 'upgrade' where topic = 'premium' and channel = 'support';
create index if not exists support_chan_idx on public.support_messages (user_id, channel, created_at);

-- مسح محادثة كاملة: صاحبها يمسح محادثته، والفريق يمسح أي محادثة
create or replace function public.clear_support_chat(p_user uuid, p_channel text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'سجّل دخول الأول'; end if;
  if p_channel not in ('support','upgrade') then raise exception 'محادثة غير صحيحة'; end if;
  if p_user <> auth.uid() and not public.is_staff() then raise exception 'غير مسموح'; end if;
  delete from support_messages where user_id = p_user and channel = p_channel;
end $$;
revoke all on function public.clear_support_chat(uuid,text) from public, anon;
grant execute on function public.clear_support_chat(uuid,text) to authenticated;
notify pgrst, 'reload schema';

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

-- (020) تغيير الاسم مرة كل 30 يوم (بيتفرض من السيرفر)
alter table public.profiles add column if not exists name_changed_at timestamptz;

create or replace function public.profiles_name_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name and coalesce(current_setting('app.skip_name_limit', true), '') <> '1' then
    if old.name_changed_at is not null and old.name_changed_at > now() - interval '30 days' then
      raise exception 'تقدر تغيّر اسمك مرة كل 30 يوم. التغيير الجاي بعد % يوم.',
        ceil(extract(epoch from (old.name_changed_at + interval '30 days' - now())) / 86400)::int;
    end if;
    new.name_changed_at := now();
  end if;
  return new;
end $$;
drop trigger if exists profiles_name_limit_trg on public.profiles;
create trigger profiles_name_limit_trg before update of name on public.profiles
  for each row execute function public.profiles_name_limit();

-- شاشة أول دخول: اختيار الاسم أول مرة ما يحسبش كتغيير
create or replace function public.complete_onboarding(p_name text, p_birth date, p_gender text)
returns void language plpgsql security definer set search_path = public as $$
declare nm text := btrim(coalesce(p_name,''));
begin
  if auth.uid() is null then raise exception 'سجّل دخول الأول'; end if;
  if char_length(nm) < 2 or char_length(nm) > 60 then raise exception 'الاسم لازم يكون من 2 لـ 60 حرف'; end if;
  if p_gender not in ('male','female') then raise exception 'اختار الجنس'; end if;
  if p_birth is null or p_birth > current_date or p_birth < date '1900-01-01' then raise exception 'تاريخ الميلاد غير صحيح'; end if;
  if p_birth > (current_date - interval '13 years')::date then raise exception 'لازم يكون عمرك 13 سنة على الأقل'; end if;
  perform set_config('app.skip_name_limit', '1', true);
  update profiles set name = nm, onboarded = true where id = auth.uid();
  perform set_config('app.skip_name_limit', '0', true);
  insert into profile_private(user_id, birth_date, gender) values (auth.uid(), p_birth, p_gender)
    on conflict (user_id) do update set birth_date = excluded.birth_date, gender = excluded.gender, updated_at = now();
end $$;
notify pgrst, 'reload schema';


-- 021: الإعلانات (بتظهر للمستخدمين كبوست عادي، يقدروا يعملوا لايك وتعليق)
-- الأدمن بيحدد: مدة الإعلان بالأيام + عدد المستخدمين اللي يظهرلهم
create table if not exists public.ads (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (char_length(title) between 1 and 80),   -- اسم داخلي للأدمن
  starts_at      timestamptz not null default now(),
  ends_at        timestamptz not null,
  target_viewers integer not null check (target_viewers between 1 and 10000000),
  status         text not null default 'active' check (status in ('active','paused')),
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);
create table if not exists public.ad_views (
  ad_id   uuid not null references public.ads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (ad_id, user_id)
);
create index if not exists ad_views_ad_idx on public.ad_views (ad_id);

-- بوست الإعلان: بوست عادي مربوط بالإعلان
alter table public.posts add column if not exists ad_id uuid references public.ads(id) on delete cascade;
create unique index if not exists posts_ad_uniq on public.posts (ad_id) where ad_id is not null;

alter table public.ads enable row level security;
alter table public.ad_views enable row level security;
drop policy if exists ads_staff_select on public.ads;
create policy ads_staff_select on public.ads for select to authenticated using (public.is_staff());
drop policy if exists adv_staff_select on public.ad_views;
create policy adv_staff_select on public.ad_views for select to authenticated using (public.is_staff());
revoke insert, update, delete on public.ads, public.ad_views from authenticated, anon;

-- الإعلان شغال دلوقتي؟
create or replace function public.ad_live(aid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from ads a where a.id = aid and a.status = 'active' and now() between a.starts_at and a.ends_at);
$$;

-- أي مستخدم يشوف بوست الإعلان طول ما الإعلان شغال (والستاف دايمًا)
create or replace function public.can_see_post(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from posts p
                 where p.id = pid
                   and ( (p.ad_id is not null and (public.ad_live(p.ad_id) or public.is_staff()))
                      or (p.ad_id is null and p.group_id is null and (p.author_id = auth.uid() or public.are_friends(p.author_id, auth.uid()) or public.is_staff()))
                      or (p.group_id is not null and (public.group_is_public(p.group_id) or public.is_member(p.group_id) or public.is_staff())) ));
$$;
drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts for select to authenticated
  using ( (ad_id is not null and (public.ad_live(ad_id) or public.is_staff()))
       or (ad_id is null and group_id is null and (author_id = auth.uid() or public.are_friends(author_id, auth.uid()) or public.is_staff()))
       or (group_id is not null and (public.group_is_public(group_id) or public.is_member(group_id) or public.is_staff())) );
drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert to authenticated
  with check (author_id = auth.uid() and not public.is_banned() and ad_id is null
              and (group_id is null or public.is_member(group_id)));

-- لايك وتعليق على الإعلان
drop policy if exists likes_insert on public.likes;
create policy likes_insert on public.likes for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from posts p where p.id = post_id
              and ( (p.ad_id is not null and public.ad_live(p.ad_id))
                 or (p.ad_id is null and p.group_id is null and (p.author_id = auth.uid() or public.are_friends(p.author_id, auth.uid())))
                 or (p.group_id is not null and public.is_member(p.group_id)) )));
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = auth.uid() and not public.is_banned()
              and exists (select 1 from posts p where p.id = post_id
                          and ( (p.ad_id is not null and public.ad_live(p.ad_id))
                             or (p.ad_id is null and p.group_id is null and (p.author_id = auth.uid() or public.are_friends(p.author_id, auth.uid())))
                             or (p.group_id is not null and public.is_member(p.group_id)) )));

-- إنشاء إعلان (أدمن بس): بيعمل الإعلان + بوسته
create or replace function public.admin_create_ad(p_title text, p_body text, p_image text, p_days integer, p_viewers integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare aid uuid;
begin
  if not public.is_admin() then raise exception 'للأدمن بس'; end if;
  if coalesce(p_days,0) < 1 or p_days > 365 then raise exception 'مدة الإعلان من 1 إلى 365 يوم'; end if;
  if coalesce(p_viewers,0) < 1 then raise exception 'عدد المستخدمين لازم يكون 1 على الأقل'; end if;
  if char_length(btrim(coalesce(p_body,''))) < 1 then raise exception 'اكتب نص الإعلان'; end if;
  insert into ads (title, ends_at, target_viewers, created_by)
  values (left(btrim(coalesce(nullif(p_title,''), p_body)), 80), now() + make_interval(days => p_days), p_viewers, auth.uid())
  returning id into aid;
  insert into posts (author_id, body, image_url, ad_id) values (auth.uid(), btrim(p_body), nullif(p_image,''), aid);
  return aid;
end $$;
grant execute on function public.admin_create_ad(text, text, text, integer, integer) to authenticated;

-- إيقاف/تشغيل/تمديد/حذف
create or replace function public.admin_set_ad(p_id uuid, p_status text default null, p_add_days integer default 0, p_add_viewers integer default 0)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'للأدمن بس'; end if;
  update ads set status = coalesce(p_status, status),
                 ends_at = ends_at + make_interval(days => greatest(coalesce(p_add_days,0),0)),
                 target_viewers = target_viewers + greatest(coalesce(p_add_viewers,0),0)
  where id = p_id;
end $$;
grant execute on function public.admin_set_ad(uuid, text, integer, integer) to authenticated;
create or replace function public.admin_delete_ad(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'للأدمن بس'; end if;
  delete from ads where id = p_id;   -- بوست الإعلان بيتمسح معاه (cascade)
end $$;
grant execute on function public.admin_delete_ad(uuid) to authenticated;

-- إحصائيات الإعلانات للأدمن
create or replace function public.admin_ads() returns table (
  id uuid, title text, body text, image_url text, post_id uuid, starts_at timestamptz, ends_at timestamptz,
  target_viewers integer, status text, views bigint, likes bigint, comments bigint)
language sql stable security definer set search_path = public as $$
  select a.id, a.title, p.body, p.image_url, p.id, a.starts_at, a.ends_at, a.target_viewers, a.status,
         (select count(*) from ad_views v where v.ad_id = a.id),
         (select count(*) from likes l where l.post_id = p.id),
         (select count(*) from comments c where c.post_id = p.id)
  from ads a join posts p on p.ad_id = a.id
  where public.is_admin()
  order by a.created_at desc;
$$;
grant execute on function public.admin_ads() to authenticated;

-- الإعلانات اللي تظهر للمستخدم الحالي في صفحته الرئيسية:
-- (1) إعلانات شافها قبل كده وهي لسه شغالة، (2) إعلانات جديدة لو العدد المستهدف لسه ما اكتملش (وبيتسجل إنه شافها)
create or replace function public.feed_ads() returns table (post_id uuid)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); a record;
begin
  if me is null or public.is_banned() then return; end if;
  for a in
    select ad.id, ad.target_viewers,
           exists (select 1 from ad_views v where v.ad_id = ad.id and v.user_id = me) as seen
    from ads ad
    where ad.status = 'active' and now() between ad.starts_at and ad.ends_at
    order by ad.created_at desc
  loop
    if not a.seen then
      perform 1 from ads where id = a.id for update;     -- يمنع تجاوز العدد لو أكتر من واحد دخلوا مع بعض
      if (select count(*) from ad_views where ad_id = a.id) >= a.target_viewers then continue; end if;
      insert into ad_views (ad_id, user_id) values (a.id, me) on conflict do nothing;
    end if;
    return query select p.id from posts p where p.ad_id = a.id;
  end loop;
end $$;
grant execute on function public.feed_ads() to authenticated;
notify pgrst, 'reload schema';


-- 022: اسم وصورة المعلِن (بيختارهم الأدمن) بيظهروا على الإعلان بدل حساب الأدمن
alter table public.ads add column if not exists advertiser_name   text;
alter table public.ads add column if not exists advertiser_avatar text;

drop function if exists public.admin_create_ad(text, text, text, integer, integer);
create or replace function public.admin_create_ad(p_title text, p_body text, p_image text, p_days integer, p_viewers integer,
                                                  p_adv_name text default null, p_adv_avatar text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare aid uuid;
begin
  if not public.is_admin() then raise exception 'للأدمن بس'; end if;
  if coalesce(p_days,0) < 1 or p_days > 365 then raise exception 'مدة الإعلان من 1 إلى 365 يوم'; end if;
  if coalesce(p_viewers,0) < 1 then raise exception 'عدد المستخدمين لازم يكون 1 على الأقل'; end if;
  if char_length(btrim(coalesce(p_body,''))) < 1 then raise exception 'اكتب نص الإعلان'; end if;
  if char_length(btrim(coalesce(p_adv_name,''))) < 1 then raise exception 'اكتب اسم المعلِن'; end if;
  insert into ads (title, ends_at, target_viewers, created_by, advertiser_name, advertiser_avatar)
  values (left(btrim(coalesce(nullif(p_title,''), p_adv_name)), 80), now() + make_interval(days => p_days), p_viewers, auth.uid(),
          left(btrim(p_adv_name), 60), nullif(p_adv_avatar,''))
  returning id into aid;
  insert into posts (author_id, body, image_url, ad_id) values (auth.uid(), btrim(p_body), nullif(p_image,''), aid);
  return aid;
end $$;
grant execute on function public.admin_create_ad(text, text, text, integer, integer, text, text) to authenticated;

drop function if exists public.admin_ads();
create or replace function public.admin_ads() returns table (
  id uuid, title text, body text, image_url text, post_id uuid, starts_at timestamptz, ends_at timestamptz,
  target_viewers integer, status text, views bigint, likes bigint, comments bigint, advertiser_name text, advertiser_avatar text)
language sql stable security definer set search_path = public as $$
  select a.id, a.title, p.body, p.image_url, p.id, a.starts_at, a.ends_at, a.target_viewers, a.status,
         (select count(*) from ad_views v where v.ad_id = a.id),
         (select count(*) from likes l where l.post_id = p.id),
         (select count(*) from comments c where c.post_id = p.id),
         a.advertiser_name, a.advertiser_avatar
  from ads a join posts p on p.ad_id = a.id
  where public.is_admin()
  order by a.created_at desc;
$$;
grant execute on function public.admin_ads() to authenticated;

drop function if exists public.feed_ads();
create or replace function public.feed_ads() returns table (post_id uuid, advertiser_name text, advertiser_avatar text)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); a record;
begin
  if me is null or public.is_banned() then return; end if;
  for a in
    select ad.id, ad.target_viewers, ad.advertiser_name as an, ad.advertiser_avatar as av,
           exists (select 1 from ad_views v where v.ad_id = ad.id and v.user_id = me) as seen
    from ads ad
    where ad.status = 'active' and now() between ad.starts_at and ad.ends_at
    order by ad.created_at desc
  loop
    if not a.seen then
      perform 1 from ads where id = a.id for update;
      if (select count(*) from ad_views where ad_id = a.id) >= a.target_viewers then continue; end if;
      insert into ad_views (ad_id, user_id) values (a.id, me) on conflict do nothing;
    end if;
    return query select p.id, a.an, a.av from posts p where p.ad_id = a.id;
  end loop;
end $$;
grant execute on function public.feed_ads() to authenticated;
notify pgrst, 'reload schema';


-- 023: تعديل الإعلان بالكامل من صفحة تفاصيله (أدمن بس)
create or replace function public.admin_update_ad(p_id uuid, p_title text, p_body text, p_image text,
                                                  p_adv_name text, p_adv_avatar text,
                                                  p_ends_at timestamptz, p_target integer, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare st timestamptz;
begin
  if not public.is_admin() then raise exception 'للأدمن بس'; end if;
  if char_length(btrim(coalesce(p_body,''))) < 1 then raise exception 'اكتب نص الإعلان'; end if;
  if char_length(btrim(coalesce(p_adv_name,''))) < 1 then raise exception 'اكتب اسم المعلِن'; end if;
  if coalesce(p_target,0) < 1 then raise exception 'عدد المستخدمين لازم يكون 1 على الأقل'; end if;
  if p_status not in ('active','paused') then raise exception 'حالة غير صحيحة'; end if;
  select starts_at into st from ads where id = p_id;
  if st is null then raise exception 'الإعلان مش موجود'; end if;
  if p_ends_at is null or p_ends_at <= st then raise exception 'تاريخ الانتهاء لازم يكون بعد بداية الإعلان'; end if;
  update ads set title = left(btrim(coalesce(nullif(p_title,''), p_adv_name)), 80),
                 advertiser_name = left(btrim(p_adv_name), 60), advertiser_avatar = nullif(p_adv_avatar,''),
                 ends_at = p_ends_at, target_viewers = p_target, status = p_status
  where id = p_id;
  update posts set body = btrim(p_body), image_url = nullif(p_image,'') where ad_id = p_id;
end $$;
grant execute on function public.admin_update_ad(uuid, text, text, text, text, text, timestamptz, integer, text) to authenticated;
notify pgrst, 'reload schema';


-- 024: جدول المستخدمين في لوحة الإدارة (الإيميل + أعداد المنشورات والأصدقاء والمجموعات + آخر ظهور)
-- بيشوفه فريق الإدارة بس (أدمن/مشرف/دعم). الإيميل موجود في auth.users فمحتاجين دالة security definer.
create or replace function public.admin_users() returns table (
  id uuid, name text, avatar_url text, role text, plan text, plan_until timestamptz, banned boolean,
  created_at timestamptz, email text, posts bigint, friends bigint, groups bigint, last_seen timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select p.id, p.name, p.avatar_url, p.role, p.plan, p.plan_until, p.banned, p.created_at, u.email::text,
         (select count(*) from posts x where x.author_id = p.id and x.ad_id is null),
         (select count(*) from friendships f where f.status = 'accepted' and (f.requester_id = p.id or f.addressee_id = p.id)),
         (select count(*) from group_members m where m.user_id = p.id and m.status = 'active'),
         (select pr.last_seen from presence pr where pr.user_id = p.id)
  from profiles p left join auth.users u on u.id = p.id
  where public.is_staff()
  order by p.created_at desc
  limit 2000;
$$;
revoke all on function public.admin_users() from public, anon;
grant execute on function public.admin_users() to authenticated;
notify pgrst, 'reload schema';


-- 025: جدول المجموعات في لوحة الإدارة (اسم المالك + عدد الأعضاء والمنشورات)
create or replace function public.admin_groups() returns table (
  id uuid, name text, description text, cover_url text, privacy text, created_at timestamptz,
  owner_id uuid, owner_name text, owner_avatar text, members bigint, posts bigint)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.description, g.cover_url, g.privacy, g.created_at, g.owner_id, o.name, o.avatar_url,
         (select count(*) from group_members m where m.group_id = g.id and m.status = 'active'),
         (select count(*) from posts p where p.group_id = g.id)
  from groups g left join profiles o on o.id = g.owner_id
  where public.is_staff()
  order by g.created_at desc
  limit 2000;
$$;
revoke all on function public.admin_groups() from public, anon;
grant execute on function public.admin_groups() to authenticated;
notify pgrst, 'reload schema';

-- (026) رسائل لحظية: نضيف جدول الرسائل لقناة Realtime (آمن لو متضافة قبل كده)
do $$ begin
  begin alter publication supabase_realtime add table public.dm_messages;
  exception when duplicate_object then null; when undefined_object then null; end;
end $$;

-- (027) حذف الرسائل الخاصة: المرسل بس يقدر يمسح رسالته (بتتمسح عند الطرفين)
drop policy if exists dm_delete on public.dm_messages;
create policy dm_delete on public.dm_messages for delete to authenticated using (sender_id = auth.uid());
grant delete on public.dm_messages to authenticated;
notify pgrst, 'reload schema';

-- (028) ردود الفعل زي فيسبوك: أعجبني / أحببته / أدعمه / أضحكني / أدهشني / أحزنني / أغضبني
alter table public.likes add column if not exists reaction text not null default 'like';
alter table public.comment_likes add column if not exists reaction text not null default 'like';
alter table public.likes drop constraint if exists likes_reaction_chk;
alter table public.likes add constraint likes_reaction_chk check (reaction in ('like','love','care','haha','wow','sad','angry'));
alter table public.comment_likes drop constraint if exists comment_likes_reaction_chk;
alter table public.comment_likes add constraint comment_likes_reaction_chk check (reaction in ('like','love','care','haha','wow','sad','angry'));

-- تغيير نوع التفاعل: صاحبه بس، والعمود الوحيد اللي يتعدّل
drop policy if exists likes_update on public.likes;
create policy likes_update on public.likes for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.likes from authenticated, anon;
grant update (reaction) on public.likes to authenticated;
drop policy if exists cl_update on public.comment_likes;
create policy cl_update on public.comment_likes for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.comment_likes from authenticated, anon;
grant update (reaction) on public.comment_likes to authenticated;
notify pgrst, 'reload schema';

-- (029) تفاعل بإيموجي على الرسائل الخاصة (يشوفه الطرفين بس)
create table if not exists public.dm_reactions (
  message_id uuid not null references public.dm_messages(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 8),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.dm_reactions enable row level security;
drop policy if exists dmr_select on public.dm_reactions;
drop policy if exists dmr_insert on public.dm_reactions;
drop policy if exists dmr_update on public.dm_reactions;
drop policy if exists dmr_delete on public.dm_reactions;
create policy dmr_select on public.dm_reactions for select to authenticated
  using (exists (select 1 from public.dm_messages m where m.id = message_id and (m.sender_id = auth.uid() or m.recipient_id = auth.uid())));
create policy dmr_insert on public.dm_reactions for insert to authenticated
  with check (user_id = auth.uid() and not public.is_banned()
    and exists (select 1 from public.dm_messages m where m.id = message_id and (m.sender_id = auth.uid() or m.recipient_id = auth.uid())));
create policy dmr_update on public.dm_reactions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy dmr_delete on public.dm_reactions for delete to authenticated using (user_id = auth.uid());
revoke all on public.dm_reactions from anon, authenticated;
grant select, insert, delete on public.dm_reactions to authenticated;
grant update (emoji) on public.dm_reactions to authenticated;
do $$ begin
  begin alter publication supabase_realtime add table public.dm_reactions;
  exception when duplicate_object then null; when undefined_object then null; end;
end $$;
notify pgrst, 'reload schema';

-- (030) حظر الأشخاص + حذف الدردشة من عندي بس (زي فيسبوك)
create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.user_blocks enable row level security;
drop policy if exists ub_select on public.user_blocks;
create policy ub_select on public.user_blocks for select to authenticated using (blocker_id = auth.uid() or public.is_staff());
revoke all on public.user_blocks from anon, authenticated;
grant select on public.user_blocks to authenticated;

create or replace function public.blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;
revoke all on function public.blocked_between(uuid, uuid) from public, anon;
grant execute on function public.blocked_between(uuid, uuid) to authenticated;

-- الحظر بيشيل الصداقة كمان
create or replace function public.block_user(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or target is null or target = auth.uid() then raise exception 'مش ممكن'; end if;
  insert into user_blocks(blocker_id, blocked_id) values (auth.uid(), target) on conflict do nothing;
  delete from friendships where (requester_id = auth.uid() and addressee_id = target) or (requester_id = target and addressee_id = auth.uid());
end $$;
create or replace function public.unblock_user(target uuid) returns void
language sql security definer set search_path = public as $$
  delete from user_blocks where blocker_id = auth.uid() and blocked_id = target;
$$;
revoke all on function public.block_user(uuid), public.unblock_user(uuid) from public, anon;
grant execute on function public.block_user(uuid), public.unblock_user(uuid) to authenticated;

-- المحظور (أو الحاظر) ما يقدرش يبعت رسالة أو طلب صداقة
drop policy if exists dm_insert on public.dm_messages;
create policy dm_insert on public.dm_messages for insert to authenticated
  with check (sender_id = auth.uid() and not public.is_banned() and not public.blocked_between(sender_id, recipient_id));
drop policy if exists fr_insert on public.friendships;
create policy fr_insert on public.friendships for insert to authenticated
  with check (requester_id = auth.uid() and status = 'pending' and not public.is_banned() and not public.blocked_between(requester_id, addressee_id));

-- حذف الدردشة من عندي: الرسائل القديمة بتختفي عندي بس، والطرف التاني يفضل شايفها
create table if not exists public.dm_clears (
  user_id uuid not null references public.profiles(id) on delete cascade,
  other_id uuid not null references public.profiles(id) on delete cascade,
  cleared_at timestamptz not null default now(),
  primary key (user_id, other_id)
);
alter table public.dm_clears enable row level security;
drop policy if exists dmc_select on public.dm_clears;
create policy dmc_select on public.dm_clears for select to authenticated using (user_id = auth.uid());
revoke all on public.dm_clears from anon, authenticated;
grant select on public.dm_clears to authenticated;
create or replace function public.clear_chat(other uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'مش ممكن'; end if;
  insert into dm_clears(user_id, other_id, cleared_at) values (auth.uid(), other, now())
    on conflict (user_id, other_id) do update set cleared_at = now();
  update dm_messages set read_at = now() where recipient_id = auth.uid() and sender_id = other and read_at is null;
end $$;
revoke all on function public.clear_chat(uuid) from public, anon;
grant execute on function public.clear_chat(uuid) to authenticated;
notify pgrst, 'reload schema';

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

-- (032) كتم إشعارات محادثة (شخص أو مجموعة شات) + طرد عضو من مجموعة الشات (للي أنشأها بس)
create table if not exists public.chat_mutes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  chat_key text not null check (char_length(chat_key) between 1 and 60),
  created_at timestamptz not null default now(),
  primary key (user_id, chat_key)
);
alter table public.chat_mutes enable row level security;
drop policy if exists cmu_select on public.chat_mutes;
drop policy if exists cmu_insert on public.chat_mutes;
drop policy if exists cmu_delete on public.chat_mutes;
create policy cmu_select on public.chat_mutes for select to authenticated using (user_id = auth.uid());
create policy cmu_insert on public.chat_mutes for insert to authenticated with check (user_id = auth.uid());
create policy cmu_delete on public.chat_mutes for delete to authenticated using (user_id = auth.uid());
revoke all on public.chat_mutes from anon, authenticated;
grant select, insert, delete on public.chat_mutes to authenticated;

-- أي عضو يضيف ناس (من أصدقائه)، لكن اللي أنشأ المجموعة بس هو اللي يطرد
create or replace function public.remove_room_member(p_room uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_user = auth.uid() then raise exception 'مش مسموح'; end if;
  if not exists (select 1 from chat_rooms where id = p_room and created_by = auth.uid()) then raise exception 'اللي أنشأ المجموعة بس يقدر يطرد'; end if;
  delete from chat_room_members where room_id = p_room and user_id = p_user;
end $$;
revoke all on function public.remove_room_member(uuid, uuid) from public, anon;
grant execute on function public.remove_room_member(uuid, uuid) to authenticated;
notify pgrst, 'reload schema';

-- بعد ما تسجل أول مرة بحسابك، خليه أدمن (غيّر الإيميل بإيميلك):
--   update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'hossamali50100@gmail.com');
-- ============================================================
