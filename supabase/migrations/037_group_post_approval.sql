-- (037) موافقة مشرف المجموعة على البوستات:
--  المشرف يقدر يفعّل "الموافقة قبل النشر" (أو يسيبها مفتوحة). لو مفعّلة، بوست أي عضو عادي
--  بيفضل "بانتظار الموافقة" ومش بيظهر غير لصاحبه والمشرفين لحد ما المشرف يوافق (أو يرفض فيتحذف).
alter table public.groups add column if not exists require_approval boolean not null default false;
alter table public.posts  add column if not exists approval text not null default 'approved';
alter table public.posts  drop constraint if exists posts_approval_chk;
alter table public.posts  add constraint posts_approval_chk check (approval in ('approved','pending'));
create index if not exists posts_pending_idx on public.posts (group_id, created_at desc) where approval = 'pending';

-- السيرفر هو اللي بيحدد حالة البوست (العضو ميقدرش يوافق على بوست نفسه)
create or replace function public.posts_set_approval() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.approval := 'approved';
    if new.group_id is not null
       and exists (select 1 from groups g where g.id = new.group_id and g.require_approval)
       and not exists (select 1 from group_members m where m.group_id = new.group_id and m.user_id = new.author_id
                         and m.status = 'active' and m.role in ('owner','admin')) then
      new.approval := 'pending';
    end if;
  elsif new.approval is distinct from old.approval and coalesce(current_setting('app.review', true), '') <> '1' then
    new.approval := old.approval;
  end if;
  return new;
end $$;
drop trigger if exists posts_set_approval_trg on public.posts;
create trigger posts_set_approval_trg before insert or update on public.posts
  for each row execute function public.posts_set_approval();

-- لو المشرف قفل خاصية الموافقة: كل البوستات المعلّقة تتنشر
create or replace function public.groups_release_pending() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.require_approval and not new.require_approval then
    perform set_config('app.review', '1', true);
    update posts set approval = 'approved' where group_id = new.id and approval = 'pending';
    perform set_config('app.review', '', true);
  end if;
  return new;
end $$;
drop trigger if exists groups_release_pending_trg on public.groups;
create trigger groups_release_pending_trg after update of require_approval on public.groups
  for each row execute function public.groups_release_pending();

-- موافقة (true) أو رفض (false = البوست يتحذف)
create or replace function public.review_post(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  select group_id into gid from posts where id = p_id and approval = 'pending';
  if gid is null then raise exception 'البوست ده مش بانتظار موافقة'; end if;
  if not (public.is_group_admin(gid) or public.is_staff()) then raise exception 'مش مسموح'; end if;
  if p_approve then
    perform set_config('app.review', '1', true);
    update posts set approval = 'approved', created_at = now() where id = p_id;
    perform set_config('app.review', '', true);
  else
    delete from posts where id = p_id;
  end if;
end $$;
revoke all on function public.review_post(uuid, boolean) from public, anon;
grant execute on function public.review_post(uuid, boolean) to authenticated;

-- البوست المعلّق يشوفه صاحبه والمشرفين والإدارة بس
create or replace function public.can_see_post(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from posts p
                 where p.id = pid
                   and ( (p.ad_id is not null and (public.ad_live(p.ad_id) or public.is_staff()))
                      or (p.ad_id is null and p.group_id is null and (p.author_id = auth.uid() or public.are_friends(p.author_id, auth.uid()) or public.is_staff()))
                      or (p.group_id is not null and (public.group_is_public(p.group_id) or public.is_member(p.group_id) or public.is_staff())
                          and (p.approval = 'approved' or p.author_id = auth.uid() or public.is_group_admin(p.group_id) or public.is_staff())) ));
$$;
drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts for select to authenticated
  using ( (ad_id is not null and (public.ad_live(ad_id) or public.is_staff()))
       or (ad_id is null and group_id is null and (author_id = auth.uid() or public.are_friends(author_id, auth.uid()) or public.is_staff()))
       or (group_id is not null and (public.group_is_public(group_id) or public.is_member(group_id) or public.is_staff())
           and (approval = 'approved' or author_id = auth.uid() or public.is_group_admin(group_id) or public.is_staff())) );
notify pgrst, 'reload schema';
