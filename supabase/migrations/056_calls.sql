-- (056) مكالمات فيديو وصوت بين شخصين
-- المكالمة مسموحة بس بين الأصدقاء، أو اللي بينهم محادثة من الطرفين، ومش بين محظورين.
-- الصوت والصورة نفسهم مش بيعدّوا على Supabase خالص. هنا بس "مين بيتصل بمين" ورسايل التوصيل بين المتصفحين.

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid not null references public.profiles(id) on delete cascade,
  callee_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'video' check (kind in ('video', 'audio')),
  status text not null default 'ringing' check (status in ('ringing', 'accepted', 'declined', 'missed', 'ended', 'canceled')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  check (caller_id <> callee_id)
);
create index if not exists calls_callee_idx on public.calls (callee_id, created_at desc);
create index if not exists calls_caller_idx on public.calls (caller_id, created_at desc);
alter table public.calls enable row level security;
drop policy if exists calls_select on public.calls;
create policy calls_select on public.calls for select to authenticated
  using (auth.uid() = caller_id or auth.uid() = callee_id);
-- مفيش إضافة أو تعديل مباشر: كله من الدوال اللي تحت
revoke all on public.calls from anon, authenticated;
grant select on public.calls to authenticated;

-- رسايل التوصيل (offer / answer / ice) بين الطرفين
create table if not exists public.call_signals (
  id bigint generated always as identity primary key,
  call_id uuid not null references public.calls(id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('offer', 'answer', 'ice')),
  payload jsonb not null check (octet_length(payload::text) < 20000),
  created_at timestamptz not null default now()
);
create index if not exists call_signals_call_idx on public.call_signals (call_id, id);
alter table public.call_signals enable row level security;
drop policy if exists cs_select on public.call_signals;
create policy cs_select on public.call_signals for select to authenticated
  using (exists (select 1 from public.calls c where c.id = call_id and auth.uid() in (c.caller_id, c.callee_id)));
drop policy if exists cs_insert on public.call_signals;
create policy cs_insert on public.call_signals for insert to authenticated
  with check (sender_id = auth.uid() and exists (
    select 1 from public.calls c where c.id = call_id and auth.uid() in (c.caller_id, c.callee_id) and c.status in ('ringing', 'accepted')));
revoke all on public.call_signals from anon, authenticated;
grant select, insert on public.call_signals to authenticated;

-- مسموح الاتنين دول يكلموا بعض؟
create or replace function public.can_call(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select a <> b and not public.blocked_between(a, b)
    and coalesce((select not banned from profiles where id = a), false)
    and coalesce((select not banned from profiles where id = b), false)
    and (public.are_friends(a, b) or public.mutual_dm(a, b));
$$;
revoke all on function public.can_call(uuid, uuid) from public, anon;
grant execute on function public.can_call(uuid, uuid) to authenticated;

-- بدء مكالمة
create or replace function public.start_call(p_callee uuid, p_kind text default 'video') returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); new_id uuid;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if p_kind not in ('video', 'audio') then raise exception 'bad_kind'; end if;
  if not public.can_call(me, p_callee) then raise exception 'call_not_allowed'; end if;
  if (select count(*) from calls where caller_id = me and created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'too_many_calls';
  end if;
  -- أي رنة قديمة من غير رد بقت فائتة، وأي مكالمة شغالة من زمان جدًا (المتصفح اتقفل) بتخلص
  update calls set status = 'missed', ended_at = now()
    where status = 'ringing' and created_at < now() - interval '60 seconds'
      and (caller_id in (me, p_callee) or callee_id in (me, p_callee));
  update calls set status = 'ended', ended_at = now()
    where status = 'accepted' and coalesce(answered_at, created_at) < now() - interval '6 hours'
      and (caller_id in (me, p_callee) or callee_id in (me, p_callee));
  -- لو عندي مكالمة تانية مفتوحة (تاب قديم مثلًا) بنقفلها
  update calls set status = case when status = 'ringing' then (case when caller_id = me then 'canceled' else 'declined' end) else 'ended' end,
                   ended_at = now()
    where status in ('ringing', 'accepted') and (caller_id = me or callee_id = me);
  -- الطرف التاني في مكالمة دلوقتي
  if exists (select 1 from calls where status in ('ringing', 'accepted') and (caller_id = p_callee or callee_id = p_callee)) then
    raise exception 'callee_busy';
  end if;
  insert into calls (caller_id, callee_id, kind) values (me, p_callee, p_kind) returning id into new_id;
  return new_id;
end $$;
revoke all on function public.start_call(uuid, text) from public, anon;
grant execute on function public.start_call(uuid, text) to authenticated;

-- الرد: قبول أو رفض
create or replace function public.answer_call(p_id uuid, p_accept boolean) returns text
language plpgsql security definer set search_path = public as $$
declare c calls;
begin
  select * into c from calls where id = p_id for update;
  if c.id is null or c.callee_id <> auth.uid() then raise exception 'call_not_found'; end if;
  if c.status <> 'ringing' then return c.status; end if;
  if c.created_at < now() - interval '60 seconds' then
    update calls set status = 'missed', ended_at = now() where id = p_id;
    return 'missed';
  end if;
  if p_accept then
    -- لو أنا في مكالمة تانية بنقفلها الأول
    update calls set status = 'ended', ended_at = now()
      where id <> p_id and status = 'accepted' and (caller_id = auth.uid() or callee_id = auth.uid());
    update calls set status = 'accepted', answered_at = now() where id = p_id;
    return 'accepted';
  end if;
  update calls set status = 'declined', ended_at = now() where id = p_id;
  return 'declined';
end $$;
revoke all on function public.answer_call(uuid, boolean) from public, anon;
grant execute on function public.answer_call(uuid, boolean) to authenticated;

-- إنهاء المكالمة (أو إلغاء الرنة). p_missed: المتصل استنى ومحدش رد
create or replace function public.end_call(p_id uuid, p_missed boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare c calls; st text;
begin
  select * into c from calls where id = p_id for update;
  if c.id is null or auth.uid() not in (c.caller_id, c.callee_id) then raise exception 'call_not_found'; end if;
  if c.status not in ('ringing', 'accepted') then return c.status; end if;
  st := case
    when c.status = 'accepted' then 'ended'
    when c.caller_id = auth.uid() and p_missed then 'missed'
    when c.caller_id = auth.uid() then 'canceled'
    else 'declined' end;
  update calls set status = st, ended_at = now() where id = p_id;
  return st;
end $$;
revoke all on function public.end_call(uuid, boolean) from public, anon;
grant execute on function public.end_call(uuid, boolean) to authenticated;

-- لما المكالمة تخلص نمسح رسايل التوصيل بتاعتها (مالهاش لازمة بعد كده)
create or replace function public.calls_cleanup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status not in ('ringing', 'accepted') then delete from call_signals where call_id = new.id; end if;
  return new;
end $$;
drop trigger if exists calls_cleanup_trg on public.calls;
create trigger calls_cleanup_trg after update of status on public.calls
  for each row when (new.status is distinct from old.status) execute function public.calls_cleanup();

do $$ begin
  begin alter publication supabase_realtime add table public.calls;
  exception when duplicate_object then null; when undefined_object then null; end;
  begin alter publication supabase_realtime add table public.call_signals;
  exception when duplicate_object then null; when undefined_object then null; end;
end $$;
notify pgrst, 'reload schema';
