-- ============================================================
-- 004: الملف الشخصي (نبذة + غلاف) + المنشورات الشخصية تظهر للأصدقاء
-- شغّله مرة واحدة في Supabase ← SQL Editor
-- ============================================================
alter table public.profiles add column if not exists bio text not null default '' check (char_length(bio) <= 300);
alter table public.profiles add column if not exists cover_url text;
grant update (bio, cover_url) on public.profiles to authenticated;

-- الأصدقاء المقبولين بيبانوا لأي مسجّل (زي قايمة الأصدقاء في فيسبوك)؛ الطلبات المعلّقة تفضل خاصة
drop policy if exists fr_select on public.friendships;
create policy fr_select on public.friendships for select to authenticated
  using (status = 'accepted' or requester_id = auth.uid() or addressee_id = auth.uid() or public.is_staff());

-- المنشور الشخصي يشوفه: صاحبه + أصدقاؤه + الإدارة
create or replace function public.can_see_post(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from posts p
                 where p.id = pid
                   and ( (p.group_id is null and (p.author_id = auth.uid() or public.are_friends(p.author_id, auth.uid()) or public.is_staff()))
                      or (p.group_id is not null and (public.group_is_public(p.group_id) or public.is_member(p.group_id) or public.is_staff())) ));
$$;
drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts for select to authenticated
  using ( (group_id is null and (author_id = auth.uid() or public.are_friends(author_id, auth.uid()) or public.is_staff()))
       or (group_id is not null and (public.group_is_public(group_id) or public.is_member(group_id) or public.is_staff())) );

-- الأصدقاء يقدروا يعملوا لايك وتعليق على المنشور الشخصي
drop policy if exists likes_insert on public.likes;
create policy likes_insert on public.likes for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from posts p where p.id = post_id
              and ( (p.group_id is null and (p.author_id = auth.uid() or public.are_friends(p.author_id, auth.uid())))
                 or (p.group_id is not null and public.is_member(p.group_id)) )));
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = auth.uid() and not public.is_banned()
              and exists (select 1 from posts p where p.id = post_id
                          and ( (p.group_id is null and (p.author_id = auth.uid() or public.are_friends(p.author_id, auth.uid())))
                             or (p.group_id is not null and public.is_member(p.group_id)) )));

-- يخلي واجهة البيانات تلاحظ الأعمدة/الجداول الجديدة فورًا
notify pgrst, 'reload schema';
