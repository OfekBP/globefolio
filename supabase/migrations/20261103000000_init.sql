-- GlobeFolio backend: accounts, synced trips, friends, shared trips.
-- Private by default. Every table has row level security; the browser only ever holds the public anon key.
-- Run with the Supabase CLI (`supabase db push`) or paste into the SQL editor.

-- ── profiles ─────────────────────────────────────────────────────────────────
create type public.visibility as enum ('private', 'friends', 'public');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text not null unique
    check (handle ~ '^[a-z0-9_]{3,20}$' and handle not in ('admin', 'support', 'tripglobe', 'globefolio', 'help', 'root', 'staff', 'official')),
  display_name text check (char_length(display_name) <= 40),
  home_city_key text check (char_length(home_city_key) <= 120),
  visibility public.visibility not null default 'private',
  created_at timestamptz not null default now()
);

-- ── synced personal data ────────────────────────────────────────────────────
-- updated_at is the device's edit time (used to settle conflicts, newest edit wins);
-- synced_at is set by the server on every write (used as the pull cursor, so wrong phone clocks cannot hide rows).
create table public.trips (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  iso text not null check (char_length(iso) between 2 and 3),
  place jsonb,
  start_date date,
  end_date date,
  notes text check (char_length(notes) <= 5000),
  hidden_from_friends boolean not null default false,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  synced_at timestamptz not null default clock_timestamp()
);
create index trips_user_synced on public.trips (user_id, synced_at);

create table public.wishes (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  iso text not null check (char_length(iso) between 2 and 3),
  place jsonb,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  synced_at timestamptz not null default clock_timestamp()
);
create index wishes_user_synced on public.wishes (user_id, synced_at);

-- Newest edit wins: an older write that arrives late is ignored. Clocks set far in the future are pulled back.
create function public.lww_owned() returns trigger language plpgsql as $$
begin
  new.updated_at := least(new.updated_at, now() + interval '1 day');
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then raise exception 'row owner cannot change'; end if;
    if new.updated_at < old.updated_at then return null; end if;
  end if;
  new.synced_at := clock_timestamp();
  return new;
end $$;
create trigger trips_lww before insert or update on public.trips for each row execute function public.lww_owned();
create trigger wishes_lww before insert or update on public.wishes for each row execute function public.lww_owned();

-- size limits so one account cannot fill the database
create function public.limit_rows() returns trigger language plpgsql as $$
declare n int;
begin
  execute format('select count(*) from public.%I where user_id = $1', tg_table_name) into n using new.user_id;
  if n >= 10000 then raise exception 'too many rows'; end if;
  return new;
end $$;
create trigger trips_limit before insert on public.trips for each row execute function public.limit_rows();
create trigger wishes_limit before insert on public.wishes for each row execute function public.limit_rows();

-- ── friends and blocking ────────────────────────────────────────────────────
create table public.friendships (
  requester uuid not null references auth.users (id) on delete cascade,
  addressee uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);
create unique index friendships_pair on public.friendships (least(requester, addressee), greatest(requester, addressee));

create table public.blocks (
  blocker uuid not null references auth.users (id) on delete cascade,
  blocked uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null references auth.users (id) on delete cascade,
  reported uuid not null references auth.users (id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 500),
  created_at timestamptz not null default now()
);

-- only answers for the signed-in user's own pairs, so it cannot be used to probe who blocked whom
create function public.is_blocked(a uuid, b uuid) returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() in (a, b)
    and exists (select 1 from public.blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a));
$$;

create function public.are_friends(a uuid, b uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted' and ((requester = a and addressee = b) or (requester = b and addressee = a))
  ) and not public.is_blocked(a, b);
$$;

create function public.limit_requests() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_blocked(new.requester, new.addressee) then raise exception 'not possible'; end if;
  if (select count(*) from public.friendships where requester = new.requester and status = 'pending') >= 50 then
    raise exception 'too many pending requests';
  end if;
  return new;
end $$;
create trigger friendships_limit before insert on public.friendships for each row execute function public.limit_requests();

-- blocking someone ends any friendship or request between you
create function public.on_block() returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.friendships
  where (requester = new.blocker and addressee = new.blocked) or (requester = new.blocked and addressee = new.blocker);
  return new;
end $$;
create trigger blocks_cleanup after insert on public.blocks for each row execute function public.on_block();

