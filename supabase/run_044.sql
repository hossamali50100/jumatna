-- (044) ترويج بوست أصلي من مجموعة (بدل نسخة منه) مع استهداف بالنوع والسن.
-- الإعلان بيشاور على البوست الأصلي، فالتعليقات والإعجابات بتفضل عليه وصاحب المجموعة يرد عليها.
alter table public.ads add column if not exists src_post uuid references public.posts(id) on delete cascade;
alter table public.ads add column if not exists target_gender text not null default 'all';
alter table public.ads add column if not exists age_min integer;
alter table public.ads add column if not exists age_max integer;
alter table public.ads drop constraint if exists ads_tgender_chk;
alter table public.ads add constraint ads_tgender_chk check (target_gender in ('all','male','female'));
alter table public.ads drop constraint if exists ads_age_chk;
alter table public.ads add constraint ads_age_chk check ((age_min is null or age_min between 13 and 100) and (age_max is null or age_max between 13 and 100) and (age_min is null or age_max is null or age_min <= age_max));
create index if not exists ads_src_post_idx on public.ads (src_post) where src_post is not null;

-- البوست ده عليه إعلان شغال دلوقتي؟
create or replace function public.post_promoted(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from ads a where a.src_post = pid and a.status = 'active' and now() between a.starts_at and a.ends_at);
$$;

-- البوست المروَّج يشوفه أي مستخدم (ويعمل عليه لايك وتعليق) طول ما الإعلان شغال
create or replace function public.can_see_post(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from posts p
                 where p.id = pid
                   and ( (p.ad_id is not null and (public.ad_live(p.ad_id) or public.is_staff()))
                      or (p.ad_id is null and p.group_id is null and (p.author_id = auth.uid() or public.are_friends(p.author_id, auth.uid()) or public.is_staff()))
                      or (p.group_id is not null and (public.group_is_public(p.group_id) or public.is_member(p.group_id) or public.is_staff())
                          and (p.approval = 'approved' or p.author_id = auth.uid() or public.is_group_admin(p.group_id) or public.is_staff()))
                      or (p.group_id is not null and p.approval = 'approved' and public.post_promoted(p.id)) ));
$$;
drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts for select to authenticated
  using ( (ad_id is not null and (public.ad_live(ad_id) or public.is_staff()))
       or (ad_id is null and group_id is null and (author_id = auth.uid() or public.are_friends(author_id, auth.uid()) or public.is_staff()))
       or (group_id is not null and (public.group_is_public(group_id) or public.is_member(group_id) or public.is_staff())
           and (approval = 'approved' or author_id = auth.uid() or public.is_group_admin(group_id) or public.is_staff()))
       or (group_id is not null and approval = 'approved' and public.post_promoted(id)) );

drop policy if exists likes_insert on public.likes;
create policy likes_insert on public.likes for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from posts p where p.id = post_id
              and ( (p.ad_id is not null and public.ad_live(p.ad_id))
                 or (p.ad_id is null and p.group_id is null and (p.author_id = auth.uid() or public.are_friends(p.author_id, auth.uid())))
                 or (p.group_id is not null and public.is_member(p.group_id))
                 or (p.group_id is not null and p.approval = 'approved' and public.post_promoted(p.id)) )));
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = auth.uid() and not public.is_banned()
              and exists (select 1 from posts p where p.id = post_id
                          and ( (p.ad_id is not null and public.ad_live(p.ad_id))
                             or (p.ad_id is null and p.group_id is null and (p.author_id = auth.uid() or public.are_friends(p.author_id, auth.uid())))
                             or (p.group_id is not null and public.is_member(p.group_id))
                             or (p.group_id is not null and p.approval = 'approved' and public.post_promoted(p.id)) )));

