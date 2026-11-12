-- Friends that feel like friends: cheers (small reactions to a friend's country), a recent-activity feed and per-friend summaries.
-- Cheers only exist between accepted, unblocked friends and are visible only to the two people involved.
create table if not exists public.reactions (
  sender uuid not null references auth.users (id) on delete cascade,
  recipient uuid not null references auth.users (id) on delete cascade,
  iso text not null check (iso ~ '^[A-Z]{2}$'),
  kind text not null check (kind in ('wow', 'takeme', 'beenthere')),
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  primary key (sender, recipient, iso),
  check (sender <> recipient)
);
create index if not exists reactions_recipient on public.reactions (recipient, created_at desc);
alter table public.reactions enable row level security;
grant select, insert, update, delete on public.reactions to authenticated;

drop policy if exists reactions_select on public.reactions;
create policy reactions_select on public.reactions for select to authenticated using (auth.uid() in (sender, recipient));
drop policy if exists reactions_insert on public.reactions;
create policy reactions_insert on public.reactions for insert to authenticated
  with check (sender = auth.uid() and public.are_friends(sender, recipient));
drop policy if exists reactions_update on public.reactions;
create policy reactions_update on public.reactions for update to authenticated
  using (sender = auth.uid()) with check (sender = auth.uid() and public.are_friends(sender, recipient));
drop policy if exists reactions_delete on public.reactions;
create policy reactions_delete on public.reactions for delete to authenticated using (sender = auth.uid());

-- at most 200 cheers a day per person, so it cannot be used to spam
create or replace function public.limit_reactions() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.reactions where sender = new.sender and created_at > now() - interval '1 day') >= 200 then
    raise exception 'too many cheers today';
  end if;
  return new;
end $$;
drop trigger if exists limit_reactions on public.reactions;
create trigger limit_reactions before insert on public.reactions for each row execute function public.limit_reactions();

-- the recipient marks what they have looked at (they cannot edit anything else)
create or replace function public.mark_cheers_seen() returns void
language sql security definer set search_path = public as $$
  update public.reactions set seen_at = now() where recipient = auth.uid() and seen_at is null;
$$;

-- every accepted friend whose map you may see, with how far they have travelled
create or replace function public.friend_summaries() returns table (friend uuid, countries int, cities int)
language sql stable security definer set search_path = public as $$
  select p.id, count(distinct t.iso)::int, count(*) filter (where t.place is not null)::int
  from public.profiles p
  join public.trips t on t.user_id = p.id
  where auth.uid() is not null and public.are_friends(auth.uid(), p.id)
    and p.visibility in ('friends', 'public')
    and t.deleted_at is null and not t.hidden_from_friends
    and (t.start_date is null or t.start_date <= current_date)
  group by p.id;
$$;

-- the latest trips of your friends (already travelled, shown to friends)
create or replace function public.friend_feed() returns table (friend uuid, iso text, place jsonb, start_date date)
language sql stable security definer set search_path = public as $$
  select t.user_id, t.iso, t.place, t.start_date
  from public.trips t
  join public.profiles p on p.id = t.user_id
  where auth.uid() is not null and public.are_friends(auth.uid(), t.user_id)
    and p.visibility in ('friends', 'public')
    and t.deleted_at is null and not t.hidden_from_friends
    and t.start_date is not null and t.start_date <= current_date and t.start_date > current_date - 120
  order by t.start_date desc limit 8;
$$;

revoke all on function public.limit_reactions(), public.mark_cheers_seen(), public.friend_summaries(), public.friend_feed() from public, anon;
grant execute on function public.mark_cheers_seen(), public.friend_summaries(), public.friend_feed() to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.reactions;
  end if;
end $$;
