-- (048) تعديل رسالة بعد إرسالها (الراسل بس، رسائل نصية بس، خلال 15 دقيقة من الإرسال).
alter table public.dm_messages add column if not exists edited_at timestamptz;
alter table public.chat_room_messages add column if not exists edited_at timestamptz;

create or replace function public.edit_message(p_kind text, p_id uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); b text := btrim(coalesce(p_body,'')); s uuid; au text; ca timestamptz;
begin
  if me is null then raise exception 'سجّل دخولك الأول'; end if;
  if public.is_banned() then raise exception 'الحساب محظور'; end if;
  if b = '' then raise exception 'الرسالة فاضية'; end if;
  if char_length(b) > 2000 then raise exception 'الرسالة أطول من 2000 حرف'; end if;
  if p_kind = 'dm' then
    select sender_id, audio_url, created_at into s, au, ca from dm_messages where id = p_id;
  elsif p_kind = 'room' then
    select sender_id, audio_url, created_at into s, au, ca from chat_room_messages where id = p_id;
  else raise exception 'نوع غير صحيح'; end if;
  if s is null then raise exception 'الرسالة مش موجودة'; end if;
  if s <> me then raise exception 'تقدر تعدّل رسايلك بس'; end if;
  if au is not null then raise exception 'الرسالة الصوتية مش بتتعدّل'; end if;
  if ca < now() - interval '15 minutes' then raise exception 'تعديل الرسالة متاح خلال 15 دقيقة بس من إرسالها'; end if;
  if p_kind = 'dm' then update dm_messages set body = b, edited_at = now() where id = p_id;
  else update chat_room_messages set body = b, edited_at = now() where id = p_id; end if;
end $$;
revoke all on function public.edit_message(text, uuid, text) from public, anon;
grant execute on function public.edit_message(text, uuid, text) to authenticated;
notify pgrst, 'reload schema';
