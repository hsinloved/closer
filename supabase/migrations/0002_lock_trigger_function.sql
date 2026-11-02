-- mark_answered() only runs as the answers trigger. Postgres functions are executable by PUBLIC by default,
-- which exposed it at /rest/v1/rpc/mark_answered; nobody needs to call it directly.
revoke execute on function public.mark_answered() from public, anon, authenticated;
