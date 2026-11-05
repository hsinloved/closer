-- Don't skip a card out from under someone who is writing an answer to it, and if it happens anyway, let them bring it back.
--
-- * While you have an unsealed answer started on a card, the app keeps a "writing" mark for you on it (mark_writing).
--   Your partner can't skip that card while the mark is fresh (six hours), and their app says why.
-- * A skip now remembers which card replaced the skipped one, so whoever was writing can restore the skipped card
--   (restore_round) as long as the replacement is still the newest card and nobody has answered it.
-- * An answer can no longer be saved to a skipped card, so it can't disappear onto a card the app hides.

create table public.writing (
  round_id uuid not null references public.rounds (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  primary key (round_id, user_id)
);

alter table public.writing enable row level security;
create policy "see who is writing on our cards" on public.writing for select to authenticated
  using (exists (select 1 from public.rounds r where r.id = round_id and r.couple_id = public.my_couple()));
revoke all on public.writing from anon;
grant select on public.writing to authenticated;

-- How long a "writing" mark holds off a skip after the last keystroke.
create function public.writing_window() returns interval language sql immutable as $$ select interval '6 hours' $$;

-- Set (p_on true) or clear (p_on false) your own writing mark on a card of yours.
create function public.mark_writing(p_round uuid, p_on boolean) returns void
  language plpgsql security definer set search_path = ''
  as $$
declare r public.rounds;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into r from public.rounds where id = p_round;
  if r.id is null or r.couple_id is distinct from public.my_couple() then raise exception 'No such card'; end if;
  if not p_on or r.skipped_at is not null or auth.uid() = any (r.answered_by) then
    delete from public.writing where round_id = p_round and user_id = auth.uid();
  else
    insert into public.writing (round_id, user_id, at) values (p_round, auth.uid(), now())
      on conflict (round_id, user_id) do update set at = excluded.at;
  end if;
end $$;
revoke execute on function public.mark_writing(uuid, boolean) from public, anon;
grant execute on function public.mark_writing(uuid, boolean) to authenticated;

-- Which card took a skipped card's place, and who brought a skipped card back.
alter table public.rounds add column replaced_by uuid references public.rounds (id) on delete set null;
alter table public.rounds add column restored_at timestamptz;
alter table public.rounds add column restored_by uuid references auth.users (id) on delete set null;

-- Skipping, as before, but not while your partner is writing an answer, and remembering the replacement.
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

-- Bring back a card your partner skipped. Only while the card that replaced it is still the newest one and
-- unanswered; the replacement is set aside in its place, so the day's skip count stays as it was.
create function public.restore_round(p_round uuid) returns public.rounds
  language plpgsql security definer set search_path = ''
  as $$
declare
  r public.rounds;
  fresh public.rounds;
  back public.rounds;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  perform 1 from public.couples where id = public.my_couple() for update; -- one change at a time per couple
  select * into r from public.rounds where id = p_round for update;
  if r.id is null or r.couple_id is distinct from public.my_couple() then raise exception 'No such card'; end if;
  if r.skipped_at is null then raise exception 'That card wasn''t skipped'; end if;
  if r.skipped_by = auth.uid() then raise exception 'You skipped that card yourself'; end if;
  if r.lv = 'own' and coalesce(r.written_by, r.drawn_by) = r.skipped_by then raise exception 'Your partner took that question back'; end if;
  select * into fresh from public.rounds where id = r.replaced_by for update;
  if fresh.id is null or fresh.skipped_at is not null then raise exception 'That card can''t be brought back any more'; end if;
  if cardinality(fresh.answered_by) > 0 then raise exception 'Someone has already answered the card that replaced it'; end if;
  if exists (select 1 from public.rounds n where n.couple_id = r.couple_id and n.skipped_at is null and n.created_at > fresh.created_at) then
    raise exception 'There''s a newer card now';
  end if;

  -- Hand the day back: the replacement gives it up first (one card per day).
  update public.rounds set skipped_at = now(), skipped_by = auth.uid(), day = null where id = fresh.id;
  update public.rounds set skipped_at = null, skipped_by = null, replaced_by = null, day = fresh.day,
         restored_at = now(), restored_by = auth.uid()
   where id = r.id returning * into back;
  return back;
end $$;
revoke execute on function public.restore_round(uuid) from public, anon;
grant execute on function public.restore_round(uuid) to authenticated;

-- No answers on a skipped card.
drop policy "write my answer" on public.answers;
create policy "write my answer" on public.answers for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.rounds r where r.id = round_id and r.couple_id = public.my_couple() and r.skipped_at is null)
  );

-- Live updates when your partner starts or stops writing.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.writing;
  end if;
end $$;
