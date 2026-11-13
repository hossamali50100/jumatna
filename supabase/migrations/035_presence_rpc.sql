-- (035) متصل / غير متصل — حل أقوى: النبضة والقراية بقوا دوال على السيرفر
-- (مش بيعتمدوا على صلاحيات الجدول)، والوقت كله من السيرفر.
create or replace function public.heartbeat() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.presence(user_id, last_seen) values (auth.uid(), now())
  on conflict (user_id) do update set last_seen = now();
end $$;
revoke all on function public.heartbeat() from public, anon;
grant execute on function public.heartbeat() to authenticated;

-- الأصدقاء المتصلين دلوقتي (آخر نبضة من أقل من 100 ثانية)
create or replace function public.online_friends() returns setof uuid
language sql stable security definer set search_path = public as $$
  select p.user_id from public.presence p
  where auth.uid() is not null and p.last_seen > now() - interval '100 seconds'
    and p.user_id <> auth.uid() and public.are_friends(p.user_id, auth.uid())
    and not public.blocked_between(p.user_id, auth.uid())
$$;
revoke all on function public.online_friends() from public, anon;
grant execute on function public.online_friends() to authenticated;
notify pgrst, 'reload schema';
