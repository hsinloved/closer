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

-- Questions from each other -------------------------------------------------------
select pg_temp.as_user(:A);
insert into public.questions (couple_id, author_id, body, lv) values (public.my_couple(), auth.uid(), 'What did you dream about last night?', 'know');
reset role;
select pg_temp.as_user(:B);
select pg_temp.check((select count(*) = 0 from public.questions), 'B cannot read A''s waiting question');
select pg_temp.check((select waiting = 1 from public.pending_questions() where author_id = :A), 'B can see that one question from A is waiting');
update public.questions set body = 'hijacked';
delete from public.questions;
do $$ begin
  insert into public.questions (couple_id, author_id, body) values (public.my_couple(), 'aaaaaaaa-0000-0000-0000-000000000001', 'forged');
  raise exception 'FAILED: wrote a question as the partner';
exception when insufficient_privilege or check_violation then raise notice 'ok: cannot write a question as your partner';
end $$;
do $$ begin
  insert into public.rounds (couple_id, lv, body, asked_by, drawn_by) values (public.my_couple(), 'know', 'forged', 'aaaaaaaa-0000-0000-0000-000000000001', auth.uid());
  raise exception 'FAILED: inserted a custom card directly';
exception when insufficient_privilege then raise notice 'ok: custom cards only come from dealing';
end $$;
reset role;
select pg_temp.as_user(:A);
select pg_temp.check((select body = 'What did you dream about last night?' from public.questions), 'the partner cannot edit or withdraw your question');
reset role;
select pg_temp.as_user(:X);
select pg_temp.check((select count(*) = 0 from public.questions) and (select count(*) = 0 from public.pending_questions()), 'a stranger sees no questions, not even counts');
reset role;

select pg_temp.as_user(:A);
insert into public.questions (couple_id, author_id, body, lv)
  select public.my_couple(), auth.uid(), 'Question ' || n, 'deep' from generate_series(2, 5) n;
do $$ begin
  insert into public.questions (couple_id, author_id, body) values (public.my_couple(), auth.uid(), 'One too many');
  raise exception 'FAILED: a sixth waiting question';
exception when others then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: five waiting questions per person (%)', sqlerrm;
end $$;
reset role;

-- B opens the app first on the 5th: the daily card is A's oldest question.
select pg_temp.as_user(:B);
select id as d5, body as d5_body, asked_by as d5_by from public.deal_round('2026-11-05', 'play', 2) \gset
select pg_temp.check(:'d5_body' = 'What did you dream about last night?' and :'d5_by' = :A, 'a waiting question becomes the daily card');
select pg_temp.check((select idx is null and lv = 'know' from public.rounds where id = :'d5'), 'it keeps the tone its author picked');
select pg_temp.check((select public.deal_round('2026-11-05', 'play', 2)) is null, 'the daily card is dealt once');
select pg_temp.check((select body is null and idx = 4 from public.deal_round('2026-11-06', 'world', 4)), 'the next day comes from the deck');
select pg_temp.check((select body = 'Question 2' from public.deal_round('2026-11-07', 'world', 5)), 'every other day, the next waiting question');
select pg_temp.check((select body is null from public.deal_round(null, 'know', 7)), 'bonus draws always come from the deck');
insert into public.questions (couple_id, author_id, body, lv) values (public.my_couple(), auth.uid(), 'From B', 'play');
reset role;
select pg_temp.as_user(:A);
select pg_temp.check((select count(*) = 3 from public.questions), 'dealt questions leave the waiting pile');
select pg_temp.check((select body = 'From B' and asked_by = :B from public.deal_round('2026-11-09', 'know', 8)), 'askers take turns');
select pg_temp.check((select body = 'Question 3' from public.deal_round('2026-11-11', 'know', 9)), 'then back to the other');
reset role;

select pg_temp.as_user(:B);
update public.couples set ask_rhythm = 'whenever';
select pg_temp.check((select body = 'Question 4' from public.deal_round('2026-11-12', 'know', 10)), 'whenever: a question every day one is waiting');
update public.couples set ask_rhythm = 'asked';
select pg_temp.check((select body is null from public.deal_round('2026-11-13', 'know', 11)), 'ask-now only: the daily card stays in the deck');
select pg_temp.check((select body = 'Tonight?' and asked_by = auth.uid() and day is null from public.ask_now('  Tonight? ', 'play')), 'ask now deals your question straight away');
update public.couples set ask_rhythm = 'whenever', daily_enabled = false;
select pg_temp.check((select body = 'Question 5' from public.deal_round(null, 'know', 12)), 'with no daily card, drawing brings up waiting questions');
update public.couples set ask_rhythm = 'asked', daily_enabled = true;
do $$ begin
  perform public.ask_now('Wild one', 'wild');
  raise exception 'FAILED: asked with a deck-only tone';
exception when others then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: questions use one of the four tones';
end $$;
do $$ begin
  perform public.deal('aaaaaaaa-0000-0000-0000-000000000001', auth.uid(), '2026-11-20', 'know', 1);
  raise exception 'FAILED: called deal() directly';
exception when insufficient_privilege then raise notice 'ok: only the server can deal for any couple';
end $$;
reset role;
select pg_temp.as_user(:X);
do $$ begin
  perform public.ask_now('Hello?', 'know');
  raise exception 'FAILED: asked without a partner';
exception when others then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: no asking before your partner joins';
end $$;
reset role;
select pg_temp.as_user(null);
do $$ begin
  perform public.deal_round('2026-11-20', 'know', 1);
  raise exception 'FAILED: anon dealt';
exception when insufficient_privilege then raise notice 'ok: signed-out visitors cannot deal';
end $$;
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
  and (select count(*) = 0 from public.answers) and (select count(*) = 0 from public.questions), 'a reset removes the pair, its cards, answers and questions for both');
select pg_temp.as_user(:A);
select public.create_couple('Celeste') is not null as repaired \gset
select pg_temp.check((select count(*) = 1 from public.members), 'you can pair again after a reset');
reset role;

select 'ALL RLS CHECKS PASSED' as result;
