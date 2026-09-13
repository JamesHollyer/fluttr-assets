-- Friends feed v1: friends' recent catches and badges (never locations or notes), and a
-- single "congratulate" reaction per item.

create table public.reactions (
  item_kind  text not null check (item_kind in ('catch', 'badge')),
  item_id    text not null,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  from_user  uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_kind, item_id, owner_id, from_user),
  check (owner_id <> from_user)
);

create index reactions_owner_idx on public.reactions (owner_id, created_at desc);

alter table public.reactions enable row level security;

-- You see reactions you sent and reactions to your own items.
create policy "reactions visible to sender and owner"
  on public.reactions for select to authenticated
  using (auth.uid() = from_user or auth.uid() = owner_id);

-- You can congratulate an accepted friend.
create policy "reactions sent to friends"
  on public.reactions for insert to authenticated
  with check (auth.uid() = from_user and public.are_friends(auth.uid(), owner_id));

create policy "reactions removed by sender"
  on public.reactions for delete to authenticated
  using (auth.uid() = from_user);

-- Recent activity from you and your accepted friends: catches (with a lifer flag) and badges.
create or replace function public.friend_feed(lim int default 100)
returns table (kind text, item_id text, user_id uuid, species_code text, badge_id text, happened_at timestamptz, is_lifer boolean)
language sql stable security definer set search_path = public as $$
  with people as (
    select auth.uid() as id
    union
    select case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
    from public.friendships f
    where f.status = 'accepted' and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
  )
  select * from (
    select 'catch'::text as kind, s.id::text as item_id, s.user_id, s.species_code, null::text as badge_id,
           s.observed_at as happened_at,
           s.observed_at = (select min(x.observed_at) from public.sightings x
                            where x.user_id = s.user_id and x.species_code = s.species_code and x.deleted_at is null) as is_lifer
    from public.sightings s join people p on p.id = s.user_id
    where s.deleted_at is null
    union all
    select 'badge', b.badge_id, b.user_id, null, b.badge_id, b.earned_at, false
    from public.badges b join people p on p.id = b.user_id
  ) feed
  order by happened_at desc
  limit lim;
$$;

grant execute on function public.friend_feed(int) to authenticated;
