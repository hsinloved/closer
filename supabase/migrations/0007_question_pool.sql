-- Your own questions go into a pool and are shuffled in among the deck's cards, instead of becoming the next card.
--
-- * Each of you can have up to five questions waiting. Only the author can read theirs; the other sees a count.
-- * Every card is dealt by deal_card(): about one card in three comes from the pool while it has questions,
--   never two pool questions in a row, and the pick favours whoever has had fewer of theirs dealt so far.
-- * A dealt question becomes an ordinary round (lv 'own'), marked with who wrote it.

create table public.pool_questions (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  question text not null check (char_length(question) between 1 and 300),
  created_at timestamptz not null default now(),
  dealt_round uuid references public.rounds (id) on delete set null,
  dealt_at timestamptz
);
create index pool_questions_couple_idx on public.pool_questions (couple_id) where dealt_at is null;

-- Who wrote a dealt question (drawn_by stays "who dealt it").
alter table public.rounds add column written_by uuid references auth.users (id) on delete set null;

-- Five waiting questions each, at most.
create function public.pool_cap() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
begin
  if (select count(*) from public.pool_questions where author_id = new.author_id and dealt_at is null) >= 5 then
    raise exception 'You already have five questions waiting';
  end if;
  return new;
end $$;
create trigger pool_questions_cap before insert on public.pool_questions
  for each row execute function public.pool_cap();
revoke execute on function public.pool_cap() from public, anon, authenticated;

alter table public.pool_questions enable row level security;
create policy "read my waiting questions" on public.pool_questions for select to authenticated
  using (author_id = auth.uid());
create policy "add to our pool" on public.pool_questions for insert to authenticated
  with check (author_id = auth.uid() and couple_id = public.my_couple() and dealt_at is null and dealt_round is null);
create policy "edit a waiting question" on public.pool_questions for update to authenticated
  using (author_id = auth.uid() and dealt_at is null) with check (author_id = auth.uid());
create policy "take back a waiting question" on public.pool_questions for delete to authenticated
  using (author_id = auth.uid() and dealt_at is null);

revoke all on public.pool_questions from anon;
grant select, insert, update (question), delete on public.pool_questions to authenticated;

-- How many questions each of you has waiting, without revealing them.
create function public.pool_counts() returns table (author_id uuid, waiting int)
  language sql stable security definer set search_path = ''
  as $$
    select author_id, count(*)::int from public.pool_questions
     where couple_id = public.my_couple() and dealt_at is null group by author_id
  $$;
revoke execute on function public.pool_counts() from public, anon;
grant execute on function public.pool_counts() to authenticated;

-- Deal the next card. The app (or the daily job) suggests a deck card; the pool may take its place.
-- Called by a signed-in partner for their own couple, or by the server's daily job (service role).
create function public.deal_card(p_couple uuid, p_lv text, p_idx smallint, p_day date default null) returns public.rounds
  language plpgsql security definer set search_path = ''
  as $$
declare
  last public.rounds;
  q public.pool_questions;
  fresh public.rounds;
  me uuid := auth.uid();
begin
  if me is not null and p_couple is distinct from public.my_couple() then raise exception 'Not your cards'; end if;
  if me is null and coalesce(auth.role(), '') <> 'service_role' then raise exception 'Sign in first'; end if;
  if p_lv not in ('know', 'play', 'world', 'deep', 'wild') or p_idx < 0 then raise exception 'Not a card from the deck'; end if;
  perform 1 from public.couples where id = p_couple for update; -- one deal at a time per couple

  select * into last from public.rounds where couple_id = p_couple and skipped_at is null order by created_at desc limit 1;

  if (last.id is null or last.written_by is null) and random() < 1.0 / 3 then
    -- Turn-taking: the author with fewer dealt questions goes first; a coin decides a tie.
    select p.* into q from public.pool_questions p
     where p.couple_id = p_couple and p.dealt_at is null
     order by (select count(*) from public.pool_questions d where d.couple_id = p_couple and d.author_id = p.author_id and d.dealt_at is not null),
              random()
     limit 1 for update;
  end if;

  if q.id is not null then
    insert into public.rounds (couple_id, lv, idx, question, written_by, day, drawn_by)
      values (p_couple, 'own', (select count(*) from public.rounds where couple_id = p_couple and lv = 'own') % 30000, q.question, q.author_id, p_day, me)
      returning * into fresh;
    update public.pool_questions set dealt_at = now(), dealt_round = fresh.id where id = q.id;
  else
    insert into public.rounds (couple_id, lv, idx, day, drawn_by)
      values (p_couple, p_lv, p_idx, p_day, me) returning * into fresh;
  end if;
  return fresh;
end $$;
revoke execute on function public.deal_card(uuid, text, smallint, date) from public, anon;
grant execute on function public.deal_card(uuid, text, smallint, date) to authenticated, service_role;

-- Your own questions now only arrive through the pool, so the app can no longer insert one as a card directly.
drop policy "draw a card" on public.rounds;
create policy "draw a card" on public.rounds for insert to authenticated
  with check (couple_id = public.my_couple() and drawn_by = auth.uid() and answered_by = '{}' and lv <> 'own');

-- Skipping: a question your partner wrote still can't be skipped by you, whether written directly or from the pool.
create or replace function public.skip_round(p_round uuid, p_lv text, p_idx smallint) returns public.rounds
  language plpgsql security definer set search_path = ''
  as $$
declare
  r public.rounds;
  c public.couples;
  fresh public.rounds;
  used int;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into r from public.rounds where id = p_round for update;
  if r.id is null or r.couple_id is distinct from public.my_couple() then raise exception 'No such card'; end if;
  if r.skipped_at is not null then raise exception 'That card was already skipped'; end if;
  if cardinality(r.answered_by) > 0 then raise exception 'Someone has already answered this card'; end if;
  if r.lv = 'own' and coalesce(r.written_by, r.drawn_by) is distinct from auth.uid() then raise exception 'You can''t skip a question your partner wrote'; end if;
  if p_lv not in ('know', 'play', 'world', 'deep', 'wild') or p_idx < 0 then raise exception 'Not a card from the deck'; end if;

  select * into c from public.couples where id = r.couple_id for update;
  select count(*) into used from public.rounds
   where couple_id = c.id and skipped_at is not null
     and (skipped_at at time zone c.time_zone)::date = (now() at time zone c.time_zone)::date;
  if used >= 3 then raise exception 'No skips left today'; end if;

  update public.rounds set skipped_at = now(), skipped_by = auth.uid(), day = null where id = r.id;
  insert into public.rounds (couple_id, lv, idx, day, drawn_by)
    values (r.couple_id, p_lv, p_idx, r.day, auth.uid()) returning * into fresh;
  return fresh;
end $$;
