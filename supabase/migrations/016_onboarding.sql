-- (016) أول دخول: الاسم + تاريخ الميلاد + الجنس قبل ما يدخل المنصة
-- البيانات الحساسة (تاريخ الميلاد والجنس) في جدول خاص: صاحبها والفريق بس هم اللي يشوفوها
alter table public.profiles add column if not exists onboarded boolean not null default false;
-- كل الحسابات الموجودة قبل التحديث ده تعتبر مكمّلة بياناتها (متتطلبش شاشة البداية)
update public.profiles set onboarded = true where onboarded = false;

create table if not exists public.profile_private (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  birth_date date not null,
  gender     text not null check (gender in ('male','female')),
  updated_at timestamptz not null default now()
);
alter table public.profile_private enable row level security;
drop policy if exists pp_select on public.profile_private;
create policy pp_select on public.profile_private for select to authenticated
  using (user_id = auth.uid() or public.is_staff());
grant select on public.profile_private to authenticated;

create or replace function public.complete_onboarding(p_name text, p_birth date, p_gender text)
returns void language plpgsql security definer set search_path = public as $$
declare nm text := btrim(coalesce(p_name,''));
begin
  if auth.uid() is null then raise exception 'سجّل دخول الأول'; end if;
  if char_length(nm) < 2 or char_length(nm) > 60 then raise exception 'الاسم لازم يكون من 2 لـ 60 حرف'; end if;
  if p_gender not in ('male','female') then raise exception 'اختار الجنس'; end if;
  if p_birth is null or p_birth > current_date or p_birth < date '1900-01-01' then raise exception 'تاريخ الميلاد غير صحيح'; end if;
  if p_birth > (current_date - interval '13 years')::date then raise exception 'لازم يكون عمرك 13 سنة على الأقل'; end if;
  update profiles set name = nm, onboarded = true where id = auth.uid();
  insert into profile_private(user_id, birth_date, gender) values (auth.uid(), p_birth, p_gender)
    on conflict (user_id) do update set birth_date = excluded.birth_date, gender = excluded.gender, updated_at = now();
end $$;
revoke all on function public.complete_onboarding(text,date,text) from public, anon;
grant execute on function public.complete_onboarding(text,date,text) to authenticated;
notify pgrst, 'reload schema';
