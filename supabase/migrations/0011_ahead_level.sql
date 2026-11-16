-- A new level, Ahead: questions to talk through before the next step (a home, a country, a marriage).
-- The deck lives in the app; the database only needs to accept the new level name.
alter table public.rounds drop constraint rounds_lv_check;
alter table public.rounds add constraint rounds_lv_check check (lv in ('know', 'play', 'world', 'deep', 'ahead', 'wild', 'own'));

-- deal_card as in 0010 and skip_round as in 0008, each now accepting 'ahead' as a deck level.
create or replace function public.deal_card(p_couple uuid, p_lv text, p_idx smallint, p_day date default null) returns public.rounds
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
  if p_lv not in ('know', 'play', 'world', 'deep', 'ahead', 'wild') or p_idx < 0 then raise exception 'Not a card from the deck'; end if;
  perform 1 from public.couples where id = p_couple for update; -- one deal at a time per couple

  select * into last from public.rounds
   where couple_id = p_couple and skipped_at is null and returned_at is null order by created_at desc limit 1;

  -- The card being covered up: a question from your pool that nobody has answered or started goes back to the pool.
  if last.id is not null and last.lv = 'own' and last.written_by is not null and cardinality(last.answered_by) = 0
     and not exists (select 1 from public.writing w where w.round_id = last.id and w.at > now() - public.writing_window())
     and exists (select 1 from public.pool_questions p where p.dealt_round = last.id) then
    update public.pool_questions set dealt_at = null, dealt_round = null where dealt_round = last.id;
    update public.rounds set returned_at = now() where id = last.id;
    delete from public.writing where round_id = last.id;
    select * into last from public.rounds
     where couple_id = p_couple and skipped_at is null and returned_at is null order by created_at desc limit 1;
  end if;

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
  if p_lv not in ('know', 'play', 'world', 'deep', 'ahead', 'wild') or p_idx < 0 then raise exception 'Not a card from the deck'; end if;
  if exists (select 1 from public.writing w where w.round_id = r.id and w.user_id <> auth.uid() and w.at > now() - public.writing_window()) then
    raise exception 'Your partner has started an answer to this card';
  end if;

  select * into c from public.couples where id = r.couple_id for update;
  select count(*) into used from public.rounds
   where couple_id = c.id and skipped_at is not null
     and (skipped_at at time zone c.time_zone)::date = (now() at time zone c.time_zone)::date;
  if used >= 3 then raise exception 'No skips left today'; end if;

  update public.rounds set skipped_at = now(), skipped_by = auth.uid(), day = null where id = r.id;
  insert into public.rounds (couple_id, lv, idx, day, drawn_by)
    values (r.couple_id, p_lv, p_idx, r.day, auth.uid()) returning * into fresh;
  update public.rounds set replaced_by = fresh.id where id = r.id;
  delete from public.writing where round_id = r.id;
  return fresh;
end $$;
