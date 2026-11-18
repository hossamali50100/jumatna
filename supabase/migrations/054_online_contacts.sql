-- (054) حالة "متصل" بتظهر للأصدقاء، وكمان لأي حد بينكم محادثة من الطرفين (هو بعتلك وأنت بعتله).
-- الغريب اللي بعت رسالة بس ومحدش رد عليه مش بيعرف إنت متصل ولا لأ. الحظر بيخفي الحالة زي الأول.

-- فيه رسايل رايحة وجاية بين الشخصين؟
create or replace function public.mutual_dm(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from dm_messages where sender_id = a and recipient_id = b)
     and exists (select 1 from dm_messages where sender_id = b and recipient_id = a);
$$;
revoke all on function public.mutual_dm(uuid, uuid) from public, anon;
grant execute on function public.mutual_dm(uuid, uuid) to authenticated;
create index if not exists dm_messages_pair_idx on public.dm_messages (sender_id, recipient_id);

-- مين من الأشخاص دول متصل دلوقتي (آخر نبضة من أقل من 100 ثانية) ومسموحلي أشوف حالته
create or replace function public.online_contacts(ids uuid[]) returns setof uuid
language sql stable security definer set search_path = public as $$
  select p.user_id from public.presence p
  where auth.uid() is not null and p.user_id = any(ids[1:300])
    and p.last_seen > now() - interval '100 seconds'
    and p.user_id <> auth.uid()
    and not public.blocked_between(p.user_id, auth.uid())
    and (public.are_friends(p.user_id, auth.uid()) or public.mutual_dm(p.user_id, auth.uid()));
$$;
revoke all on function public.online_contacts(uuid[]) from public, anon;
grant execute on function public.online_contacts(uuid[]) to authenticated;
notify pgrst, 'reload schema';
