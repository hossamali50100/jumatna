-- (050) البحث بالحروف الصح بس (بيلغي التصحيح التلقائي بتاع 049):
-- النتيجة لازم فيها كلمة بتبدأ باللي اتكتب بنفس الحروف بالظبط، واللي اتكتب يغطي 80% من الكلمة على الأقل.
-- مثال: "محبي" تجيب "محبين مصر" (4 من 5)، لكن "محب" (3 من 5) و"مهبين" (حرف غلط) لأ.
-- الكلمة اللي قبلها "ال" بتتحسب بالحالتين: "مصريين" تجيب "المصريين".
-- مفيش توحيد للحروف (ة غير ه، أ غير ا)؛ بنشيل التشكيل والتطويل بس، وبنتجاهل الحروف الكبيرة والصغيرة في الإنجليزي.

create or replace function public.norm_ar(t text) returns text
language sql immutable parallel safe as $$
  select btrim(regexp_replace(translate(lower(coalesce(t,'')), 'ًٌٍَُِّْـ', ''), '\s+', ' ', 'g'));
$$;

create or replace function public.search_score(p_name text, p_q text) returns real
language plpgsql immutable parallel safe set search_path = public as $$
declare n text := norm_ar(p_name); q text := norm_ar(p_q); ql int; nl int; i int; s int; tail text; cov real; best real := 0;
begin
  ql := char_length(q); nl := char_length(n);
  if ql < 3 or nl = 0 then return 0; end if;
  for i in 1 .. nl loop
    if i = 1 or substr(n, i - 1, 1) = ' ' then           -- بداية كلمة
      foreach s in array array[i, case when substr(n, i, 2) = 'ال' and left(q, 2) <> 'ال' then i + 2 else 0 end] loop
        if s > 0 and substr(n, s, ql) = q then
          tail := substring(substr(n, s + ql) from '^[^ ]*');  -- باقي الكلمة اللي ما اتكتبش
          cov := ql::real / (ql + char_length(coalesce(tail, '')));  -- نسبة اللي اتكتب من الكلام
          if cov > best then best := cov; end if;
        end if;
      end loop;
    end if;
  end loop;
  return best;
end $$;

create or replace function public.search_groups(p_q text, p_limit integer default 40)
returns setof public.groups language sql stable security invoker set search_path = public as $$
  select g.* from public.groups g
  where char_length(public.norm_ar(p_q)) >= 3 and public.search_score(g.name, p_q) >= 0.8
  order by public.search_score(g.name, p_q) desc, g.created_at desc
  limit least(greatest(coalesce(p_limit, 40), 1), 50);
$$;
grant execute on function public.search_groups(text, integer) to authenticated;

create or replace function public.search_people(p_q text, p_limit integer default 40)
returns table (id uuid, name text, avatar_url text, bio text, plan text, plan_until timestamptz)
language sql stable security invoker set search_path = public as $$
  select p.id, p.name, p.avatar_url, p.bio, p.plan::text, p.plan_until from public.profiles p
  where char_length(public.norm_ar(p_q)) >= 3 and p.id <> auth.uid() and public.search_score(p.name, p_q) >= 0.8
  order by public.search_score(p.name, p_q) desc, p.name
  limit least(greatest(coalesce(p_limit, 40), 1), 50);
$$;
grant execute on function public.search_people(text, integer) to authenticated;
grant execute on function public.norm_ar(text) to authenticated;
grant execute on function public.search_score(text, text) to authenticated;
notify pgrst, 'reload schema';
