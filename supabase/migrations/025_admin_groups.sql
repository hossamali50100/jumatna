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
