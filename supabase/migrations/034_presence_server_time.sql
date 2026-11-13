-- (034) إصلاح "متصل / غير متصل": الوقت بقى بيتسجّل من السيرفر (مش من ساعة جهاز كل واحد)
-- وفيه دالة بتحسب مين متصل على السيرفر نفسه، فاختلاف ساعات الأجهزة مبقاش يفرق.
create or replace function public.presence_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin new.last_seen := now(); return new; end $$;
drop trigger if exists presence_stamp on public.presence;
create trigger presence_stamp before insert or update on public.presence
  for each row execute function public.presence_stamp();

-- security invoker: نفس قيود الأمان (الأصدقاء بس) بتتطبّق
create or replace function public.online_users(ids uuid[]) returns setof uuid
language sql stable security invoker set search_path = public as $$
  select user_id from public.presence where user_id = any(ids) and last_seen > now() - interval '100 seconds'
$$;
revoke all on function public.online_users(uuid[]) from public, anon;
grant execute on function public.online_users(uuid[]) to authenticated;
notify pgrst, 'reload schema';
