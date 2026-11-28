-- (059) التسجيل بالإيميل مسموح بس بإيميلات Gmail و Yahoo
-- عشان نقلل الإيميلات الوهمية اللي بترجع (Supabase بعت تحذير بسببها).
-- • الدخول بزرار Google مش متأثر (أي حساب جوجل مسموح).
-- • الحسابات القديمة مش متأثرة، ودخولها عادي.
-- • لو حبيت تضيف دومين، زوّده في القايمة هنا وفي src/lib/emailrules.ts
create or replace function public.allowed_signup_domain(p_email text) returns boolean
language sql immutable as $$
  select lower(split_part(coalesce(p_email, ''), '@', 2)) in ('gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com');
$$;

create or replace function public.check_signup_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- الحسابات اللي جاية من Google (أو أي مزوّد تاني غير الإيميل) مسموحة
  if coalesce(new.raw_app_meta_data ->> 'provider', 'email') <> 'email' then return new; end if;
  if tg_op = 'INSERT' and new.email is not null and not public.allowed_signup_domain(new.email) then
    raise exception 'email_domain_not_allowed' using errcode = 'check_violation';
  end if;
  -- تغيير الإيميل لإيميل تاني برضه لازم يكون Gmail أو Yahoo
  if tg_op = 'UPDATE' and coalesce(new.email_change, '') <> '' and new.email_change is distinct from old.email_change
     and not public.allowed_signup_domain(new.email_change) then
    raise exception 'email_domain_not_allowed' using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists check_signup_email_trg on auth.users;
create trigger check_signup_email_trg before insert on auth.users
  for each row execute function public.check_signup_email();
drop trigger if exists check_email_change_trg on auth.users;
create trigger check_email_change_trg before update of email_change on auth.users
  for each row execute function public.check_signup_email();
