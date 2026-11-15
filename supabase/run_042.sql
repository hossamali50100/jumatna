-- (042) الأدمن (دور admin بس) يقدر يحذف حساب مستخدم نهائيًا من لوحة التحكم.
-- مينفعش يحذف نفسه ولا حد من الإدارة. الحذف بيمسح الحساب وكل بياناته (بوستات، رسايل، صداقات…) بالتتابع.
create or replace function public.admin_delete_user(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'مش مسموح'; end if;
  if target = auth.uid() then raise exception 'مينفعش تحذف حسابك من هنا'; end if;
  if (select role from profiles where id = target) in ('admin','mod','support') then
    raise exception 'مينفعش تحذف حد من الإدارة. شيل دوره الأول';
  end if;
  delete from auth.users where id = target;
end $$;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;
notify pgrst, 'reload schema';
