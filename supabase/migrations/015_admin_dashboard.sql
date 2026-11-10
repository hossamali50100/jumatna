-- (015) لوحة الإدارة: إعدادات المنصة (الاسم/الشعار) + تغيير الأدوار (للأدمن بس)
create table if not exists public.platform_settings (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.platform_settings enable row level security;
drop policy if exists ps_select on public.platform_settings;
drop policy if exists ps_write  on public.platform_settings;
create policy ps_select on public.platform_settings for select to anon, authenticated using (true);
create policy ps_write  on public.platform_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
insert into public.platform_settings(key, value) values ('name','جمعتنا'), ('logo_url','')
  on conflict (key) do nothing;

create or replace function public.admin_set_role(target uuid, new_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  if new_role not in ('user','mod','support','admin') then raise exception 'دور غير صحيح'; end if;
  if target = auth.uid() then raise exception 'مينفعش تغيّر دورك أنت'; end if;
  update profiles set role = new_role where id = target;
end $$;
revoke all on function public.admin_set_role(uuid,text) from public, anon;
grant execute on function public.admin_set_role(uuid,text) to authenticated;
notify pgrst, 'reload schema';
