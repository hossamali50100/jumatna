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