-- ترويج بوست (أدمن بس)
create or replace function public.admin_promote_post(p_post uuid, p_days integer, p_viewers integer, p_gender text default 'all',
                                                     p_age_min integer default null, p_age_max integer default null, p_link text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare aid uuid; gid uuid; ap text; gname text; lk text := nullif(btrim(coalesce(p_link,'')), '');
begin
  if not public.is_admin() then raise exception 'للأدمن بس'; end if;
  select group_id, approval into gid, ap from posts where id = p_post;
  if gid is null then raise exception 'البوست ده مش موجود أو مش بوست مجموعة'; end if;
  if ap <> 'approved' then raise exception 'البوست لسه مستني موافقة مشرف المجموعة'; end if;
  if coalesce(p_days,0) < 1 or p_days > 365 then raise exception 'مدة الإعلان من 1 إلى 365 يوم'; end if;
  if coalesce(p_viewers,0) < 1 then raise exception 'عدد المستخدمين لازم يكون 1 على الأقل'; end if;
  if coalesce(p_gender,'all') not in ('all','male','female') then raise exception 'الفئة غير صحيحة'; end if;
  if p_age_min is not null and p_age_min not between 13 and 100 then raise exception 'السن من 13 إلى 100'; end if;
  if p_age_max is not null and p_age_max not between 13 and 100 then raise exception 'السن من 13 إلى 100'; end if;
  if p_age_min is not null and p_age_max is not null and p_age_min > p_age_max then raise exception 'السن الأدنى أكبر من الأقصى'; end if;
  if lk is not null and (lk !~* '^https?://[^[:space:]]+$' or char_length(lk) not between 10 and 500) then raise exception 'الرابط لازم يبدأ بـ https://'; end if;
  if public.post_promoted(p_post) then raise exception 'البوست ده متروّج بالفعل. عدّل الإعلان الحالي أو أوقفه الأول'; end if;
  select name into gname from groups where id = gid;
  insert into ads (title, ends_at, target_viewers, created_by, link_url, src_post, target_gender, age_min, age_max)
  values (left(coalesce(gname,'ترويج'), 80), now() + make_interval(days => p_days), p_viewers, auth.uid(), lk, p_post,
          coalesce(p_gender,'all'), p_age_min, p_age_max)
  returning id into aid;
  return aid;
end $$;
revoke all on function public.admin_promote_post(uuid, integer, integer, text, integer, integer, text) from public, anon;
grant execute on function public.admin_promote_post(uuid, integer, integer, text, integer, integer, text) to authenticated;

-- تعديل إعلان مروَّج (مدة، عدد، حالة، استهداف، رابط) من غير ما يلمس البوست الأصلي
create or replace function public.admin_update_promo(p_id uuid, p_ends_at timestamptz, p_target integer, p_status text,
                                                     p_gender text, p_age_min integer, p_age_max integer, p_link text default null)
returns void language plpgsql security definer set search_path = public as $$
declare st timestamptz; lk text := nullif(btrim(coalesce(p_link,'')), '');
begin
  if not public.is_admin() then raise exception 'للأدمن بس'; end if;
  if coalesce(p_target,0) < 1 then raise exception 'عدد المستخدمين لازم يكون 1 على الأقل'; end if;
  if p_status not in ('active','paused') then raise exception 'حالة غير صحيحة'; end if;
  if coalesce(p_gender,'all') not in ('all','male','female') then raise exception 'الفئة غير صحيحة'; end if;
  if p_age_min is not null and p_age_min not between 13 and 100 then raise exception 'السن من 13 إلى 100'; end if;
  if p_age_max is not null and p_age_max not between 13 and 100 then raise exception 'السن من 13 إلى 100'; end if;
  if p_age_min is not null and p_age_max is not null and p_age_min > p_age_max then raise exception 'السن الأدنى أكبر من الأقصى'; end if;
  if lk is not null and (lk !~* '^https?://[^[:space:]]+$' or char_length(lk) not between 10 and 500) then raise exception 'الرابط لازم يبدأ بـ https://'; end if;
  select starts_at into st from ads where id = p_id and src_post is not null;
  if st is null then raise exception 'الإعلان مش موجود'; end if;
  if p_ends_at is null or p_ends_at <= st then raise exception 'تاريخ الانتهاء لازم يكون بعد بداية الإعلان'; end if;
  update ads set ends_at = p_ends_at, target_viewers = p_target, status = p_status, link_url = lk,
                 target_gender = coalesce(p_gender,'all'), age_min = p_age_min, age_max = p_age_max
  where id = p_id;
end $$;
revoke all on function public.admin_update_promo(uuid, timestamptz, integer, text, text, integer, integer, text) from public, anon;
grant execute on function public.admin_update_promo(uuid, timestamptz, integer, text, text, integer, integer, text) to authenticated;

-- جدول الإعلانات للأدمن (القديمة + المروَّجة)
drop function if exists public.admin_ads();
create or replace function public.admin_ads() returns table (
  id uuid, title text, body text, image_url text, post_id uuid, starts_at timestamptz, ends_at timestamptz,
  target_viewers integer, status text, views bigint, likes bigint, comments bigint, advertiser_name text, advertiser_avatar text, link_url text,
  src_post uuid, group_id uuid, group_name text, target_gender text, age_min integer, age_max integer)
language sql stable security definer set search_path = public as $$
  select a.id, a.title, p.body, p.image_url, p.id, a.starts_at, a.ends_at, a.target_viewers, a.status,
         (select count(*) from ad_views v where v.ad_id = a.id),
         (select count(*) from likes l where l.post_id = p.id),
         (select count(*) from comments c where c.post_id = p.id),
         coalesce(a.advertiser_name, g.name), coalesce(a.advertiser_avatar, g.cover_url), a.link_url,
         a.src_post, p.group_id, g.name, a.target_gender, a.age_min, a.age_max
  from ads a join posts p on (p.ad_id = a.id or p.id = a.src_post)
  left join groups g on g.id = p.group_id
  where public.is_admin()
  order by a.created_at desc;
$$;
grant execute on function public.admin_ads() to authenticated;

-- الإعلانات اللي بتظهر في الصفحة الرئيسية: بتحترم الاستهداف، وأعضاء المجموعة مش بياخدوا الإعلان (شايفين البوست أصلًا)
drop function if exists public.feed_ads();
create or replace function public.feed_ads() returns table (post_id uuid, advertiser_name text, advertiser_avatar text, link_url text, group_id uuid)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); a record; mg text; mage integer; pid uuid; gid uuid; adn text; adv text;
begin
  if me is null or public.is_banned() then return; end if;
  select gender, date_part('year', age(birth_date))::int into mg, mage from profile_private where user_id = me;
  for a in
    select ad.id, ad.target_viewers, ad.advertiser_name as an, ad.advertiser_avatar as av, ad.link_url as lk,
           ad.src_post, ad.target_gender as tg, ad.age_min as amin, ad.age_max as amax,
           exists (select 1 from ad_views v where v.ad_id = ad.id and v.user_id = me) as seen
    from ads ad
    where ad.status = 'active' and now() between ad.starts_at and ad.ends_at
    order by ad.created_at desc
  loop
    if a.tg <> 'all' and mg is distinct from a.tg then continue; end if;
    if a.amin is not null and (mage is null or mage < a.amin) then continue; end if;
    if a.amax is not null and (mage is null or mage > a.amax) then continue; end if;
    pid := null; gid := null; adn := a.an; adv := a.av;
    if a.src_post is not null then
      select p.id, p.group_id into pid, gid from posts p where p.id = a.src_post and p.approval = 'approved';
      if pid is null then continue; end if;
      if exists (select 1 from group_members m where m.group_id = gid and m.user_id = me and m.status = 'active') then continue; end if;
      select g.name, g.cover_url into adn, adv from groups g where g.id = gid;
      if adn is null then continue; end if;
    else
      select p.id into pid from posts p where p.ad_id = a.id;
      if pid is null then continue; end if;
    end if;
    if not a.seen then
      perform 1 from ads where id = a.id for update;
      if (select count(*) from ad_views where ad_id = a.id) >= a.target_viewers then continue; end if;
      insert into ad_views (ad_id, user_id) values (a.id, me) on conflict do nothing;
    end if;
    return query select pid, adn, adv, a.lk, gid;
  end loop;
end $$;
grant execute on function public.feed_ads() to authenticated;

-- إحصائيات الترويج لمشرف المجموعة (من إعدادات مجموعته)
create or replace function public.group_promos(gid uuid) returns table (
  id uuid, post_id uuid, body text, starts_at timestamptz, ends_at timestamptz, target_viewers integer, status text,
  views bigint, likes bigint, comments bigint, target_gender text, age_min integer, age_max integer)
language sql stable security definer set search_path = public as $$
  select a.id, p.id, p.body, a.starts_at, a.ends_at, a.target_viewers, a.status,
         (select count(*) from ad_views v where v.ad_id = a.id),
         (select count(*) from likes l where l.post_id = p.id),
         (select count(*) from comments c where c.post_id = p.id),
         a.target_gender, a.age_min, a.age_max
  from ads a join posts p on p.id = a.src_post
  where p.group_id = gid and (public.is_group_admin(gid) or public.is_staff())
  order by a.created_at desc;
$$;
revoke all on function public.group_promos(uuid) from public, anon;
grant execute on function public.group_promos(uuid) to authenticated;
notify pgrst, 'reload schema';
