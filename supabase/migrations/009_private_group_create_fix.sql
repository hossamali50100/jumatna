-- (009) إصلاح: إنشاء مجموعة خاصة كان بيفشل بخطأ "violates row-level security policy for table groups"
-- السبب: بعد الإدراج السيرفر بيرجّع الصف، ومالك المجموعة الخاصة ماكانش يقدر "يشوفها" قبل ما يتسجّل كعضو.
-- الحل: المالك يشوف مجموعته دايمًا.
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups for select to authenticated
  using (privacy = 'public' or owner_id = auth.uid() or public.is_member(id) or public.is_invited(id) or public.is_staff());
notify pgrst, 'reload schema';
