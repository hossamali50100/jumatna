-- (028) ردود الفعل زي فيسبوك: أعجبني / أحببته / أدعمه / أضحكني / أدهشني / أحزنني / أغضبني
alter table public.likes add column if not exists reaction text not null default 'like';
alter table public.comment_likes add column if not exists reaction text not null default 'like';
alter table public.likes drop constraint if exists likes_reaction_chk;
alter table public.likes add constraint likes_reaction_chk check (reaction in ('like','love','care','haha','wow','sad','angry'));
alter table public.comment_likes drop constraint if exists comment_likes_reaction_chk;
alter table public.comment_likes add constraint comment_likes_reaction_chk check (reaction in ('like','love','care','haha','wow','sad','angry'));

-- تغيير نوع التفاعل: صاحبه بس، والعمود الوحيد اللي يتعدّل
drop policy if exists likes_update on public.likes;
create policy likes_update on public.likes for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.likes from authenticated, anon;
grant update (reaction) on public.likes to authenticated;
drop policy if exists cl_update on public.comment_likes;
create policy cl_update on public.comment_likes for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.comment_likes from authenticated, anon;
grant update (reaction) on public.comment_likes to authenticated;
notify pgrst, 'reload schema';
