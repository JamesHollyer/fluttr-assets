-- Self-service account deletion (required by the App Store). Every table that belongs to a
-- user references auth.users with on delete cascade, so removing the auth row removes the
-- profile, sightings, badges, friendships, reactions, comments, notifications, and tokens.
-- Comments the user left on other people's items go too; notifications that named the user
-- as actor keep the row with actor_id set to null.

create or replace function public.delete_account()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_account() from public;
grant execute on function public.delete_account() to authenticated;
