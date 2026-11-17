-- (047) تعديل البوست: النص + الصور (حذف صورة / تغييرها / إضافة صور لحد 4). صاحب البوست بس.
create or replace function public.edit_post_full(p_id uuid, p_body text, p_images text[]) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r record; b text := btrim(coalesce(p_body,'')); imgs text[] := coalesce(p_images, '{}'); old text[]; u text;
begin
  if me is null then raise exception 'سجّل دخولك الأول'; end if;
  if public.is_banned() then raise exception 'الحساب محظور'; end if;
  select author_id, ad_id, image_url, extra_images into r from posts where id = p_id;
  if not found then raise exception 'البوست مش موجود'; end if;
  if r.author_id <> me then raise exception 'تقدر تعدّل بوستاتك بس'; end if;
  if r.ad_id is not null then raise exception 'مش مسموح'; end if;
  if char_length(b) > 5000 then raise exception 'النص أطول من 5000 حرف'; end if;
  if cardinality(imgs) > 4 then raise exception 'أقصى عدد 4 صور'; end if;
  if b = '' then raise exception 'اكتب نص للبوست'; end if;
  old := array_remove(array[r.image_url] || coalesce(r.extra_images, '{}'), null);
  foreach u in array imgs loop
    -- الصورة لازم تكون من صور البوست الحالية، أو صورة جديدة مرفوعة في فولدر صاحب البوست
    if u is null or not (u = any(old) or (u ~ '^https://[^/]+/storage/v1/object/public/media/' and position('/media/' || me::text || '/' in u) > 0)) then
      raise exception 'رابط صورة غير صحيح';
    end if;
  end loop;
  update posts set body = b, image_url = imgs[1], extra_images = coalesce(imgs[2:], '{}'), edited_at = now() where id = p_id;
end $$;
revoke all on function public.edit_post_full(uuid, text, text[]) from public, anon;
grant execute on function public.edit_post_full(uuid, text, text[]) to authenticated;
notify pgrst, 'reload schema';
