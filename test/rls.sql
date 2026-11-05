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

-- Comments ------------------------------------------------------------------
-- r1 is revealed (both answered); B draws a second card nobody has answered yet.
select pg_temp.as_user(:B);
insert into public.rounds (couple_id, lv, idx, drawn_by) values (public.my_couple(), 'play', 1, auth.uid());
insert into public.comments (round_id, author_id, body) values (:'r1', auth.uid(), 'Love this');
select pg_temp.check((select count(*) = 1 from public.comments), 'you can comment once a card is revealed');
do $$ begin
  insert into public.comments (round_id, author_id, body) values ((select id from public.rounds where cardinality(answered_by) < 2 limit 1), auth.uid(), 'Peek');
  raise exception 'FAILED: commented on a sealed card';
exception when insufficient_privilege then raise notice 'ok: no comments before the reveal';
end $$;
do $$ begin
  insert into public.comments (round_id, author_id, body) values ((select id from public.rounds where cardinality(answered_by) = 2 limit 1), 'aaaaaaaa-0000-0000-0000-000000000001', 'As you');
  raise exception 'FAILED: commented as the partner';
exception when insufficient_privilege then raise notice 'ok: you cannot comment as your partner';
end $$;
do $$ begin
  insert into public.comments (round_id, author_id, body) values ((select id from public.rounds where cardinality(answered_by) = 2 limit 1), auth.uid(), 'Again');
  raise exception 'FAILED: two comments on one card';
exception when unique_violation then raise notice 'ok: one comment per person per card';
end $$;
reset role;
select pg_temp.as_user(:A);
select pg_temp.check((select body = 'Love this' from public.comments), 'your partner sees your comment');
update public.comments set body = 'Changed' where author_id <> auth.uid();
reset role;
select pg_temp.check((select body = 'Love this' from public.comments), 'you cannot edit your partner''s comment');
select pg_temp.as_user(:X);
select pg_temp.check((select count(*) = 0 from public.comments), 'strangers see no comments');
reset role;

-- Your own questions -------------------------------------------------------
-- Written cards now come from the pool (see below); here one is set up as deal_card would make it.
insert into public.rounds (couple_id, lv, idx, question, drawn_by, written_by)
  select couple_id, 'own', 0, 'What made you smile today?', user_id, user_id from public.members where user_id = :A;
select pg_temp.as_user(:B);
select pg_temp.check((select question = 'What made you smile today?' from public.rounds where lv = 'own'), 'your partner sees the question you wrote');
reset role;
do $$ begin
  insert into public.rounds (couple_id, lv, idx, drawn_by) select couple_id, 'own', 0, user_id from public.members where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  raise exception 'FAILED: own card without a question';
exception when check_violation then raise notice 'ok: a card of your own needs a question';
end $$;
select pg_temp.as_user(:B);
do $$ begin
  insert into public.rounds (couple_id, lv, idx, question, drawn_by) values (public.my_couple(), 'own', 0, 'Hi', 'aaaaaaaa-0000-0000-0000-000000000001');
  raise exception 'FAILED: wrote a question as the partner';
exception when insufficient_privilege then raise notice 'ok: you cannot write a question as your partner';
end $$;
reset role;
select pg_temp.as_user(:X);
select pg_temp.check((select count(*) = 0 from public.rounds where lv = 'own'), 'strangers cannot see your questions');
reset role;

