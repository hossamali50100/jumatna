-- (045) تعديل البوست بعد النشر (صاحب البوست بس). بيتسجّل وقت آخر تعديل عشان تظهر علامة "تم التعديل".
alter table public.posts add column if not exists edited_at timestamptz;

create or replace function public.edit_post(p_id uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r record; b text := btrim(coalesce(p_body,''));
begin
  if me is null then raise exception 'سجّل دخولك الأول'; end if;
  if public.is_banned() then raise exception 'الحساب محظور'; end if;
  select author_id, ad_id, image_url into r from posts where id = p_id;
  if not found then raise exception 'البوست مش موجود'; end if;
  if r.author_id <> me then raise exception 'تقدر تعدّل بوستاتك بس'; end if;
  if r.ad_id is not null then raise exception 'مش مسموح'; end if;
  if char_length(b) > 5000 then raise exception 'النص أطول من 5000 حرف'; end if;
  if b = '' and r.image_url is null then raise exception 'اكتب نص للبوست'; end if;
  update posts set body = b, edited_at = now() where id = p_id;
end $$;
revoke all on function public.edit_post(uuid, text) from public, anon;
grant execute on function public.edit_post(uuid, text) to authenticated;
notify pgrst, 'reload schema';
