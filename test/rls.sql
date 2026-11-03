-- Row-level security checks for supabase/migrations/0001_closer.sql.
-- Run on a scratch database after test/supabase-stub.sql and the migration:
--   psql -v ON_ERROR_STOP=1 -f test/supabase-stub.sql -f supabase/migrations/0001_closer.sql -f test/rls.sql
-- Each check raises if the database lets something through it should not, so a clean run prints only NOTICEs.

\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
\set B '''bbbbbbbb-0000-0000-0000-000000000002'''
\set X '''eeeeeeee-0000-0000-0000-000000000003'''
insert into auth.users (id, email) values (:A, 'a@example.com'), (:B, 'b@example.com'), (:X, 'x@example.com');

create function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), false);
  if u is null then set role anon; else set role authenticated; end if;
end $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;

-- Pairing ---------------------------------------------------------------
select pg_temp.as_user(:A);
select invite_code as code from public.create_couple('Celeste') \gset
reset role;
select pg_temp.as_user(:B);
select public.join_couple(lower(:'code'), ' Michael ') is not null as joined \gset
select pg_temp.check((select count(*) = 2 from public.members), 'B sees both members after joining');
select pg_temp.check((select name = 'Michael' from public.members where user_id = auth.uid()), 'names are trimmed');
reset role;

-- psql variables do not reach DO blocks, so hand the code over as a setting.
select set_config('my.code', :'code', false);
select pg_temp.as_user(:X);
do $$ begin
  perform public.join_couple(current_setting('my.code'), 'Eve');
  raise exception 'FAILED: a third person joined';
exception when others then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: a third person cannot join with the real code (%)', sqlerrm;
end $$;
select public.create_couple('Eve') is not null as x_paired \gset
select pg_temp.check((select count(*) = 1 from public.members), 'a stranger only sees their own couple');
select pg_temp.check((select count(*) = 1 from public.couples), 'a stranger only sees one couple row');
reset role;

select pg_temp.as_user(:A);
do $$ begin
  perform public.create_couple('Again');
  raise exception 'FAILED: joined two couples';
exception when others then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: one couple per person';
end $$;
reset role;

-- Cards -------------------------------------------------------------------
select pg_temp.as_user(:A);
insert into public.rounds (couple_id, lv, idx, day, drawn_by) values (public.my_couple(), 'know', 3, '2026-11-02', auth.uid()) returning id as r1 \gset
reset role;
select set_config('my.r1', :'r1', false);

select pg_temp.as_user(:B);
do $$ begin
  insert into public.rounds (couple_id, lv, idx, day, drawn_by) values (public.my_couple(), 'play', 1, '2026-11-02', auth.uid());
  raise exception 'FAILED: two daily cards on one day';
exception when unique_violation then raise notice 'ok: one daily card per day';
end $$;
reset role;

select pg_temp.as_user(:X);
do $$ begin
  insert into public.rounds (couple_id, lv, idx, drawn_by)
    select couple_id, 'know', 1, auth.uid() from public.rounds limit 1;
  if found then raise exception 'FAILED: stranger could see a round to copy'; end if;
  insert into public.rounds (couple_id, lv, idx, drawn_by) values ((select id from public.couples limit 1), 'know', 1, 'aaaaaaaa-0000-0000-0000-000000000001');
  raise exception 'FAILED: drew a card as someone else';
exception when insufficient_privilege or check_violation then raise notice 'ok: cards are drawn only as yourself (%)', sqlerrm;
end $$;
select pg_temp.check((select count(*) = 0 from public.rounds), 'a stranger sees none of our cards');
reset role;

select pg_temp.as_user(:A);
do $$ begin
  insert into public.rounds (couple_id, lv, idx, drawn_by, answered_by) values (public.my_couple(), 'know', 1, auth.uid(), array[auth.uid()]);
  raise exception 'FAILED: pre-filled answered_by';
exception when insufficient_privilege or check_violation then raise notice 'ok: answered_by cannot be forged';
end $$;

-- Sealed answers -------------------------------------------------------------
insert into public.answers (round_id, user_id, body) values (:'r1', auth.uid(), 'Coffee on the balcony');
do $$ begin
  insert into public.answers (round_id, user_id, body) values (current_setting('my.r1')::uuid, 'bbbbbbbb-0000-0000-0000-000000000002', 'forged');
  raise exception 'FAILED: answered as the partner';
