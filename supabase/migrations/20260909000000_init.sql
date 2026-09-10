-- Fluttr server schema, v1: accounts and sightings sync.
-- The phone's SQLite database is the source of truth; this is the sync target.

create extension if not exists pgcrypto;

-- One profile per auth user, created by trigger. Username and display name come later.
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text unique,
  display_name text,
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles readable by signed-in users"
  on public.profiles for select to authenticated using (true);

create policy "users manage their own profile"
  on public.profiles for all to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Sightings ("catches"). Ids are generated on the phone. created_at/updated_at are the
-- phone's clock and drive last-write-wins; server_updated_at is this database's clock
-- and drives incremental pulls. Soft deletes travel as deleted_at.
create table public.sightings (
  id                uuid primary key,
  user_id           uuid not null references auth.users (id) on delete cascade,
  species_code      text not null,
  observed_at       timestamptz not null,
  lat               double precision,
  lng               double precision,
  method            text not null default 'manual',
  note              text,
  created_at        timestamptz not null,
  updated_at        timestamptz not null,
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default now()
);

create index sightings_user_server_updated on public.sightings (user_id, server_updated_at);

alter table public.sightings enable row level security;

create policy "users manage their own sightings"
  on public.sightings for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.touch_server_updated_at()
returns trigger language plpgsql as $$
begin
  new.server_updated_at = now();
  return new;
end;
$$;

create trigger sightings_touch_server_updated_at
  before insert or update on public.sightings
  for each row execute function public.touch_server_updated_at();
