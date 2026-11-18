-- Your own questions come up more often: while the pool has questions, half the cards come from it instead of
-- a third (still never two in a row, so about one card in three overall). Otherwise deal_card is as in 0011.
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

  if (last.id is null or last.written_by is null) and random() < 0.5 then
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
