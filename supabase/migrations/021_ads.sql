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