exception when insufficient_privilege or check_violation then raise notice 'ok: cannot answer as your partner';
end $$;
reset role;

select pg_temp.as_user(:B);
select pg_temp.check((select count(*) = 0 from public.answers where round_id = :'r1'), 'B cannot read A''s answer before answering');
select pg_temp.check((select :A::uuid = any (answered_by) from public.rounds where id = :'r1'), 'B can see that A has answered');
reset role;

select pg_temp.as_user(:A);
update public.answers set body = 'Coffee on the balcony, with you' where round_id = :'r1' and user_id = auth.uid();
select pg_temp.check((select body like '%with you' from public.answers where round_id = :'r1'), 'A can edit before the reveal');
reset role;

select pg_temp.as_user(:B);
insert into public.answers (round_id, user_id, body) values (:'r1', auth.uid(), 'Your laugh');
select pg_temp.check((select count(*) = 2 from public.answers where round_id = :'r1'), 'B reads both once B has answered');
reset role;

select pg_temp.as_user(:A);
select pg_temp.check((select count(*) = 2 from public.answers where round_id = :'r1'), 'A reads both after the reveal');
update public.answers set body = 'changed after reveal' where round_id = :'r1' and user_id = auth.uid();
select pg_temp.check((select body not like 'changed%' from public.answers where round_id = :'r1' and user_id = auth.uid()), 'answers are locked after the reveal');
reset role;

select pg_temp.as_user(:X);
select pg_temp.check((select count(*) = 0 from public.answers), 'a stranger reads no answers');
reset role;

select pg_temp.as_user(null);
do $$ begin
  perform count(*) from public.answers;
  raise exception 'FAILED: anon read answers';
exception when insufficient_privilege then raise notice 'ok: signed-out visitors read nothing';
end $$;
reset role;

-- Settings ------------------------------------------------------------------
select pg_temp.as_user(:B);
update public.couples set daily_hour = 9 where id = public.my_couple();
select pg_temp.check((select daily_hour = 9 from public.couples), 'either of you can change the daily time');
do $$ begin
  update public.couples set invite_code = 'HIJACK';
  raise exception 'FAILED: changed the invite code';
exception when insufficient_privilege then raise notice 'ok: invite code is read-only';
end $$;
update public.members set name = 'Mika' where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
reset role;
select pg_temp.as_user(:A);
select pg_temp.check((select name = 'Celeste' from public.members where user_id = auth.uid()), 'you cannot rename your partner');
reset role;

-- Push subscriptions -----------------------------------------------------------
select pg_temp.as_user(:A);
insert into public.push_subscriptions (endpoint, user_id, p256dh, auth) values ('https://push.example/a', auth.uid(), 'k', 's');
reset role;
select pg_temp.as_user(:B);
select pg_temp.check((select count(*) = 0 from public.push_subscriptions), 'devices are private to their owner');
reset role;

-- Reset pairing ---------------------------------------------------------------
-- X (Eve, alone in her own couple) cannot touch A and B's pair; resetting only ever removes your own.
select pg_temp.as_user(:X);
select public.reset_couple();
select pg_temp.check((select count(*) = 0 from public.members), 'reset removes your own couple');
reset role;
select pg_temp.check((select count(*) = 1 from public.couples), 'a reset leaves other couples alone');
select pg_temp.check((select count(*) = 2 from public.members), 'the other couple keeps both members');
select pg_temp.as_user(:X);
do $$ begin
  perform public.reset_couple();
  raise exception 'FAILED: reset without a couple';
exception when others then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: nothing to reset when unpaired';
end $$;
reset role;
select pg_temp.as_user(null);
do $$ begin
  perform public.reset_couple();
  raise exception 'FAILED: anon reset';
exception when insufficient_privilege then raise notice 'ok: signed-out visitors cannot reset';
end $$;
reset role;
select pg_temp.as_user(:B);
select public.reset_couple();
select pg_temp.check((select count(*) = 0 from public.members), 'after a reset you are unpaired');
reset role;
select pg_temp.check((select count(*) = 0 from public.couples) and (select count(*) = 0 from public.rounds)
  and (select count(*) = 0 from public.answers), 'a reset removes the pair, its cards and its answers for both');
select pg_temp.as_user(:A);
select public.create_couple('Celeste') is not null as repaired \gset
select pg_temp.check((select count(*) = 1 from public.members), 'you can pair again after a reset');
reset role;

select 'ALL RLS CHECKS PASSED' as result;