-- ── shared trips ────────────────────────────────────────────────────────────
create table public.shared_trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.shared_trip_members (
  trip_id uuid not null references public.shared_trips (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  primary key (trip_id, user_id)
);
create index members_user on public.shared_trip_members (user_id);

create table public.shared_trip_stops (
  id uuid primary key,
  trip_id uuid not null references public.shared_trips (id) on delete cascade,
  iso text not null check (char_length(iso) between 2 and 3),
  place jsonb,
  start_date date,
  end_date date,
  notes text check (char_length(notes) <= 2000),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  synced_at timestamptz not null default clock_timestamp()
);
create index stops_trip on public.shared_trip_stops (trip_id, synced_at);

create table public.invites (
  token text primary key default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  trip_id uuid not null references public.shared_trips (id) on delete cascade,
  role text not null check (role in ('editor', 'viewer')),
  created_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days'
);

create function public.is_member(trip uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shared_trip_members where trip_id = trip and user_id = auth.uid());
$$;
create function public.can_edit(trip uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shared_trip_members where trip_id = trip and user_id = auth.uid() and role in ('owner', 'editor'));
$$;
create function public.is_owner(trip uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shared_trips where id = trip and owner_id = auth.uid());
$$;

create function public.on_shared_trip() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.shared_trips where owner_id = new.owner_id) > 50 then raise exception 'too many shared trips'; end if;
  insert into public.shared_trip_members (trip_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end $$;
create trigger shared_trips_owner after insert on public.shared_trips for each row execute function public.on_shared_trip();

create function public.lww_stops() returns trigger language plpgsql as $$
begin
  new.updated_at := least(new.updated_at, now() + interval '1 day');
  if tg_op = 'UPDATE' then
    if new.trip_id is distinct from old.trip_id then raise exception 'stop cannot move'; end if;
    if new.updated_at < old.updated_at then return null; end if;
  else
    if (select count(*) from public.shared_trip_stops where trip_id = new.trip_id) >= 300 then raise exception 'too many stops'; end if;
    new.created_by := auth.uid();
  end if;
  new.synced_at := clock_timestamp();
  return new;
end $$;
create trigger stops_lww before insert or update on public.shared_trip_stops for each row execute function public.lww_stops();

-- ── row level security ──────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.wishes enable row level security;
alter table public.friendships enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.shared_trips enable row level security;
alter table public.shared_trip_members enable row level security;
alter table public.shared_trip_stops enable row level security;
alter table public.invites enable row level security;

-- profiles: your own, plus people you have a friendship or request with (so their names show), minus anyone blocked
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid()
  or (not public.is_blocked(auth.uid(), id) and exists (
    select 1 from public.friendships f
    where (f.requester = auth.uid() and f.addressee = id) or (f.addressee = auth.uid() and f.requester = id)
  ))
  or (not public.is_blocked(auth.uid(), id) and exists (
    select 1 from public.shared_trip_members a join public.shared_trip_members b on a.trip_id = b.trip_id
    where a.user_id = auth.uid() and b.user_id = id
  ))
);
-- people you blocked stay visible to you, so you can see and undo it
create policy profiles_blocked on public.profiles for select to authenticated using (
  exists (select 1 from public.blocks b where b.blocker = auth.uid() and b.blocked = id)
);
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- trips and wishes: strictly your own. Friends never read these tables; they get a limited view through friend_map().
create policy trips_own on public.trips for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy wishes_own on public.wishes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy friendships_select on public.friendships for select to authenticated using (auth.uid() in (requester, addressee));
create policy friendships_insert on public.friendships for insert to authenticated with check (requester = auth.uid() and status = 'pending');
create policy friendships_accept on public.friendships for update to authenticated
  using (addressee = auth.uid() and status = 'pending') with check (addressee = auth.uid() and status = 'accepted');
create policy friendships_delete on public.friendships for delete to authenticated using (auth.uid() in (requester, addressee));

create policy blocks_own on public.blocks for all to authenticated using (blocker = auth.uid()) with check (blocker = auth.uid());
create policy reports_insert on public.reports for insert to authenticated with check (reporter = auth.uid());

create policy shared_trips_select on public.shared_trips for select to authenticated using (public.is_member(id) or owner_id = auth.uid());
create policy shared_trips_insert on public.shared_trips for insert to authenticated with check (owner_id = auth.uid());
create policy shared_trips_update on public.shared_trips for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy shared_trips_delete on public.shared_trips for delete to authenticated using (owner_id = auth.uid());

create policy members_select on public.shared_trip_members for select to authenticated using (public.is_member(trip_id));
create policy members_leave on public.shared_trip_members for delete to authenticated
  using (user_id = auth.uid() and role <> 'owner' or (public.is_owner(trip_id) and user_id <> auth.uid()));
create policy members_role on public.shared_trip_members for update to authenticated
  using (public.is_owner(trip_id) and user_id <> auth.uid()) with check (public.is_owner(trip_id) and role in ('editor', 'viewer'));

create policy stops_select on public.shared_trip_stops for select to authenticated using (public.is_member(trip_id));
create policy stops_insert on public.shared_trip_stops for insert to authenticated with check (public.can_edit(trip_id));
create policy stops_update on public.shared_trip_stops for update to authenticated using (public.can_edit(trip_id)) with check (public.can_edit(trip_id));

create policy invites_owner on public.invites for all to authenticated using (public.is_owner(trip_id)) with check (public.is_owner(trip_id) and created_by = auth.uid());

