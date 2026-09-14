import type { SupabaseClient } from '@supabase/supabase-js';

import { type Profile } from '@/lib/friends';

export type FeedItem = {
  kind: 'catch' | 'badge';
  key: string;
  itemId: string;
  userId: string;
  profile: Profile | null;
  speciesCode: string | null;
  badgeId: string | null;
  happenedAt: string;
  isLifer: boolean;
  /** Whether the signed-in user congratulated this item. */
  congratulated: boolean;
  /** Names of friends who congratulated it (only known for your own items). */
  congratulatedBy: string[];
  commentCount: number;
};

type FeedRow = { kind: 'catch' | 'badge'; item_id: string; user_id: string; species_code: string | null; badge_id: string | null; happened_at: string; is_lifer: boolean; comment_count: number | string };
type ReactionRow = { item_kind: 'catch' | 'badge'; item_id: string; owner_id: string; from_user: string };

export async function fetchFeed(supabase: SupabaseClient, me: string, limit = 100): Promise<FeedItem[]> {
  const { data, error } = await supabase.rpc('friend_feed', { lim: limit });
  if (error) throw error;
  const rows = (data ?? []) as FeedRow[];

  const ids = new Set<string>(rows.map((r) => r.user_id));
  const reactions = await supabase.from('reactions').select('item_kind, item_id, owner_id, from_user');
  if (reactions.error) throw reactions.error;
  for (const r of reactions.data as ReactionRow[]) ids.add(r.from_user);

  const profiles = await supabase.from('profiles').select('id, username, display_name').in('id', [...ids]);
  if (profiles.error) throw profiles.error;
  const byId = new Map<string, Profile>(
    (profiles.data ?? []).map((p) => [p.id, { id: p.id, username: p.username, displayName: p.display_name }]),
  );

  const mine = new Set<string>();
  const toMe = new Map<string, string[]>();
  for (const r of reactions.data as ReactionRow[]) {
    const k = `${r.item_kind}:${r.item_id}:${r.owner_id}`;
    if (r.from_user === me) mine.add(k);
    if (r.owner_id === me) {
      const p = byId.get(r.from_user);
      toMe.set(k, [...(toMe.get(k) ?? []), p ? profileLabel(p) : 'A friend']);
    }
  }

  return rows.map((r) => {
    const k = `${r.kind}:${r.item_id}:${r.user_id}`;
    return {
      kind: r.kind,
      key: k,
      itemId: r.item_id,
      userId: r.user_id,
      profile: byId.get(r.user_id) ?? null,
      speciesCode: r.species_code,
      badgeId: r.badge_id,
      happenedAt: r.happened_at,
      isLifer: Boolean(r.is_lifer),
      congratulated: mine.has(k),
      congratulatedBy: toMe.get(k) ?? [],
      commentCount: Number(r.comment_count ?? 0),
    };
  });
}

export async function setCongratulated(supabase: SupabaseClient, me: string, item: FeedItem, on: boolean): Promise<void> {
  if (on) {
    const { error } = await supabase
      .from('reactions')
      .upsert({ item_kind: item.kind, item_id: item.itemId, owner_id: item.userId, from_user: me }, { onConflict: 'item_kind,item_id,owner_id,from_user', ignoreDuplicates: true });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('reactions')
      .delete()
      .match({ item_kind: item.kind, item_id: item.itemId, owner_id: item.userId, from_user: me });
    if (error) throw error;
  }
}

export function profileLabel(p: Profile): string {
  return p.displayName?.trim() || (p.username ? `@${p.username}` : 'Someone');
}

/** "just now", "5m", "3h", "2d", or a short date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export type Comment = { id: string; authorId: string; author: Profile | null; body: string; createdAt: string };

type CommentRow = { id: string; author_id: string; body: string; created_at: string };

/** The comment thread on one feed item, oldest first, with author names. */
export async function fetchComments(supabase: SupabaseClient, item: Pick<FeedItem, 'kind' | 'itemId' | 'userId'>): Promise<Comment[]> {
  const { data, error } = await supabase
    .from('comments')
    .select('id, author_id, body, created_at')
    .match({ item_kind: item.kind, item_id: item.itemId, owner_id: item.userId })
    .order('created_at', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as CommentRow[];
  const ids = [...new Set(rows.map((r) => r.author_id))];
  const profiles = ids.length ? await supabase.from('profiles').select('id, username, display_name').in('id', ids) : { data: [], error: null };
  if (profiles.error) throw profiles.error;
  const byId = new Map<string, Profile>((profiles.data ?? []).map((p) => [p.id, { id: p.id, username: p.username, displayName: p.display_name }]));
  return rows.map((r) => ({ id: r.id, authorId: r.author_id, author: byId.get(r.author_id) ?? null, body: r.body, createdAt: r.created_at }));
}

export async function addComment(supabase: SupabaseClient, me: string, item: Pick<FeedItem, 'kind' | 'itemId' | 'userId'>, body: string): Promise<void> {
  const text = body.trim();
  if (!text) return;
  const { error } = await supabase.from('comments').insert({ item_kind: item.kind, item_id: item.itemId, owner_id: item.userId, author_id: me, body: text.slice(0, 500) });
  if (error) throw error;
}

export async function deleteComment(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('comments').delete().eq('id', id);
  if (error) throw error;
}
