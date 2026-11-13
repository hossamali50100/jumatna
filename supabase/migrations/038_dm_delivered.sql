-- (038) علامات الرسائل: ✓ اتبعتت — ✓✓ وصلت للطرف التاني — ✓✓ خضرا اتقرت
alter table public.dm_messages add column if not exists delivered_at timestamptz;
-- المستلم (جهازه/موقعه المفتوح) بيعلّم رسايله إنها "وصلت"
create or replace function public.mark_delivered() returns void
language sql security definer set search_path = public as $$
  update public.dm_messages set delivered_at = now()
  where recipient_id = auth.uid() and delivered_at is null
$$;
revoke all on function public.mark_delivered() from public, anon;
grant execute on function public.mark_delivered() to authenticated;
notify pgrst, 'reload schema';