-- Skipping cards ------------------------------------------------------------
select pg_temp.as_user(:A);
insert into public.rounds (couple_id, lv, idx, day, drawn_by) values (public.my_couple(), 'deep', 1, '2026-12-01', auth.uid()) returning id as s1 \gset
select (public.skip_round(:'s1', 'deep', 2::smallint)).id as s2 \gset
select pg_temp.check((select skipped_at is not null and day is null from public.rounds where id = :'s1'), 'a skipped card is marked and gives up its day');
select pg_temp.check((select day = '2026-12-01' and lv = 'deep' and idx = 2 from public.rounds where id = :'s2'), 'the new card takes the skipped card''s day');
select set_config('my.s2', :'s2', false);
select (public.skip_round(:'s2', 'know', 0::smallint)).id as s3 \gset
select (public.skip_round(:'s3', 'play', 0::smallint)).id as s4 \gset
select set_config('my.s4', :'s4', false);
do $$ begin
  perform public.skip_round(current_setting('my.s4')::uuid, 'world', 0::smallint);
  raise exception 'FAILED: a fourth skip';
exception when others then
  if sqlerrm like 'FAILED%' then raise; end if;
  if sqlerrm <> 'No skips left today' then raise exception 'FAILED: unexpected error %', sqlerrm; end if;
  raise notice 'ok: three skips a day, no more';
end $$;
select pg_temp.check((select count(*) = 3 from public.rounds where skipped_at is not null), 'the fourth skip changed nothing');
reset role;
-- The answered card r1, a question B wrote, and a stranger: none can be skipped.
update public.rounds set skipped_at = null, skipped_by = null where skipped_at is not null; -- give the couple its skips back
select set_config('my.r1', :'r1', false);
select pg_temp.as_user(:A);
do $$ begin
  perform public.skip_round(current_setting('my.r1')::uuid, 'know', 0::smallint);
  raise exception 'FAILED: skipped an answered card';
exception when others then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: no skipping once someone has answered (%)', sqlerrm;
end $$;
reset role;
select pg_temp.as_user(:B);
reset role;
insert into public.rounds (couple_id, lv, idx, question, drawn_by, written_by)
  select couple_id, 'own', 1, 'Only for you', user_id, user_id from public.members where user_id = :B returning id as q1 \gset
select pg_temp.as_user(:B);
reset role;
select set_config('my.q1', :'q1', false);
select pg_temp.as_user(:A);
do $$ begin
  perform public.skip_round(current_setting('my.q1')::uuid, 'know', 0::smallint);
  raise exception 'FAILED: skipped the partner''s question';
exception when others then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: you cannot skip a question your partner wrote';
end $$;
reset role;
select pg_temp.as_user(:B);
select pg_temp.check((public.skip_round(:'q1', 'know', 0::smallint)).id is not null, 'whoever wrote a question can withdraw it');
reset role;
select pg_temp.as_user(:X);
do $$ begin
  perform public.skip_round(current_setting('my.s2')::uuid, 'know', 0::smallint);
  raise exception 'FAILED: a stranger skipped';
exception when others then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: strangers cannot skip your cards';
end $$;
reset role;

-- Writing marks and bringing a skipped card back ------------------------------
update public.rounds set skipped_at = skipped_at - interval '2 days' where skipped_at is not null; -- today's skips back
select pg_temp.as_user(:A);
insert into public.rounds (couple_id, lv, idx, day, drawn_by) values (public.my_couple(), 'know', 7, '2026-12-05', auth.uid()) returning id as w1 \gset
reset role;
select set_config('my.w1', :'w1', false);
select pg_temp.as_user(:B);
select public.mark_writing(:'w1', true);
reset role;
select pg_temp.as_user(:A);
select pg_temp.check((select count(*) = 1 from public.writing where round_id = :'w1'), 'you can see that your partner is writing');
do $$ begin
  perform public.skip_round(current_setting('my.w1')::uuid, 'know', 8::smallint);
  raise exception 'FAILED: skipped while the partner was writing';
exception when others then
  if sqlerrm like 'FAILED%' then raise; end if;
  if sqlerrm <> 'Your partner has started an answer to this card' then raise exception 'FAILED: unexpected error %', sqlerrm; end if;
  raise notice 'ok: no skipping while your partner is writing an answer';
