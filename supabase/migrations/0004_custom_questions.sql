-- Questions from each other. Either of you can write a question; it waits face down in your deck, readable only
-- by whoever wrote it, until it is dealt. Dealt questions become ordinary rounds (both answer, sealed until both
-- have), carrying their text and who asked. Dealing now happens in the database, because the partner's app can't
-- read waiting questions and so can't pick one itself.

-- How often waiting questions take the daily slot: every other day, whenever one is waiting, or never (ask now only).
alter table public.couples add column ask_rhythm text not null default 'alternate'
  check (ask_rhythm in ('alternate', 'whenever', 'asked'));
grant update (ask_rhythm) on public.couples to authenticated;

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 280),
  lv text not null default 'know' check (lv in ('know', 'play', 'world', 'deep')),
  created_at timestamptz not null default now()
);
create index questions_couple_idx on public.questions (couple_id, created_at);

-- A custom round has its own text and no deck index; a deck round is the other way round.
alter table public.rounds alter column idx drop not null;
alter table public.rounds add column body text check (char_length(btrim(body)) between 1 and 280);
alter table public.rounds add column asked_by uuid references auth.users (id) on delete set null;
alter table public.rounds add constraint rounds_deck_or_custom check ((body is null) = (idx is not null));

-- The app deals through the functions below now. A direct insert can still only make a deck card as yourself,
-- never one with text or "asked by" your partner.
revoke insert on public.rounds from authenticated;
grant insert (couple_id, lv, idx, day, drawn_by) on public.rounds to authenticated;

-- ---------------------------------------------------------------- waiting questions: private to their author

alter table public.questions enable row level security;
create policy "my waiting questions" on public.questions for select to authenticated using (author_id = auth.uid());
create policy "write a question" on public.questions for insert to authenticated
  with check (author_id = auth.uid() and couple_id = public.my_couple());
create policy "edit my question" on public.questions for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid() and couple_id = public.my_couple());
create policy "withdraw my question" on public.questions for delete to authenticated using (author_id = auth.uid());
revoke all on public.questions from anon;
grant select, insert, update (body, lv), delete on public.questions to authenticated;

-- Five waiting per person, so the deck stays mostly the deck.
create function public.questions_cap() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.author_id::text));
  if (select count(*) from public.questions where author_id = new.author_id) >= 5 then
    raise exception 'You already have five questions waiting';
  end if;
  return new;
end $$;
create trigger questions_cap before insert on public.questions for each row execute function public.questions_cap();
revoke execute on function public.questions_cap() from public, anon, authenticated;

-- What your partner may know about your waiting questions: how many, never what.
create function public.pending_questions() returns table (author_id uuid, waiting int)
  language sql stable security definer set search_path = ''
  as $$ select q.author_id, count(*)::int from public.questions q where q.couple_id = public.my_couple() group by q.author_id $$;

-- ---------------------------------------------------------------- dealing

-- Deal one card for a couple. With a day it's the daily card: a waiting question if the rhythm allows, else the
-- deck card passed in. Without a day it's a bonus draw, from the deck, unless the daily card is off: then draws
-- are the only way questions come up, so they take the daily card's place. Returns null if that day's card
-- already exists (the other of you, or the hourly job, got there first).
create function public.deal(p_couple uuid, p_by uuid, p_day date, p_lv text, p_idx int) returns public.rounds
  language plpgsql security definer set search_path = ''
  as $$
declare
  c public.couples; q public.questions; r public.rounds;
  last_asker uuid; last_day date; today date;
begin
  select * into c from public.couples where id = p_couple for update;
  if c.id is null then raise exception 'No such couple'; end if;
  if p_day is not null and exists (select 1 from public.rounds where couple_id = p_couple and day = p_day) then return null; end if;

  today := coalesce(p_day, (now() at time zone c.time_zone)::date);
  if (p_day is not null or not c.daily_enabled) and c.ask_rhythm <> 'asked' then
    select asked_by, coalesce(day, (created_at at time zone c.time_zone)::date) into last_asker, last_day
      from public.rounds where couple_id = p_couple and body is not null order by created_at desc limit 1;
    if c.ask_rhythm = 'whenever' or last_day is null or last_day <= today - 2 then
      -- Take turns: the oldest question from whoever didn't ask last, else the oldest of all.
      select * into q from public.questions where couple_id = p_couple
        order by (author_id is not distinct from last_asker), created_at limit 1 for update skip locked;
    end if;
  end if;

  if q.id is not null then
    insert into public.rounds (couple_id, lv, body, asked_by, day, drawn_by)
      values (p_couple, q.lv, btrim(q.body), q.author_id, p_day, p_by) returning * into r;
    delete from public.questions where id = q.id;
  else
    if p_lv is null or p_idx is null then raise exception 'A deck card is needed'; end if;
    insert into public.rounds (couple_id, lv, idx, day, drawn_by) values (p_couple, p_lv, p_idx, p_day, p_by) returning * into r;
  end if;
  return r;
end $$;
revoke execute on function public.deal(uuid, uuid, date, text, int) from public, anon, authenticated;
grant execute on function public.deal(uuid, uuid, date, text, int) to service_role;

-- The app's way in: deal for your own couple, as yourself. The app picks the deck card so the deck stays in one place.
create function public.deal_round(p_day date, p_lv text, p_idx int) returns public.rounds
  language plpgsql security definer set search_path = ''
  as $$
declare cid uuid := public.my_couple();
begin
  if cid is null then raise exception 'You are not paired'; end if;
  return public.deal(cid, auth.uid(), p_day, p_lv, p_idx);
end $$;

-- Ask now: your question becomes the current card straight away, as a bonus round.
create function public.ask_now(p_body text, p_lv text) returns public.rounds
  language plpgsql security definer set search_path = ''
  as $$
declare cid uuid := public.my_couple(); r public.rounds;
begin
  if cid is null then raise exception 'You are not paired'; end if;
  if (select count(*) from public.members where couple_id = cid) < 2 then raise exception 'Your partner has not joined yet'; end if;
  if p_lv is null or p_lv not in ('know', 'play', 'world', 'deep') then raise exception 'Pick a tone'; end if;
  insert into public.rounds (couple_id, lv, body, asked_by, drawn_by)
    values (cid, p_lv, btrim(p_body), auth.uid(), auth.uid()) returning * into r;
  return r;
end $$;

revoke execute on function public.pending_questions(), public.deal_round(date, text, int), public.ask_now(text, text) from public, anon;
grant execute on function public.pending_questions(), public.deal_round(date, text, int), public.ask_now(text, text) to authenticated;

-- Your own other devices see your waiting questions change live. Row-level security keeps them from your partner.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.questions;
  end if;
end $$;
