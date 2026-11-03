-- Reset pairing, from Settings. Removes the whole couple for both of you, with its cards and answers, so that
-- nobody who pairs afterwards can read what was written before. Either of you can do it; both go back to pairing.
create function public.reset_couple() returns void
  language plpgsql security definer set search_path = ''
  as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select couple_id into cid from public.members where user_id = auth.uid();
  if cid is null then raise exception 'You are not paired'; end if;
  delete from public.couples where id = cid;
end $$;

revoke execute on function public.reset_couple() from public, anon;
grant execute on function public.reset_couple() to authenticated;
