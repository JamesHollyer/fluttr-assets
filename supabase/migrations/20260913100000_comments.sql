-- Comments on feed items (a friend's catch or badge). Visible to the item's owner and their
-- accepted friends; written by the same people; deletable by the author or the item's owner.

create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  item_kind  text not null check (item_kind in ('catch', 'badge')),
  item_id    text not null,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  author_id  uuid not null references auth.users (id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index comments_item_idx on public.comments (item_kind, item_id, owner_id, created_at);

alter table public.comments enable row level security;

create policy "comments visible to owner and their friends"
  on public.comments for select to authenticated
  using (auth.uid() = owner_id or public.are_friends(auth.uid(), owner_id));

create policy "comments written by owner or their friends"
  on public.comments for insert to authenticated
  with check (auth.uid() = author_id and (auth.uid() = owner_id or public.are_friends(auth.uid(), owner_id)));

create policy "comments deleted by author or owner"
  on public.comments for delete to authenticated
  using (auth.uid() = author_id or auth.uid() = owner_id);

-- Feed now carries a comment count per item.
drop function if exists public.friend_feed(int);
create or replace function public.friend_feed(lim int default 100)
returns table (kind text, item_id text, user_id uuid, species_code text, badge_id text, happened_at timestamptz, is_lifer boolean, comment_count bigint)
language sql stable security definer set search_path = public as $$
  with people as (
    select auth.uid() as id
    union
    select case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
    from public.friendships f
    where f.status = 'accepted' and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
  ),
  feed as (
    select 'catch'::text as kind, s.id::text as item_id, s.user_id, s.species_code, null::text as badge_id,
           s.observed_at as happened_at,
           s.observed_at = (select min(x.observed_at) from public.sightings x
                            where x.user_id = s.user_id and x.species_code = s.species_code and x.deleted_at is null) as is_lifer
    from public.sightings s join people p on p.id = s.user_id
    where s.deleted_at is null
    union all
    select 'badge', b.badge_id, b.user_id, null, b.badge_id, b.earned_at, false
    from public.badges b join people p on p.id = b.user_id
  )
  select f.*, (select count(*) from public.comments c
               where c.item_kind = f.kind and c.item_id = f.item_id and c.owner_id = f.user_id) as comment_count
  from feed f
  order by f.happened_at desc
  limit lim;
$$;

grant execute on function public.friend_feed(int) to authenticated;
