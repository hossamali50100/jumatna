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
