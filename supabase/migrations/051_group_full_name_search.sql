-- (051) بحث المجموعات بالاسم الكامل:
-- المجموعة تظهر بس لما اللي اتكتب يطابق "أول" اسمها حرف بحرف ويغطي 80% من الاسم كله على الأقل.
-- مثال: مجموعة "جنس ديني" تظهر لـ "جنس ديني" أو "جنس دينى"، لكن مش لـ "جنس" لوحدها ولا "ديني" لوحدها.
-- "ال" في أول الاسم اختيارية: "مصريين في الخارج" تجيب "المصريين في الخارج".
-- ى و ي بقوا زي بعض (في البحث بس). بحث الأشخاص فاضل بالكلمة (عشان الاسم الأول يكفي).

create or replace function public.norm_ar(t text) returns text
language sql immutable parallel safe as $$
  select btrim(regexp_replace(translate(lower(coalesce(t,'')), 'ىًٌٍَُِّْـ', 'ي'), '\s+', ' ', 'g'));
$$;

create or replace function public.search_score_full(p_name text, p_q text) returns real
language plpgsql immutable parallel safe set search_path = public as $$
declare n text := norm_ar(p_name); q text := norm_ar(p_q); ql int := char_length(norm_ar(p_q)); best real := 0;
begin
  if ql < 3 or n = '' then return 0; end if;
  if left(n, ql) = q then best := ql::real / char_length(n); end if;
  if left(n, 2) = 'ال' and left(q, 2) <> 'ال' and substr(n, 3, ql) = q then
    best := greatest(best, ql::real / (char_length(n) - 2));
  end if;
  return best;
end $$;
grant execute on function public.search_score_full(text, text) to authenticated;

create or replace function public.search_groups(p_q text, p_limit integer default 40)
returns setof public.groups language sql stable security invoker set search_path = public as $$
  select g.* from public.groups g
  where char_length(public.norm_ar(p_q)) >= 3 and public.search_score_full(g.name, p_q) >= 0.8
  order by public.search_score_full(g.name, p_q) desc, g.created_at desc
  limit least(greatest(coalesce(p_limit, 40), 1), 50);
$$;
grant execute on function public.search_groups(text, integer) to authenticated;
notify pgrst, 'reload schema';
