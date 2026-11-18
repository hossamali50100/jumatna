-- (049) بحث تقريبي: بيجيب الأسماء اللي فيها كلمة شبه اللي اتكتب بنسبة 80% على الأقل (بيتحمّل غلطة في حرف)،
-- أو كلمة بتبدأ باللي اتكتب. النتائج مترتبة من الأقرب للأبعد. أقل حاجة 3 حروف.
create schema if not exists extensions;
create extension if not exists fuzzystrmatch with schema extensions;

-- توحيد الحروف العربية قبل المقارنة: أ إ آ ← ا، ة ← ه، ى ← ي، وشيل التشكيل والتطويل
create or replace function public.norm_ar(t text) returns text
language sql immutable parallel safe as $$
  select btrim(regexp_replace(
    translate(lower(coalesce(t,'')), 'أإآٱةىؤئ' || 'ًٌٍَُِّْـ', 'ااااهيوي'),
    '\s+', ' ', 'g'));
$$;

-- درجة التشابه بين اسم وكلمة البحث (من 0 لـ 1)
create or replace function public.search_score(p_name text, p_q text) returns real
-- security definer: عشان دالة levenshtein (في مخطط extensions) تشتغل لأي مستخدم. الدالة مش بتقرا أي جدول.
language plpgsql immutable parallel safe security definer set search_path = public, extensions as $$
declare n text := norm_ar(p_name); q text := norm_ar(p_q); w text; c text; best real := 0; s real; ql int := char_length(norm_ar(p_q));
begin
  if ql < 3 or n = '' then return 0; end if;
  -- الاسم كله (مفيد لو البحث أكتر من كلمة)
  if left(n, ql) = q then return 1; end if;
  if char_length(n) <= 60 then
    best := greatest(best, 1 - levenshtein(left(n, 255), left(q, 255))::real / greatest(char_length(n), ql));
  end if;
  foreach w in array regexp_split_to_array(n, ' ') loop
    foreach c in array array[w, case when w like 'ال%' and char_length(w) > 3 then substr(w, 3) else w end] loop
      if left(c, ql) = q then return 1; end if;            -- الكلمة بتبدأ باللي اتكتب
      s := 1 - levenshtein(left(c, 255), left(q, 255))::real / greatest(char_length(c), ql);
      if s > best then best := s; end if;
      -- مقارنة بأول جزء من الكلمة بنفس الطول (عشان "محبن" تجيب "محبين مصر")
      if char_length(c) > ql then
        s := 1 - levenshtein(left(c, ql), q)::real / ql;
        if s > best then best := s; end if;
      end if;
    end loop;
  end loop;
  return best;
end $$;

-- بحث المجموعات (بيحترم صلاحيات الرؤية: المجموعات الخاصة مش بتظهر لغير أعضائها)
create or replace function public.search_groups(p_q text, p_limit integer default 40)
returns setof public.groups language sql stable security invoker set search_path = public, extensions as $$
  select g.* from (select g, public.search_score(g.name, p_q) sc from public.groups g) x, lateral (select (x.g).*) g
  where char_length(norm_ar(p_q)) >= 3 and x.sc >= 0.8
  order by x.sc desc, g.created_at desc
  limit least(greatest(coalesce(p_limit, 40), 1), 50);
$$;
grant execute on function public.search_groups(text, integer) to authenticated;

-- بحث الأشخاص (من غير الشخص نفسه)
create or replace function public.search_people(p_q text, p_limit integer default 40)
returns table (id uuid, name text, avatar_url text, bio text, plan text, plan_until timestamptz)
language sql stable security invoker set search_path = public, extensions as $$
  select p.id, p.name, p.avatar_url, p.bio, p.plan::text, p.plan_until
  from (select p.*, public.search_score(p.name, p_q) sc from public.profiles p) p
  where char_length(norm_ar(p_q)) >= 3 and p.sc >= 0.8 and p.id <> auth.uid()
  order by p.sc desc, p.name
  limit least(greatest(coalesce(p_limit, 40), 1), 50);
$$;
grant execute on function public.search_people(text, integer) to authenticated;
grant execute on function public.norm_ar(text) to authenticated;
grant execute on function public.search_score(text, text) to authenticated;
notify pgrst, 'reload schema';
