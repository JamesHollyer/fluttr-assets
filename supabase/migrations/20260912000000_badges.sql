-- Badges v1: which badges each user has earned. Rules run on the phone; the server only
-- stores the result so badges follow the user across devices and friends can see them.

create table public.badges (
  user_id   uuid not null references auth.users (id) on delete cascade,
  badge_id  text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

alter table public.badges enable row level security;

-- You can read your own badges; accepted friends can read them too.
create policy "badges readable by owner and friends"
  on public.badges for select to authenticated
  using (auth.uid() = user_id or public.are_friends(auth.uid(), user_id));

create policy "badges inserted by owner"
  on public.badges for insert to authenticated
  with check (auth.uid() = user_id);

create policy "badges deleted by owner"
  on public.badges for delete to authenticated
  using (auth.uid() = user_id);