end $$;
reset role;
select pg_temp.as_user(:X);
select pg_temp.check((select count(*) = 0 from public.writing), 'strangers cannot see who is writing');
do $$ begin
  perform public.mark_writing(current_setting('my.w1')::uuid, true);
  raise exception 'FAILED: a stranger marked writing';
exception when others then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: strangers cannot mark your cards';
end $$;
reset role;
select pg_temp.as_user(:B);
select public.mark_writing(:'w1', false);
select pg_temp.check((select count(*) = 0 from public.writing where round_id = :'w1'), 'clearing your draft clears the mark');
select public.mark_writing(:'w1', true);
reset role;
update public.writing set at = now() - interval '7 hours'; -- an old, abandoned mark
select pg_temp.as_user(:A);
select (public.skip_round(:'w1', 'know', 8::smallint)).id as w2 \gset
select pg_temp.check((select replaced_by = :'w2' from public.rounds where id = :'w1'), 'an old mark does not hold off a skip, and the skip remembers its replacement');
select pg_temp.check((select count(*) = 0 from public.writing where round_id = :'w1'), 'a skip clears the marks on the skipped card');
do $$ begin
  perform public.restore_round(current_setting('my.w1')::uuid);
  raise exception 'FAILED: restored your own skip';
exception when others then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: you cannot bring back a card you skipped yourself';
end $$;
reset role;
select pg_temp.as_user(:B);
do $$ begin
  insert into public.answers (round_id, user_id, body) values (current_setting('my.w1')::uuid, auth.uid(), 'too late');
  raise exception 'FAILED: answered a skipped card';
exception when insufficient_privilege then raise notice 'ok: no answers on a skipped card';
end $$;
reset role;
select pg_temp.as_user(:X);
do $$ begin
  perform public.restore_round(current_setting('my.w1')::uuid);
  raise exception 'FAILED: a stranger restored';
exception when others then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: strangers cannot bring back your cards';
end $$;
reset role;
select count(*) as skips_before from public.rounds where skipped_at > now() - interval '1 hour' \gset
select pg_temp.as_user(:B);
select pg_temp.check((public.restore_round(:'w1')).day = '2026-12-05', 'your partner''s skip can be undone, and the card gets its day back');
reset role;
select pg_temp.check((select skipped_at is null and replaced_by is null and restored_by = :B from public.rounds where id = :'w1'), 'the restored card is back in play');
select pg_temp.check((select skipped_at is not null and day is null from public.rounds where id = :'w2'), 'the replacement is set aside');
select pg_temp.check((select count(*) = :skips_before from public.rounds where skipped_at > now() - interval '1 hour'), 'bringing a card back leaves the skip count alone');
select pg_temp.as_user(:B);
do $$ begin
  perform public.restore_round(current_setting('my.w1')::uuid);
  raise exception 'FAILED: restored twice';
exception when others then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: a card in play cannot be restored';
end $$;
reset role;
-- Once the replacement has an answer, the skipped card stays skipped.
select pg_temp.as_user(:A);
select (public.skip_round(:'w1', 'know', 9::smallint)).id as w3 \gset
insert into public.answers (round_id, user_id, body) values (:'w3', auth.uid(), 'mine');
reset role;
select pg_temp.as_user(:B);
do $$ begin
  perform public.restore_round(current_setting('my.w1')::uuid);
  raise exception 'FAILED: restored over an answered card';
exception when others then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: no bringing a card back once its replacement has an answer';
end $$;
reset role;
delete from public.rounds where id in (:'w1', :'w2', :'w3');

-- Question pool -----------------------------------------------------------------
select setseed(0.42);
select pg_temp.as_user(:A);
insert into public.pool_questions (couple_id, author_id, question)
  select public.my_couple(), auth.uid(), 'A asks ' || g from generate_series(1, 5) g;
do $$ begin
  insert into public.pool_questions (couple_id, author_id, question) values (public.my_couple(), auth.uid(), 'A asks 6');
  raise exception 'FAILED: a sixth waiting question';
