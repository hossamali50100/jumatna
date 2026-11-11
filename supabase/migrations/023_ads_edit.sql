-- 023: تعديل الإعلان بالكامل من صفحة تفاصيله (أدمن بس)
create or replace function public.admin_update_ad(p_id uuid, p_title text, p_body text, p_image text,
                                                  p_adv_name text, p_adv_avatar text,
                                                  p_ends_at timestamptz, p_target integer, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare st timestamptz;
begin
  if not public.is_admin() then raise exception 'للأدمن بس'; end if;
  if char_length(btrim(coalesce(p_body,''))) < 1 then raise exception 'اكتب نص الإعلان'; end if;
  if char_length(btrim(coalesce(p_adv_name,''))) < 1 then raise exception 'اكتب اسم المعلِن'; end if;
  if coalesce(p_target,0) < 1 then raise exception 'عدد المستخدمين لازم يكون 1 على الأقل'; end if;
  if p_status not in ('active','paused') then raise exception 'حالة غير صحيحة'; end if;
  select starts_at into st from ads where id = p_id;
  if st is null then raise exception 'الإعلان مش موجود'; end if;
  if p_ends_at is null or p_ends_at <= st then raise exception 'تاريخ الانتهاء لازم يكون بعد بداية الإعلان'; end if;
  update ads set title = left(btrim(coalesce(nullif(p_title,''), p_adv_name)), 80),
                 advertiser_name = left(btrim(p_adv_name), 60), advertiser_avatar = nullif(p_adv_avatar,''),
                 ends_at = p_ends_at, target_viewers = p_target, status = p_status
  where id = p_id;
  update posts set body = btrim(p_body), image_url = nullif(p_image,'') where ad_id = p_id;
end $$;
grant execute on function public.admin_update_ad(uuid, text, text, text, text, text, timestamptz, integer, text) to authenticated;
notify pgrst, 'reload schema';
