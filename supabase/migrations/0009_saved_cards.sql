-- Saving cards: each of you can save any card the two of you have had, to find it again under "Saved" in Ours.
-- What you save is yours alone: your partner doesn't see it.

create table public.saved (
  round_id uuid not null references public.rounds (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (round_id, user_id)
);
create index saved_user_idx on public.saved (user_id);

alter table public.saved enable row level security;
create policy "see what I saved" on public.saved for select to authenticated
  using (user_id = auth.uid());
create policy "save one of our cards" on public.saved for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.rounds r where r.id = round_id and r.couple_id = public.my_couple()));
create policy "unsave" on public.saved for delete to authenticated
  using (user_id = auth.uid());

revoke all on public.saved from anon;
grant select, insert, delete on public.saved to authenticated;

-- Live updates, so a save on one of your devices shows on the other.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.saved;
  end if;
end $$;
