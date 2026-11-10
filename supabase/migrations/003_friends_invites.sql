-- ============================================================
-- 003: الأصدقاء + دعوات المجموعات
-- شغّله مرة واحدة في Supabase ← SQL Editor
-- ============================================================

-- ---------- الأصدقاء ----------
create table if not exists public.friendships (
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','accepted')),
  created_at   timestamptz not null default now(),
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
-- يمنع تكرار نفس الزوج بالعكس (أ→ب و ب→أ)
create unique index if not exists friendships_pair_uniq on public.friendships
  (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_addressee_idx on public.friendships (addressee_id);
alter table public.friendships enable row level security;

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from friendships
                 where status = 'accepted'
                   and ((requester_id = a and addressee_id = b) or (requester_id = b and addressee_id = a)));
$$;

drop policy if exists fr_select on public.friendships;
drop policy if exists fr_insert on public.friendships;
drop policy if exists fr_update on public.friendships;
drop policy if exists fr_delete on public.friendships;
create policy fr_select on public.friendships for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid() or public.is_staff());
create policy fr_insert on public.friendships for insert to authenticated
  with check (requester_id = auth.uid() and status = 'pending' and not public.is_banned());
-- اللي اتبعتله الطلب بس هو اللي يقبل
create policy fr_update on public.friendships for update to authenticated
  using (addressee_id = auth.uid() and status = 'pending')
  with check (addressee_id = auth.uid() and status = 'accepted');
create policy fr_delete on public.friendships for delete to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());
revoke update on public.friendships from authenticated, anon;
grant  update (status) on public.friendships to authenticated;

-- ---------- دعوات المجموعات ----------
create table if not exists public.group_invites (
  group_id   uuid not null references public.groups(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, invitee_id),
  check (inviter_id <> invitee_id)
);
create index if not exists group_invites_invitee_idx on public.group_invites (invitee_id);
alter table public.group_invites enable row level security;

drop policy if exists gi_select on public.group_invites;
drop policy if exists gi_insert on public.group_invites;
drop policy if exists gi_delete on public.group_invites;
create policy gi_select on public.group_invites for select to authenticated
  using (inviter_id = auth.uid() or invitee_id = auth.uid() or public.is_staff());
-- تدعو بس لو: انت عضو في المجموعة + المدعو صديقك + مش عضو أصلًا
create policy gi_insert on public.group_invites for insert to authenticated
  with check (
    inviter_id = auth.uid() and not public.is_banned()
    and public.is_member(group_id)
    and public.are_friends(auth.uid(), invitee_id)
    and not exists (select 1 from group_members gm where gm.group_id = group_invites.group_id and gm.user_id = invitee_id)
  );
create policy gi_delete on public.group_invites for delete to authenticated
  using (invitee_id = auth.uid() or inviter_id = auth.uid() or public.is_group_admin(group_id));

-- حد الدعوات: 50 في الساعة (ضد الإزعاج)
create or replace function public.rate_limit_invites() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from group_invites where inviter_id = new.inviter_id and created_at > now() - interval '1 hour') >= 50 then
    raise exception 'دعوات كتير في وقت قصير، جرّب بعد شوية.';
  end if;
  return new;
end $$;
drop trigger if exists rate_limit_invites_trg on public.group_invites;
create trigger rate_limit_invites_trg before insert on public.group_invites
  for each row execute function public.rate_limit_invites();

-- قبول الدعوة: دالة محمية (المدعو ما يقدرش يضيف نفسه "نشط" في مجموعة خاصة بنفسه)
-- لو المجموعة خاصة والداعي مجرد عضو عادي → الطلب بيروح لموافقة المشرف
create or replace function public.accept_group_invite(gid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare inv group_invites; st text;
begin
  if public.is_banned() then raise exception 'الحساب محظور'; end if;
  select * into inv from group_invites where group_id = gid and invitee_id = auth.uid();
  if not found then raise exception 'الدعوة غير موجودة'; end if;
  if exists (select 1 from groups where id = gid and privacy = 'public')
     or exists (select 1 from group_members where group_id = gid and user_id = inv.inviter_id
                and status = 'active' and role in ('owner','admin')) then
    st := 'active';
  else
    st := 'pending';
  end if;
  insert into group_members (group_id, user_id, role, status) values (gid, auth.uid(), 'member', st)
    on conflict (group_id, user_id) do nothing;
  delete from group_invites where group_id = gid and invitee_id = auth.uid();
  return st;
end $$;
revoke all on function public.accept_group_invite(uuid) from public, anon;
grant execute on function public.accept_group_invite(uuid) to authenticated;

-- المدعو يقدر يشوف اسم المجموعة الخاصة اللي اتدعى لها
create or replace function public.is_invited(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_invites where group_id = gid and invitee_id = auth.uid());
$$;
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups for select to authenticated
  using (privacy = 'public' or public.is_member(id) or public.is_invited(id) or public.is_staff());

-- يخلي واجهة البيانات تلاحظ الأعمدة/الجداول الجديدة فورًا
notify pgrst, 'reload schema';
