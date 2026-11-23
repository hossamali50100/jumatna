-- (055) المنشن (@اسم) في الدردشات الجماعية: الشخص اللي اتعمله منشن بيوصله إشعار.
-- الرسالة بتشيل أرقام الأشخاص اللي اتعملهم منشن (لحد 20)، والسيرفر بيتأكد إنهم أعضاء في الشات.
alter table public.chat_room_messages add column if not exists mentions uuid[] not null default '{}';
alter table public.chat_room_messages drop constraint if exists crm_mentions_chk;
alter table public.chat_room_messages add constraint crm_mentions_chk check (cardinality(mentions) <= 20);

-- نوع إشعار جديد + ربط الإشعار بالشات الجماعي
alter table public.notifications add column if not exists room_id uuid references public.chat_rooms(id) on delete cascade;
do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'public.notifications'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%type%' loop
    execute format('alter table public.notifications drop constraint %I', c);
  end loop;
  for c in select conname from pg_constraint where conrelid = 'public.notification_prefs'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%type%' loop
    execute format('alter table public.notification_prefs drop constraint %I', c);
  end loop;
end $$;
alter table public.notifications add constraint notifications_type_check check (type in ('post_like','post_comment','comment_reply','comment_like','friend_request','friend_accept','group_invite','group_join','room_mention'));
alter table public.notification_prefs add constraint notification_prefs_type_check check (type in ('all','post_like','post_comment','comment_reply','comment_like','friend_request','friend_accept','group_invite','group_join','room_mention'));

create or replace function public.notify_room_mentions() returns trigger
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  if cardinality(new.mentions) = 0 then return new; end if;
  foreach u in array (select array_agg(distinct x) from unnest(new.mentions) x) loop
    if u = new.sender_id or not public.is_room_member(new.room_id, u) or public.blocked_between(u, new.sender_id) then continue; end if;
    if exists (select 1 from notification_prefs where user_id = u and type in ('room_mention', 'all') and not enabled) then continue; end if;
    -- منشن جديد من نفس الشخص في نفس الشات بيطلع فوق كإشعار جديد بدل ما يتكرر
    delete from notifications where user_id = u and actor_id = new.sender_id and type = 'room_mention' and room_id = new.room_id;
    insert into notifications(user_id, actor_id, type, room_id) values (u, new.sender_id, 'room_mention', new.room_id) on conflict do nothing;
  end loop;
  return new;
end $$;
drop trigger if exists room_mentions_notify on public.chat_room_messages;
create trigger room_mentions_notify after insert on public.chat_room_messages
  for each row execute function public.notify_room_mentions();
notify pgrst, 'reload schema';
