-- Anonymous crash reports from the app. Insert-only for everyone; nobody can read them through the API
-- (they are read in the Supabase dashboard). No user id, email or trip data is stored.
create table if not exists public.error_reports (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  message text not null check (char_length(message) <= 500),
  stack text check (char_length(stack) <= 2000),
  page text check (char_length(page) <= 200),
  version text check (char_length(version) <= 40),
  lang text check (char_length(lang) <= 10),
  agent text check (char_length(agent) <= 200)
);

alter table public.error_reports enable row level security;

drop policy if exists "anyone can report an error" on public.error_reports;
create policy "anyone can report an error" on public.error_reports
  for insert to anon, authenticated with check (true);

revoke all on public.error_reports from anon, authenticated;
grant insert on public.error_reports to anon, authenticated;

create index if not exists error_reports_created_idx on public.error_reports (created_at desc);

-- Reports are kept for 30 days.
create or replace function public.purge_old_error_reports() returns void
language sql security definer set search_path = public as $$
  delete from public.error_reports where created_at < now() - interval '30 days';
$$;
revoke all on function public.purge_old_error_reports() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('purge-error-reports', '17 3 * * *', 'select public.purge_old_error_reports()');
exception when others then
  raise notice 'pg_cron not available: run purge_old_error_reports() by hand now and then';
end $$;
