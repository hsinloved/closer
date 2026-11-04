-- Comments: once a card is revealed, each of you can leave one comment on the other's answer.
-- There are no replies: a comment is a note on an answer, not the start of a thread.
create table public.comments (
  round_id uuid not null references public.rounds (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (round_id, author_id)
);

create trigger comments_touch before update on public.comments
  for each row execute function public.touch_updated_at();

alter table public.comments enable row level security;

-- Only on revealed cards, so a comment can never hint at an answer the other hasn't earned yet.
create policy "read our comments" on public.comments for select to authenticated
  using (
    exists (select 1 from public.rounds r where r.id = round_id and r.couple_id = public.my_couple())
    and public.is_revealed(round_id)
  );
create policy "comment on a revealed card" on public.comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.rounds r where r.id = round_id and r.couple_id = public.my_couple())
    and public.is_revealed(round_id)
  );
create policy "edit my comment" on public.comments for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "delete my comment" on public.comments for delete to authenticated
  using (author_id = auth.uid());

revoke all on public.comments from anon;
grant select, insert, update (body), delete on public.comments to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.comments;
  end if;
end $$;
