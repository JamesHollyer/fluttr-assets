-- Friends v1: usernames, mutual friendships (request -> accept), and a way to read a
-- friend's life list that never exposes where they caught anything.

-- Usernames: lowercase letters, digits, underscores; 3 to 20 characters; unique.
alter table public.profiles
  add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9_]{3,20}$');

create index if not exists profiles_username_idx on public.profiles (username);

create table public.friendships (
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'blocked')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create index friendships_addressee_idx on public.friendships (addressee_id, status);

alter table public.friendships enable row level security;

-- Both people in a friendship can see it.
create policy "friendship parties can read"
  on public.friendships for select to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Only the requester creates it, and only as a pending request.
create policy "users send requests"
  on public.friendships for insert to authenticated
  with check (auth.uid() = requester_id and status = 'pending');

-- Only the addressee answers (accept or block).
create policy "addressee answers requests"
  on public.friendships for update to authenticated
  using (auth.uid() = addressee_id)
  with check (auth.uid() = addressee_id and status in ('accepted', 'blocked'));

-- Either side can remove it (decline, cancel, or unfriend).
create policy "either party removes"
  on public.friendships for delete to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create or replace function public.touch_friendship_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger friendships_touch_updated_at
  before update on public.friendships
  for each row execute function public.touch_friendship_updated_at();

create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b) or (f.requester_id = b and f.addressee_id = a))
  );
$$;

-- A friend's life list: one row per species with counts and dates, no locations, no notes.
-- Runs with the definer's rights so the sightings table itself stays private.
create or replace function public.friend_life_list(friend uuid)
returns table (species_code text, catches bigint, first_seen timestamptz, last_seen timestamptz)
language sql stable security definer set search_path = public as $$
  select s.species_code, count(*) as catches, min(s.observed_at) as first_seen, max(s.observed_at) as last_seen
  from public.sightings s
  where s.user_id = friend
    and s.deleted_at is null
    and (friend = auth.uid() or public.are_friends(auth.uid(), friend))
  group by s.species_code
  order by last_seen desc;
$$;

revoke all on function public.friend_life_list(uuid) from public;
grant execute on function public.friend_life_list(uuid) to authenticated;
revoke all on function public.are_friends(uuid, uuid) from public;
grant execute on function public.are_friends(uuid, uuid) to authenticated;

-- Life-list size per profile, for friend rows and search results.
create or replace function public.profile_species_count(profile uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select count(distinct s.species_code) from public.sightings s where s.user_id = profile and s.deleted_at is null;
$$;
revoke all on function public.profile_species_count(uuid) from public;
grant execute on function public.profile_species_count(uuid) to authenticated;
