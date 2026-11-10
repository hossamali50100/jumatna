-- (011) إصلاح: المنشور الشخصي كان بيطلّع "new row violates row-level security policy for table posts"
-- ده بيحصل لو سياسة إضافة المنشورات القديمة (من غير دعم المنشور الشخصي) لسه شغالة.
-- آمن تشغّله في أي وقت، ومايغيّرش أي حاجة تانية (مهم: ماتشغّلش 002 تاني).
alter table public.posts alter column group_id drop not null;
drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert to authenticated
  with check (author_id = auth.uid() and not public.is_banned()
              and (group_id is null or public.is_member(group_id)));
notify pgrst, 'reload schema';
