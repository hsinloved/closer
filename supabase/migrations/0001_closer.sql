-- Closer: two people, one shared deck, answers sealed until both have written.
--
-- Run this once in the Supabase SQL editor (or with `supabase db push`).
-- Every table has row-level security: a signed-in person only ever sees their own couple,
-- and their partner's answer to a card only once they have answered it themselves.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- tables

create table public.couples (
  id uuid primary key default gen_random_uuid(),
  -- Six characters the first person reads out to the second; it stops working once two have joined.
  invite_code text not null unique default upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 6)),
  daily_enabled boolean not null default true,
  daily_hour smallint not null default 8 check (daily_hour between 0 and 23),
  time_zone text not null default 'Europe/Berlin',
  created_at timestamptz not null default now()
);

create table public.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  couple_id uuid not null references public.couples (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now()
);
create index members_couple_idx on public.members (couple_id);

-- A round is one card the two of you answer. The daily card has a day; one drawn by hand does not.
create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  lv text not null check (lv in ('know', 'play', 'world', 'deep', 'wild')),
  idx smallint not null check (idx >= 0),
  day date,
  drawn_by uuid references auth.users (id) on delete set null,
  -- Who has answered, kept by a trigger so either of you can see "Michael has answered" without reading it.
  answered_by uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (couple_id, day)
);
create index rounds_couple_created_idx on public.rounds (couple_id, created_at desc);

create table public.answers (
  round_id uuid not null references public.rounds (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (round_id, user_id)
);

create table public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ---------------------------------------------------------------- helpers
-- Security definer so policies can ask these questions without tripping over their own row-level security.

create function public.my_couple() returns uuid
  language sql stable security definer set search_path = ''
  as $$ select couple_id from public.members where user_id = auth.uid() $$;

create function public.has_answered(r uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.answers where round_id = r and user_id = auth.uid()) $$;

create function public.is_revealed(r uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select coalesce((select cardinality(answered_by) >= 2 from public.rounds where id = r), false) $$;

create function public.mark_answered() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
begin
  update public.rounds
     set answered_by = array_append(answered_by, new.user_id)
   where id = new.round_id and not (new.user_id = any (answered_by));
  return new;
end $$;

create trigger answers_mark_answered after insert on public.answers
  for each row execute function public.mark_answered();

create function public.touch_updated_at() returns trigger
  language plpgsql set search_path = ''
  as $$ begin new.updated_at := now(); return new; end $$;

create trigger answers_touch before update on public.answers
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- pairing

-- The first of you creates the couple and gets an invite code to share.
create function public.create_couple(p_name text) returns public.couples
  language plpgsql security definer set search_path = ''
  as $$
declare c public.couples;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then raise exception 'You are already in a couple'; end if;
  insert into public.couples default values returning * into c;
  insert into public.members (user_id, couple_id, name) values (auth.uid(), c.id, trim(p_name));
  return c;
end $$;

-- The second joins with that code. A couple is never more than two.
create function public.join_couple(p_code text, p_name text) returns uuid
  language plpgsql security definer set search_path = ''
  as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then raise exception 'You are already in a couple'; end if;
  select id into cid from public.couples where invite_code = upper(trim(p_code)) for update;
  if cid is null then raise exception 'That code does not match'; end if;
  if (select count(*) from public.members where couple_id = cid) >= 2 then raise exception 'That couple is already complete'; end if;
  insert into public.members (user_id, couple_id, name) values (auth.uid(), cid, trim(p_name));
  return cid;
end $$;

-- ---------------------------------------------------------------- row-level security

alter table public.couples enable row level security;
alter table public.members enable row level security;
alter table public.rounds enable row level security;
alter table public.answers enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "see my couple" on public.couples for select to authenticated using (id = public.my_couple());
create policy "change my couple's settings" on public.couples for update to authenticated
  using (id = public.my_couple()) with check (id = public.my_couple());

create policy "see us" on public.members for select to authenticated using (couple_id = public.my_couple());
create policy "rename myself" on public.members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and couple_id = public.my_couple());

create policy "see our cards" on public.rounds for select to authenticated using (couple_id = public.my_couple());
create policy "draw a card" on public.rounds for insert to authenticated
  with check (couple_id = public.my_couple() and drawn_by = auth.uid() and answered_by = '{}');

-- The heart of the game: your own answer always; your partner's only once you have answered too.
create policy "read sealed answers" on public.answers for select to authenticated
  using (
    exists (select 1 from public.rounds r where r.id = round_id and r.couple_id = public.my_couple())
    and (user_id = auth.uid() or public.has_answered(round_id))
  );
create policy "write my answer" on public.answers for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.rounds r where r.id = round_id and r.couple_id = public.my_couple())
  );
-- Editable until both have answered; after the reveal it stays as written.
create policy "edit before the reveal" on public.answers for update to authenticated
  using (user_id = auth.uid() and not public.is_revealed(round_id))
  with check (user_id = auth.uid());

create policy "my devices" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- grants

revoke all on public.couples, public.members, public.rounds, public.answers, public.push_subscriptions from anon;
grant select, update (daily_enabled, daily_hour, time_zone) on public.couples to authenticated;
grant select, update (name) on public.members to authenticated;
grant select, insert on public.rounds to authenticated;
grant select, insert, update (body) on public.answers to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

revoke execute on function public.my_couple(), public.has_answered(uuid), public.is_revealed(uuid),
  public.create_couple(text), public.join_couple(text, text) from public, anon;
grant execute on function public.my_couple(), public.has_answered(uuid), public.is_revealed(uuid),
  public.create_couple(text), public.join_couple(text, text) to authenticated;

-- Live updates in the app when the other person answers or draws a card.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.rounds, public.answers;
  end if;
end $$;
