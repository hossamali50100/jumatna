-- (039) تحكم في الإشعارات: كل واحد يقفل أي نوع إشعار (أو الكل) من إعدادات الإشعارات.
create table if not exists public.notification_prefs (
  user_id uuid not null references public.profiles(id) on delete cascade,
  type    text not null check (type in ('all','post_like','post_comment','comment_reply','comment_like','friend_request','friend_accept','group_invite','group_join')),
  enabled boolean not null default true,
  primary key (user_id, type)
);
alter table public.notification_prefs enable row level security;
drop policy if exists np_select on public.notification_prefs;
drop policy if exists np_insert on public.notification_prefs;
drop policy if exists np_update on public.notification_prefs;
create policy np_select on public.notification_prefs for select to authenticated using (user_id = auth.uid());
create policy np_insert on public.notification_prefs for insert to authenticated with check (user_id = auth.uid());
create policy np_update on public.notification_prefs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.notification_prefs from anon, authenticated;
grant select, insert, update on public.notification_prefs to authenticated;
grant update (enabled) on public.notification_prefs to authenticated;

-- السيرفر مايبعتش إشعار النوع اللي المستخدم قافله (أو لو قافل الكل)
create or replace function public.push_notif(p_user uuid, p_actor uuid, p_type text, p_post uuid, p_group uuid, p_comment uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_user = p_actor then return; end if;
  if exists (select 1 from notification_prefs where user_id = p_user and type in (p_type, 'all') and not enabled) then return; end if;
  insert into notifications(user_id, actor_id, type, post_id, group_id, comment_id)
    values (p_user, p_actor, p_type, p_post, p_group, p_comment) on conflict do nothing;
end $$;
revoke all on function public.push_notif(uuid,uuid,text,uuid,uuid,uuid) from public, anon, authenticated;
notify pgrst, 'reload schema';
