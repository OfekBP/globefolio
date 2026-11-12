-- Country codes in this app are two or three characters (same rule as trips), so cheers must accept both.
alter table public.reactions drop constraint if exists reactions_iso_check;
alter table public.reactions add constraint reactions_iso_check check (iso ~ '^[A-Z0-9]{2,3}$');
