-- ============================================================
-- تحديث 2: المنشورات الشخصية (بوست من غير مجموعة، بيظهر على صفحة صاحبه)
-- شغّله مرة واحدة في Supabase > SQL Editor > Run (على قاعدة البيانات الحالية)
-- ============================================================
alter table public.posts alter column group_id drop not null;

create or replace function public.can_see_post(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from posts p
                 where p.id = pid
                   and ( (p.group_id is null and (p.author_id = auth.uid() or public.is_staff()))
                      or (p.group_id is not null and (public.group_is_public(p.group_id) or public.is_member(p.group_id) or public.is_staff())) ));
$$;

drop policy if exists posts_select on public.posts;
drop policy if exists posts_insert on public.posts;
drop policy if exists posts_delete on public.posts;
drop policy if exists comments_insert on public.comments;
drop policy if exists comments_delete on public.comments;
drop policy if exists likes_insert on public.likes;

create policy posts_select on public.posts for select to authenticated
  using ( (group_id is null and (author_id = auth.uid() or public.is_staff()))
       or (group_id is not null and (public.group_is_public(group_id) or public.is_member(group_id) or public.is_staff())) );
create policy posts_insert on public.posts for insert to authenticated
  with check (author_id = auth.uid() and not public.is_banned()
              and (group_id is null or public.is_member(group_id)));
create policy posts_delete on public.posts for delete to authenticated
  using (author_id = auth.uid() or (group_id is not null and public.is_group_admin(group_id)) or public.is_staff());

create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = auth.uid() and not public.is_banned()
              and exists (select 1 from posts p where p.id = post_id
                          and ( (p.group_id is null and p.author_id = auth.uid())
                             or (p.group_id is not null and public.is_member(p.group_id)) )));
create policy comments_delete on public.comments for delete to authenticated
  using (author_id = auth.uid() or public.is_staff()
         or exists (select 1 from posts p where p.id = post_id
                    and (p.author_id = auth.uid() or (p.group_id is not null and public.is_group_admin(p.group_id)))));
create policy likes_insert on public.likes for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from posts p where p.id = post_id
              and ( (p.group_id is null and p.author_id = auth.uid())
                 or (p.group_id is not null and public.is_member(p.group_id)) )));