exception when others then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: five waiting questions each (%)', sqlerrm;
end $$;
do $$ begin
  insert into public.rounds (couple_id, lv, idx, question, drawn_by) values (public.my_couple(), 'own', 0, 'Straight in', auth.uid());
  raise exception 'FAILED: own question inserted as a card directly';
exception when insufficient_privilege then raise notice 'ok: your own questions only arrive through the pool';
end $$;
reset role;
select pg_temp.as_user(:B);
insert into public.pool_questions (couple_id, author_id, question) values (public.my_couple(), auth.uid(), 'B asks 1'), (public.my_couple(), auth.uid(), 'B asks 2');
select pg_temp.check((select count(*) = 2 from public.pool_questions), 'you only see your own waiting questions');
select pg_temp.check((select waiting = 5 from public.pool_counts() where author_id = :A), 'you see how many your partner has waiting');
update public.pool_questions set question = 'hijack' where author_id = :A;
reset role;
select pg_temp.check((select count(*) = 0 from public.pool_questions where question = 'hijack'), 'you cannot edit your partner''s questions');

-- Deal 60 cards as B and look at the sequence.
select pg_temp.as_user(:B);
select set_config('my.couple', public.my_couple()::text, false);
-- One deal per statement (and so per transaction), as in the app.
select set_config('my.t0', clock_timestamp()::text, false);
select format('select public.deal_card(%L, %L, %s::smallint)', current_setting('my.couple'), 'know', i % 40) from generate_series(1, 60) i \gexec
reset role;
create temp table dealt as
  select r.* from public.rounds r where r.couple_id = current_setting('my.couple')::uuid and r.created_at >= current_setting('my.t0')::timestamptz;
select pg_temp.check((select count(*) from dealt) = 60, 'sixty cards dealt');
select pg_temp.check((select count(*) from dealt where written_by is not null) between 5 and 7, 'pool questions are mixed in with deck cards');
select pg_temp.check((select count(*) from public.pool_questions where dealt_at is not null) = (select count(*) from dealt where written_by is not null), 'each pool card used up a waiting question');
select pg_temp.check(not exists (
  select 1 from (select written_by, lag(written_by) over (order by created_at) prev from dealt) t
   where t.written_by is not null and t.prev is not null), 'never two pool questions in a row');
select pg_temp.check((select count(*) filter (where written_by = :B) = 2 and count(*) filter (where written_by = :A) = 2
  from (select written_by from dealt where written_by is not null order by created_at limit 4) f), 'turn-taking: the first four pool cards are two each');
select pg_temp.check((select count(*) = 0 from public.pool_questions where dealt_at is not null and dealt_round is null), 'each dealt question points to its card');

-- A stranger can't deal into your couple, and B can't skip a question A wrote.
select pg_temp.as_user(:X);
do $$ begin
  perform public.deal_card(current_setting('my.couple')::uuid, 'know', 0::smallint);
  raise exception 'FAILED: a stranger dealt your card';
exception when others then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: strangers cannot deal your cards';
end $$;
reset role;
select set_config('my.apool', (select id::text from public.rounds where written_by = :A and cardinality(answered_by) = 0 and skipped_at is null order by created_at desc limit 1), false);
select pg_temp.as_user(:B);
do $$ begin
  perform public.skip_round(current_setting('my.apool')::uuid, 'know', 0::smallint);
  raise exception 'FAILED: skipped a pool question the partner wrote';
exception when others then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: you cannot skip a pool question your partner wrote';
end $$;
reset role;
-- The daily job deals as the server.
set role service_role;
select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'service_role', false);
select pg_temp.check((public.deal_card(current_setting('my.couple')::uuid, 'deep', 3::smallint, '2027-01-01')).day = '2027-01-01', 'the daily job can deal');
reset role;
select set_config('request.jwt.claim.role', '', false);

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
