-- (043) الحساب الجديد (جوجل أو إيميل) ما ياخدش صورة جوجل تلقائي: بيبدأ من غير صورة
-- والموقع بيعرض دايرة ملونة بأول حرف من الاسم لحد ما صاحب الحساب يرفع صورته بنفسه.
-- (الحسابات القديمة ما بتتغيّرش.)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name, avatar_url)
  values (
    new.id,
    left(coalesce(nullif(new.raw_user_meta_data->>'full_name',''),
                  nullif(new.raw_user_meta_data->>'name',''),
                  split_part(new.email,'@',1), 'مستخدم'), 60),
    null
  );
  return new;
end $$;
notify pgrst, 'reload schema';
