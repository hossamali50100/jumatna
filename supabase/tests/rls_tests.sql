\set ON_ERROR_STOP 0
create temp table res(name text, ok bool);
grant all on res to authenticated, anon;
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', u::text, false); end $$;
-- users (as postgres)
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-00000000000a','a@x.com'),('00000000-0000-0000-0000-00000000000b','b@x.com'),
 ('00000000-0000-0000-0000-00000000000c','c@x.com'),('00000000-0000-0000-0000-00000000000d','d@x.com');
update profiles set role='admin' where id='00000000-0000-0000-0000-00000000000d';
update profiles set plan='premium' where id='00000000-0000-0000-0000-00000000000c';
create or replace function pg_temp.t(n text, q text, expect_ok bool) returns void language plpgsql as $$
declare ok bool;
begin
  begin execute q; ok := true; exception when others then ok := false; end;
  insert into pg_temp.res values (n || case when ok then ' (allowed)' else ' (blocked)' end, ok = expect_ok);
end $$;
\set A '\'00000000-0000-0000-0000-00000000000a\''
set role authenticated;
select pg_temp.as_user(:A);
select pg_temp.t('A creates group 1', $q$insert into groups(id,owner_id,name,privacy) values('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000a','Pub','public')$q$, true);
select pg_temp.t('A creates 2nd group (free limit)', $q$insert into groups(owner_id,name) values('00000000-0000-0000-0000-00000000000a','Two')$q$, false);
select pg_temp.t('A makes private group as owner=B (spoof)', $q$insert into groups(owner_id,name) values('00000000-0000-0000-0000-00000000000b','Spoof')$q$, false);
select pg_temp.t('A upgrades himself to premium', $q$update profiles set plan='premium' where id='00000000-0000-0000-0000-00000000000a'$q$, false);
select pg_temp.t('A makes himself admin', $q$update profiles set role='admin' where id='00000000-0000-0000-0000-00000000000a'$q$, false);
select pg_temp.t('A renames himself', $q$update profiles set name='New' where id='00000000-0000-0000-0000-00000000000a'$q$, true);
select pg_temp.t('A calls admin_set_plan', $q$select admin_set_plan('00000000-0000-0000-0000-00000000000a','premium',30)$q$, false);
select pg_temp.t('A posts in own group', $q$insert into posts(id,group_id,author_id,body) values('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000a','hello')$q$, true);
select pg_temp.t('A private group', $q$insert into groups(id,owner_id,name,privacy) values('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-00000000000a','Priv','private')$q$, false); -- free limit already used
reset role;
-- premium user C makes 2 private
update profiles set plan='premium' where id='00000000-0000-0000-0000-00000000000a';
set role authenticated;
select pg_temp.t('A(premium) private group', $q$insert into groups(id,owner_id,name,privacy) values('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-00000000000a','Priv','private')$q$, true);
select pg_temp.t('A private post', $q$insert into posts(id,group_id,author_id,body) values('44444444-4444-4444-4444-444444444444','33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-00000000000a','secret')$q$, true);
reset role; update profiles set plan='free' where id='00000000-0000-0000-0000-00000000000a'; set role authenticated;
-- user B
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.t('B posts without joining', $q$insert into posts(group_id,author_id,body) values('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000b','x')$q$, false);
select pg_temp.t('B joins public as member', $q$insert into group_members(group_id,user_id,role,status) values('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000b','member','active')$q$, true);
select pg_temp.t('B posts after joining', $q$insert into posts(group_id,author_id,body) values('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000b','hi')$q$, true);
select pg_temp.t('B posts as A (spoof author)', $q$insert into posts(group_id,author_id,body) values('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000a','x')$q$, false);
select pg_temp.t('B joins private as active (bypass approval)', $q$insert into group_members(group_id,user_id,role,status) values('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-00000000000b','member','active')$q$, false);
select pg_temp.t('B joins private as admin', $q$insert into group_members(group_id,user_id,role,status) values('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-00000000000b','admin','pending')$q$, false);
select pg_temp.t('B requests private (pending)', $q$insert into group_members(group_id,user_id,role,status) values('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-00000000000b','member','pending')$q$, true);
select pg_temp.t('B approves himself', $q$update group_members set status='active' where group_id='33333333-3333-3333-3333-333333333333' and user_id='00000000-0000-0000-0000-00000000000b'$q$, true); -- 0 rows, no error
select pg_temp.t('B sees private posts (must be 0 rows)', $q$do $d$ begin if (select count(*) from posts where group_id='33333333-3333-3333-3333-333333333333')>0 then raise exception 'LEAK'; end if; end $d$$q$, true);
select pg_temp.t('B sees private group row (must be 0)', $q$do $d$ begin if (select count(*) from groups where id='33333333-3333-3333-3333-333333333333')>0 then raise exception 'LEAK'; end if; end $d$$q$, true);
select pg_temp.t('B deletes A post', $q$do $d$ begin delete from posts where id='22222222-2222-2222-2222-222222222222'; if found then raise exception 'DELETED'; end if; end $d$$q$, true);
select pg_temp.t('B edits group', $q$do $d$ begin update groups set name='hack' where id='11111111-1111-1111-1111-111111111111'; if found then raise exception 'EDITED'; end if; end $d$$q$, true);
select pg_temp.t('B comments as member', $q$insert into comments(post_id,author_id,body) values('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-00000000000b','nice')$q$, true);
select pg_temp.t('B bans someone', $q$select admin_set_banned('00000000-0000-0000-0000-00000000000a', true)$q$, false);
select pg_temp.t('B reads reports (0 rows)', $q$do $d$ begin if (select count(*) from reports)>0 then raise exception 'LEAK'; end if; end $d$$q$, true);
-- A (owner) can approve B and delete B's comment
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.t('A approves B', $q$do $d$ begin update group_members set status='active' where group_id='33333333-3333-3333-3333-333333333333' and user_id='00000000-0000-0000-0000-00000000000b'; if not found then raise exception 'NO'; end if; end $d$$q$, true);
select pg_temp.t('A deletes B comment (moderation)', $q$do $d$ begin delete from comments where author_id='00000000-0000-0000-0000-00000000000b'; if not found then raise exception 'NO'; end if; end $d$$q$, true);
select pg_temp.t('A demotes owner row? (owner->member)', $q$do $d$ begin update group_members set role='member' where group_id='33333333-3333-3333-3333-333333333333' and user_id='00000000-0000-0000-0000-00000000000a'; if found then raise exception 'DEMOTED'; end if; end $d$$q$, true);
-- banned user
reset role; update profiles set banned=true where id='00000000-0000-0000-0000-00000000000b'; set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.t('banned B posts', $q$insert into posts(group_id,author_id,body) values('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000b','x')$q$, false);
-- admin D
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.t('admin upgrades B', $q$select admin_set_plan('00000000-0000-0000-0000-00000000000b','premium',30)$q$, true);
select pg_temp.t('admin bans admin', $q$select admin_set_banned('00000000-0000-0000-0000-00000000000d', true)$q$, false);
select pg_temp.t('admin reads private posts', $q$do $d$ begin if (select count(*) from posts where group_id='33333333-3333-3333-3333-333333333333')=0 then raise exception 'NO'; end if; end $d$$q$, true);
-- rate limit: A posts 20 more → 21st total fails
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ begin for i in 1..17 loop insert into posts(group_id,author_id,body) values('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000a','p'||i); end loop; end $$;
select pg_temp.t('A 20th post ok', $q$insert into posts(group_id,author_id,body) values('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000a','p19')$q$, true);
select pg_temp.t('A 21st post rate-limited', $q$insert into posts(group_id,author_id,body) values('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000a','p20')$q$, false);
select pg_temp.t('A 6000-char post', format($q$insert into posts(group_id,author_id,body) values('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000a',%L)$q$, repeat('x',6000)), false);
-- anon
reset role; set role anon;
select pg_temp.t('anon reads profiles', $q$do $d$ begin if (select count(*) from profiles)>0 then raise exception 'LEAK'; end if; end $d$$q$, true);
reset role;
select case when ok then 'PASS ' else 'FAIL ' end || name from pg_temp.res order by ok, name;
