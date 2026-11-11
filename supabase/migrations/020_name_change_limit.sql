-- (020) تغيير الاسم مرة كل 30 يوم (بيتفرض من السيرفر)
alter table public.profiles add column if not exists name_changed_at timestamptz;

create or replace function public.profiles_name_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name and coalesce(current_setting('app.skip_name_limit', true), '') <> '1' then
    if old.name_changed_at is not null and old.name_changed_at > now() - interval '30 days' then
      raise exception 'تقدر تغيّر اسمك مرة كل 30 يوم. التغيير الجاي بعد % يوم.',
        ceil(extract(epoch from (old.name_changed_at + interval '30 days' - now())) / 86400)::int;
    end if;
    new.name_changed_at := now();
  end if;
  return new;
end $$;
drop trigger if exists profiles_name_limit_trg on public.profiles;
create trigger profiles_name_limit_trg before update of name on public.profiles
  for each row execute function public.profiles_name_limit();

-- شاشة أول دخول: اختيار الاسم أول مرة ما يحسبش كتغيير
create or replace function public.complete_onboarding(p_name text, p_birth date, p_gender text)
returns void language plpgsql security definer set search_path = public as $$
declare nm text := btrim(coalesce(p_name,''));
begin
  if auth.uid() is null then raise exception 'سجّل دخول الأول'; end if;
  if char_length(nm) < 2 or char_length(nm) > 60 then raise exception 'الاسم لازم يكون من 2 لـ 60 حرف'; end if;
  if p_gender not in ('male','female') then raise exception 'اختار الجنس'; end if;
  if p_birth is null or p_birth > current_date or p_birth < date '1900-01-01' then raise exception 'تاريخ الميلاد غير صحيح'; end if;
  if p_birth > (current_date - interval '13 years')::date then raise exception 'لازم يكون عمرك 13 سنة على الأقل'; end if;
  perform set_config('app.skip_name_limit', '1', true);
  update profiles set name = nm, onboarded = true where id = auth.uid();
  perform set_config('app.skip_name_limit', '0', true);
  insert into profile_private(user_id, birth_date, gender) values (auth.uid(), p_birth, p_gender)
    on conflict (user_id) do update set birth_date = excluded.birth_date, gender = excluded.gender, updated_at = now();
end $$;
notify pgrst, 'reload schema';
