-- Notes: once a card is revealed your answer is locked, but each of you can add one note under your own answer
-- (a P.S.). The answer itself stays as written. Your partner sees the note under your answer.
create table public.notes (
  round_id uuid not null references public.rounds (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (round_id, author_id)
);

create trigger notes_touch before update on public.notes
  for each row execute function public.touch_updated_at();

alter table public.notes enable row level security;

-- Only on revealed cards of your own couple, and only on an answer you actually wrote.
create policy "read our notes" on public.notes for select to authenticated
  using (
    exists (select 1 from public.rounds r where r.id = round_id and r.couple_id = public.my_couple())
    and public.is_revealed(round_id)
  );
create policy "add a note to my answer" on public.notes for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.rounds r where r.id = round_id and r.couple_id = public.my_couple())
    and public.is_revealed(round_id)
    and public.has_answered(round_id)
  );
create policy "edit my note" on public.notes for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "delete my note" on public.notes for delete to authenticated
  using (author_id = auth.uid());

revoke all on public.notes from anon;
grant select, insert, update (body), delete on public.notes to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notes;
  end if;
end $$;
