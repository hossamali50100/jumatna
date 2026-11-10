-- (013) الرد على التعليقات + الإعجاب بالتعليقات
alter table public.comments add column if not exists parent_id uuid references public.comments(id) on delete cascade;
create index if not exists comments_parent_idx on public.comments (parent_id);

-- الرد يبقى على مستوى واحد بس، وعلى تعليق في نفس البوست
create or replace function public.check_comment_parent() returns trigger
language plpgsql security definer set search_path = public as $$
declare pp comments;
begin
  if new.parent_id is null then return new; end if;
  select * into pp from comments where id = new.parent_id;
  if not found or pp.post_id <> new.post_id or pp.parent_id is not null then
    raise exception 'الرد لازم يكون على تعليق رئيسي في نفس البوست.';
  end if;
  return new;
end $$;
drop trigger if exists comments_parent_trg on public.comments;
create trigger comments_parent_trg before insert on public.comments
  for each row execute function public.check_comment_parent();

-- مين يقدر يتفاعل (لايك) مع بوست: صاحبه وأصدقاؤه (شخصي) أو أعضاء المجموعة
create or replace function public.can_interact_post(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from posts p where p.id = pid
    and ( (p.group_id is null and (p.author_id = auth.uid() or public.are_friends(p.author_id, auth.uid())))
       or (p.group_id is not null and public.is_member(p.group_id)) ));
$$;
create or replace function public.comment_post(cid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select post_id from comments where id = cid;
$$;
grant execute on function public.can_interact_post(uuid), public.comment_post(uuid) to authenticated;

create table if not exists public.comment_likes (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
alter table public.comment_likes enable row level security;
drop policy if exists cl_select on public.comment_likes;
drop policy if exists cl_insert on public.comment_likes;
drop policy if exists cl_delete on public.comment_likes;
create policy cl_select on public.comment_likes for select to authenticated
  using (public.can_see_post(public.comment_post(comment_id)));
create policy cl_insert on public.comment_likes for insert to authenticated
  with check (user_id = auth.uid() and not public.is_banned() and public.can_interact_post(public.comment_post(comment_id)));
create policy cl_delete on public.comment_likes for delete to authenticated
  using (user_id = auth.uid());
revoke all on public.comment_likes from anon, authenticated;
grant select, insert, delete on public.comment_likes to authenticated;
notify pgrst, 'reload schema';
