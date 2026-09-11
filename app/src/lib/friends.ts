import type { SupabaseClient } from '@supabase/supabase-js';

export type Profile = { id: string; username: string | null; displayName: string | null };
export type FriendshipStatus = 'pending' | 'accepted' | 'blocked';

export type FriendshipRow = {
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
};

export type FriendEntry = {
  profile: Profile;
  /** 'friend', 'incoming' (they asked you), or 'outgoing' (you asked them). */
  relation: 'friend' | 'incoming' | 'outgoing';
  since: string;
};

export type FriendLifeListEntry = { species_code: string; catches: number; first_seen: string; last_seen: string };

export const USERNAME_RULE = /^[a-z0-9_]{3,20}$/;

function toProfile(row: { id: string; username: string | null; display_name: string | null }): Profile {
  return { id: row.id, username: row.username, displayName: row.display_name };
}

export async function getMyProfile(supabase: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('id, username, display_name').eq('id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toProfile(data) : null;
}

export async function saveMyProfile(supabase: SupabaseClient, userId: string, username: string, displayName: string): Promise<void> {
  const clean = username.trim().toLowerCase();
  if (!USERNAME_RULE.test(clean)) {
    throw new Error('Usernames are 3 to 20 characters: lowercase letters, numbers, and underscores.');
  }
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, username: clean, display_name: displayName.trim() || null }, { onConflict: 'id' });
  if (error) {
    if (error.code === '23505') throw new Error('That username is taken.');
    throw new Error(error.message);
  }
}

/** Username search, prefix first. Excludes the caller. */
export async function searchProfiles(supabase: SupabaseClient, query: string, selfId: string): Promise<Profile[]> {
  const q = query.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (q.length < 2) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name')
    .ilike('username', `${q}%`)
    .neq('id', selfId)
    .order('username')
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []).map(toProfile);
}

export async function listFriendships(supabase: SupabaseClient, selfId: string): Promise<FriendEntry[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id, status, created_at')
    .neq('status', 'blocked');
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as FriendshipRow[];
  const otherIds = rows.map((r) => (r.requester_id === selfId ? r.addressee_id : r.requester_id));
  if (otherIds.length === 0) return [];
  const { data: profiles, error: pErr } = await supabase.from('profiles').select('id, username, display_name').in('id', otherIds);
  if (pErr) throw new Error(pErr.message);
  const byId = new Map((profiles ?? []).map((p) => [p.id, toProfile(p)]));
  return rows
    .map((r) => {
      const otherId = r.requester_id === selfId ? r.addressee_id : r.requester_id;
      const profile = byId.get(otherId) ?? { id: otherId, username: null, displayName: null };
      const relation: FriendEntry['relation'] =
        r.status === 'accepted' ? 'friend' : r.requester_id === selfId ? 'outgoing' : 'incoming';
      return { profile, relation, since: r.created_at };
    })
    .sort((a, b) => a.relation.localeCompare(b.relation) || (a.profile.username ?? '').localeCompare(b.profile.username ?? ''));
}

export async function sendFriendRequest(supabase: SupabaseClient, selfId: string, otherId: string): Promise<void> {
  const { error } = await supabase.from('friendships').insert({ requester_id: selfId, addressee_id: otherId, status: 'pending' });
  if (error) {
    if (error.code === '23505') throw new Error('You already have a request with this person.');
    throw new Error(error.message);
  }
}

export async function acceptFriendRequest(supabase: SupabaseClient, selfId: string, requesterId: string): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('requester_id', requesterId)
    .eq('addressee_id', selfId);
  if (error) throw new Error(error.message);
}

/** Declines, cancels, or unfriends, whichever direction the row is. */
export async function removeFriendship(supabase: SupabaseClient, selfId: string, otherId: string): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .or(`and(requester_id.eq.${selfId},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${selfId})`);
  if (error) throw new Error(error.message);
}

export async function fetchFriendLifeList(supabase: SupabaseClient, friendId: string): Promise<FriendLifeListEntry[]> {
  const { data, error } = await supabase.rpc('friend_life_list', { friend: friendId });
  if (error) throw new Error(error.message);
  return (data ?? []) as FriendLifeListEntry[];
}

export async function fetchSpeciesCount(supabase: SupabaseClient, profileId: string): Promise<number> {
  const { data, error } = await supabase.rpc('profile_species_count', { profile: profileId });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export function profileName(p: Profile): string {
  return p.displayName || (p.username ? `@${p.username}` : 'Someone');
}
