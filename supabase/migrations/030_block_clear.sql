-- (030) حظر الأشخاص + حذف الدردشة من عندي بس (زي فيسبوك)
create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.user_blocks enable row level security;
drop policy if exists ub_select on public.user_blocks;
create policy ub_select on public.user_blocks for select to authenticated using (blocker_id = auth.uid() or public.is_staff());
revoke all on public.user_blocks from anon, authenticated;
grant select on public.user_blocks to authenticated;

create or replace function public.blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;
revoke all on function public.blocked_between(uuid, uuid) from public, anon;
grant execute on function public.blocked_between(uuid, uuid) to authenticated;

-- الحظر بيشيل الصداقة كمان
create or replace function public.block_user(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or target is null or target = auth.uid() then raise exception 'مش ممكن'; end if;
  insert into user_blocks(blocker_id, blocked_id) values (auth.uid(), target) on conflict do nothing;
  delete from friendships where (requester_id = auth.uid() and addressee_id = target) or (requester_id = target and addressee_id = auth.uid());
end $$;
create or replace function public.unblock_user(target uuid) returns void
language sql security definer set search_path = public as $$
  delete from user_blocks where blocker_id = auth.uid() and blocked_id = target;
$$;
revoke all on function public.block_user(uuid), public.unblock_user(uuid) from public, anon;
grant execute on function public.block_user(uuid), public.unblock_user(uuid) to authenticated;

-- المحظور (أو الحاظر) ما يقدرش يبعت رسالة أو طلب صداقة
drop policy if exists dm_insert on public.dm_messages;
create policy dm_insert on public.dm_messages for insert to authenticated
  with check (sender_id = auth.uid() and not public.is_banned() and not public.blocked_between(sender_id, recipient_id));
drop policy if exists fr_insert on public.friendships;
create policy fr_insert on public.friendships for insert to authenticated
  with check (requester_id = auth.uid() and status = 'pending' and not public.is_banned() and not public.blocked_between(requester_id, addressee_id));

-- حذف الدردشة من عندي: الرسائل القديمة بتختفي عندي بس، والطرف التاني يفضل شايفها
create table if not exists public.dm_clears (
  user_id uuid not null references public.profiles(id) on delete cascade,
  other_id uuid not null references public.profiles(id) on delete cascade,
  cleared_at timestamptz not null default now(),
  primary key (user_id, other_id)
);
alter table public.dm_clears enable row level security;
drop policy if exists dmc_select on public.dm_clears;
create policy dmc_select on public.dm_clears for select to authenticated using (user_id = auth.uid());
revoke all on public.dm_clears from anon, authenticated;
grant select on public.dm_clears to authenticated;
create or replace function public.clear_chat(other uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'مش ممكن'; end if;
  insert into dm_clears(user_id, other_id, cleared_at) values (auth.uid(), other, now())
    on conflict (user_id, other_id) do update set cleared_at = now();
  update dm_messages set read_at = now() where recipient_id = auth.uid() and sender_id = other and read_at is null;
end $$;
revoke all on function public.clear_chat(uuid) from public, anon;
grant execute on function public.clear_chat(uuid) to authenticated;
notify pgrst, 'reload schema';
