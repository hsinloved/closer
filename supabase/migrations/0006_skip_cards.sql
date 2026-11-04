-- Skipping a card: up to three a day between the two of you, and only before either of you has answered.
-- A skipped card stays in the table (so the deck won't deal it again soon) but is hidden in the app,
-- and a fresh card takes its place, keeping its day if it was the daily card.
alter table public.rounds add column skipped_at timestamptz;
alter table public.rounds add column skipped_by uuid references auth.users (id) on delete set null;

-- The app picks the replacement from the deck (the deck lives in the app) and passes its level and index.
create function public.skip_round(p_round uuid, p_lv text, p_idx smallint) returns public.rounds
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
  if r.lv = 'own' and r.drawn_by is distinct from auth.uid() then raise exception 'You can''t skip a question your partner wrote'; end if;
  if p_lv not in ('know', 'play', 'world', 'deep', 'wild') or p_idx < 0 then raise exception 'Not a card from the deck'; end if;

  select * into c from public.couples where id = r.couple_id for update; -- one skip at a time per couple
  select count(*) into used from public.rounds
   where couple_id = c.id and skipped_at is not null
     and (skipped_at at time zone c.time_zone)::date = (now() at time zone c.time_zone)::date;
  if used >= 3 then raise exception 'No skips left today'; end if;

  update public.rounds set skipped_at = now(), skipped_by = auth.uid(), day = null where id = r.id;
  insert into public.rounds (couple_id, lv, idx, day, drawn_by)
    values (r.couple_id, p_lv, p_idx, r.day, auth.uid()) returning * into fresh;
  return fresh;
end $$;

revoke execute on function public.skip_round(uuid, text, smallint) from public, anon;
grant execute on function public.skip_round(uuid, text, smallint) to authenticated;
