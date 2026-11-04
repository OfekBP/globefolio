-- Handle search: clean the query once, and refuse it if too little is left. Before, a query such as '@@' became an empty
-- pattern that matched everyone, and '_' counted as a wildcard.
create or replace function public.find_profiles(q text) returns table (id uuid, handle text, display_name text)
language sql stable security definer set search_path = public as $$
  with s as (select lower(regexp_replace(trim(q), '[^a-zA-Z0-9_]', '', 'g')) as v)
  select p.id, p.handle, p.display_name from public.profiles p, s
  where auth.uid() is not null
    and length(s.v) >= 2
    and p.handle like replace(s.v, '_', '\_') || '%'
    and p.id <> auth.uid()
    and not public.is_blocked(auth.uid(), p.id)
  order by p.handle limit 10;
$$;