-- ── grants: nothing for anonymous visitors, table access only through the policies above ──
revoke all on all tables in schema public from anon;
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke update on public.reports from authenticated;
revoke select on public.reports from authenticated;

-- ── functions the app calls ─────────────────────────────────────────────────
-- Find people by handle prefix. Returns only a handle and a display name.
create function public.find_profiles(q text) returns table (id uuid, handle text, display_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.handle, p.display_name from public.profiles p
  where auth.uid() is not null
    and length(trim(q)) >= 2
    and p.handle like lower(regexp_replace(trim(q), '[^a-zA-Z0-9_]', '', 'g')) || '%'
    and p.id <> auth.uid()
    and not public.is_blocked(auth.uid(), p.id)
  order by p.handle limit 10;
$$;

-- A friend's map: places and dates only (never notes), only if they allow friends to see it, hidden and future trips left out.
create function public.friend_map(friend uuid) returns table (iso text, place jsonb, start_date date)
language sql stable security definer set search_path = public as $$
  select t.iso, t.place, t.start_date from public.trips t
  join public.profiles p on p.id = t.user_id
  where t.user_id = friend
    and public.are_friends(auth.uid(), friend)
    and p.visibility in ('friends', 'public')
    and t.deleted_at is null and not t.hidden_from_friends
    and (t.start_date is null or t.start_date <= current_date);
$$;

-- The public link: works logged out, only for profiles set to public.
create function public.public_profile(h text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'handle', p.handle,
    'display_name', p.display_name,
    'trips', coalesce((
      select jsonb_agg(jsonb_build_object('iso', t.iso, 'place', t.place, 'start_date', t.start_date))
      from public.trips t
      where t.user_id = p.id and t.deleted_at is null and not t.hidden_from_friends
        and (t.start_date is null or t.start_date <= current_date)
    ), '[]'::jsonb)
  )
  from public.profiles p where p.handle = lower(h) and p.visibility = 'public';
$$;

-- Add a friend to a shared trip you own (they must already be your friend).
create function public.invite_friend(trip uuid, friend uuid, member_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner(trip) then raise exception 'only the owner can invite'; end if;
  if member_role not in ('editor', 'viewer') then raise exception 'bad role'; end if;
  if not public.are_friends(auth.uid(), friend) then raise exception 'not friends'; end if;
  insert into public.shared_trip_members (trip_id, user_id, role) values (trip, friend, member_role)
  on conflict (trip_id, user_id) do update set role = excluded.role where public.shared_trip_members.role <> 'owner';
end $$;

-- Join through an invite link.
create function public.accept_invite(tok text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv public.invites;
begin
  select * into inv from public.invites where token = tok and expires_at > now();
  if not found then raise exception 'invite is not valid'; end if;
  if public.is_blocked(auth.uid(), (select owner_id from public.shared_trips where id = inv.trip_id)) then raise exception 'not possible'; end if;
  insert into public.shared_trip_members (trip_id, user_id, role) values (inv.trip_id, auth.uid(), inv.role)
  on conflict (trip_id, user_id) do nothing;
  return inv.trip_id;
end $$;

-- Handle check for the sign-up screen: only says taken / free, nothing else about the account.
create function public.handle_taken(h text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from public.profiles where handle = lower(h));
$$;

create function public.export_my_data() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'trips', coalesce((select jsonb_agg(to_jsonb(t)) from public.trips t where t.user_id = auth.uid() and t.deleted_at is null), '[]'::jsonb),
    'wishes', coalesce((select jsonb_agg(to_jsonb(w)) from public.wishes w where w.user_id = auth.uid() and w.deleted_at is null), '[]'::jsonb),
    'friendships', coalesce((select jsonb_agg(to_jsonb(f)) from public.friendships f where auth.uid() in (f.requester, f.addressee)), '[]'::jsonb),
    'blocks', coalesce((select jsonb_agg(to_jsonb(b)) from public.blocks b where b.blocker = auth.uid()), '[]'::jsonb),
    'shared_trips', coalesce((select jsonb_agg(to_jsonb(s)) from public.shared_trips s where public.is_member(s.id)), '[]'::jsonb),
    'exported_at', now()
  );
$$;

-- Deletes the signed-in user's account and, through cascades, everything they own.
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke all on all functions in schema public from public, anon;
grant execute on function
  public.is_blocked(uuid, uuid), public.are_friends(uuid, uuid),
  public.find_profiles(text), public.friend_map(uuid), public.invite_friend(uuid, uuid, text),
  public.accept_invite(text), public.handle_taken(text), public.export_my_data(), public.delete_my_account(),
  public.is_member(uuid), public.can_edit(uuid), public.is_owner(uuid)
to authenticated;
grant execute on function public.public_profile(text) to anon, authenticated;

-- ── live updates (Supabase Realtime) ────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.trips, public.wishes, public.friendships, public.shared_trips, public.shared_trip_members, public.shared_trip_stops;
  end if;
end $$;
