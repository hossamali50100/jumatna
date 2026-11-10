-- (010) قفل الحساب الشخصي: الغريب يشوف بيانات أساسية بس (الاسم، الصورة، الغلاف، النبذة)
-- ومايشوفش الأصدقاء ولا المجموعات. أصحابك والإدارة يشوفوا كل حاجة.
alter table public.profiles add column if not exists is_locked boolean not null default false;
grant update (is_locked) on public.profiles to authenticated;

-- هل المستخدم الحالي يقدر يشوف تفاصيل الشخص ده (أصدقاءه ومجموعاته)؟
create or replace function public.can_see_details(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select uid = auth.uid()
      or public.is_staff()
      or not coalesce((select is_locked from profiles where id = uid), false)
      or public.are_friends(uid, auth.uid());
$$;
grant execute on function public.can_see_details(uuid) to authenticated;

-- الصداقات المقبولة: تبان بس لو الطرفين مش مقفولين (أو أنا طرف فيها أو صديق للمقفول)
drop policy if exists fr_select on public.friendships;
create policy fr_select on public.friendships for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid() or public.is_staff()
         or (status = 'accepted' and public.can_see_details(requester_id) and public.can_see_details(addressee_id)));

-- عضوية المجموعات: عضو المقفول يختفي عن الغرباء (أعضاء نفس المجموعة يشوفوا بعض)
drop policy if exists gm_select on public.group_members;
create policy gm_select on public.group_members for select to authenticated
  using (user_id = auth.uid() or public.is_staff() or public.is_member(group_id)
         or (public.group_is_public(group_id) and public.can_see_details(user_id)));
notify pgrst, 'reload schema';
