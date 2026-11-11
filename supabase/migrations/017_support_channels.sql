-- (017) فصل محادثة الدعم عن محادثة طلبات الترقية + مسح المحادثة
alter table public.support_messages add column if not exists channel text not null default 'support';
alter table public.support_messages drop constraint if exists support_messages_channel_check;
alter table public.support_messages add constraint support_messages_channel_check check (channel in ('support','upgrade'));
-- الرسائل القديمة اللي كانت على موضوع "الباقة المميزة" تروح لمحادثة الترقية
update public.support_messages set channel = 'upgrade' where topic = 'premium' and channel = 'support';
create index if not exists support_chan_idx on public.support_messages (user_id, channel, created_at);

-- مسح محادثة كاملة: صاحبها يمسح محادثته، والفريق يمسح أي محادثة
create or replace function public.clear_support_chat(p_user uuid, p_channel text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'سجّل دخول الأول'; end if;
  if p_channel not in ('support','upgrade') then raise exception 'محادثة غير صحيحة'; end if;
  if p_user <> auth.uid() and not public.is_staff() then raise exception 'غير مسموح'; end if;
  delete from support_messages where user_id = p_user and channel = p_channel;
end $$;
revoke all on function public.clear_support_chat(uuid,text) from public, anon;
grant execute on function public.clear_support_chat(uuid,text) to authenticated;
notify pgrst, 'reload schema';
