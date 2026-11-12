-- Make the account yours: a picture (an illustrated preset or a small photo), an accent color, a short bio and a status line.
-- The picture is a preset id ('a:explorer') or a tiny image (a data URL of at most 9000 characters, shrunk on the phone),
-- so no file storage is needed. Everything here is visible to anyone who can find the person, by design.
alter table public.profiles
  add column if not exists avatar text,
  add column if not exists accent text,
  add column if not exists bio text,
  add column if not exists status text;

alter table public.profiles drop constraint if exists profiles_avatar_check;
alter table public.profiles add constraint profiles_avatar_check check (
  avatar is null
  or avatar ~ '^a:[a-z0-9_-]{1,24}$'
  or (avatar ~ '^data:image/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$' and char_length(avatar) <= 9000));
alter table public.profiles drop constraint if exists profiles_accent_check;
alter table public.profiles add constraint profiles_accent_check check (accent is null or accent ~ '^#[0-9a-f]{6}$');
alter table public.profiles drop constraint if exists profiles_bio_check;
alter table public.profiles add constraint profiles_bio_check check (bio is null or char_length(bio) <= 120);
alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check check (status is null or char_length(status) <= 60);

-- Search now also finds people by their display name, and shows their picture and color.
drop function if exists public.find_profiles(text);
create function public.find_profiles(q text) returns table (id uuid, handle text, display_name text, avatar text, accent text)
language sql stable security definer set search_path = public as $$
  with s as (
    select lower(regexp_replace(trim(q), '[^a-zA-Z0-9_]', '', 'g')) as h,
           lower(regexp_replace(trim(q), '([\%_])', '\\1', 'g')) as n
  )
  select p.id, p.handle, p.display_name, p.avatar, p.accent from public.profiles p, s
  where auth.uid() is not null
    and (length(s.h) >= 2 or length(s.n) >= 2)
    and ((length(s.h) >= 2 and p.handle like replace(s.h, '_', '\_') || '%')
         or (length(s.n) >= 2 and lower(p.display_name) like s.n || '%'))
    and p.id <> auth.uid()
    and not public.is_blocked(auth.uid(), p.id)
  order by p.handle limit 10;
$$;

create or replace function public.public_profile(h text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'handle', p.handle,
    'display_name', p.display_name,
    'avatar', p.avatar,
    'accent', p.accent,
    'bio', p.bio,
    'status', p.status,
    'trips', coalesce((
      select jsonb_agg(jsonb_build_object('iso', t.iso, 'place', t.place, 'start_date', t.start_date))
      from public.trips t
      where t.user_id = p.id and t.deleted_at is null and not t.hidden_from_friends
        and (t.start_date is null or t.start_date <= current_date)
    ), '[]'::jsonb)
  )
  from public.profiles p where p.handle = lower(h) and p.visibility = 'public';
$$;

revoke all on function public.find_profiles(text) from public, anon;
grant execute on function public.find_profiles(text) to authenticated;
grant execute on function public.public_profile(text) to anon, authenticated;
