-- ============================================================
-- 005: حذف الحساب (خلال 24 ساعة، ويتلغي لو الشخص دخل تاني)
-- شغّله مرة واحدة في Supabase ← SQL Editor
-- ============================================================
alter table public.profiles add column if not exists deletion_requested_at timestamptz;
-- المستخدم ما يقدر يعدّل العمود ده مباشرة (الـ grant على أعمدة محددة بس) — بيتعدّل من الدوال تحت

-- طلب الحذف: بيطبّق على صاحب الجلسة بس (ما بياخدش id من برة)
create or replace function public.request_account_deletion() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'لازم تسجل دخول'; end if;
  if exists (select 1 from profiles where id = auth.uid() and role <> 'user') then
    raise exception 'حسابات الإدارة ما تتحذفش من هنا';
  end if;
  update profiles set deletion_requested_at = now() where id = auth.uid();
end $$;

-- إلغاء الحذف: بيتنادى أوتوماتيك لما الشخص يسجل دخول تاني
create or replace function public.cancel_account_deletion() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'لازم تسجل دخول'; end if;
  update profiles set deletion_requested_at = null where id = auth.uid();
end $$;

-- الحذف الفعلي: بيتشغّل من جدولة السيرفر بس (مش من الموقع)
create or replace function public.purge_deleted_accounts() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with gone as (
    delete from auth.users
    where id in (select id from public.profiles
                 where deletion_requested_at is not null
                   and deletion_requested_at <= now() - interval '24 hours'
                   and role = 'user')
    returning 1)
  select count(*) into n from gone;
  return n;
end $$;

revoke all on function public.request_account_deletion() from public, anon;
revoke all on function public.cancel_account_deletion()  from public, anon;
revoke all on function public.purge_deleted_accounts()   from public, anon, authenticated;
grant execute on function public.request_account_deletion() to authenticated;
grant execute on function public.cancel_account_deletion()  to authenticated;

-- جدولة: كل نص ساعة (محتاجة إضافة pg_cron؛ لو مش متاحة هتظهر ملاحظة ومش هيفشل الملف)
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('purge-deleted-accounts', '*/30 * * * *', 'select public.purge_deleted_accounts()');
exception when others then
  raise notice 'pg_cron مش متاحة: فعّلها من Database ← Extensions ثم شغّل الملف تاني. السبب: %', sqlerrm;
end $$;

notify pgrst, 'reload schema';
