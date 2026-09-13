import { applyRemoteBadge, listUnsyncedBadges, markBadgesSynced } from '@/db/badges';
import { checkBadges } from '@/lib/badges';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  applyRemoteSighting,
  listUnsyncedSightings,
  markSightingsSynced,
  type RemoteSighting,
} from '@/db/sightings';

const PAGE = 500;

export type SyncResult = { pushed: number; pulled: number };

function cursorKey(userId: string) {
  return `sync_cursor:${userId}`;
}

async function getMeta(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', key);
  return row?.value ?? null;
}

async function setMeta(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, value);
}

/**
 * One round of sync for the signed-in user: push local changes, then pull
 * everything the server has changed since the last pull. Safe to call often;
 * callers serialize it through the SyncProvider.
 */
export async function syncOnce(db: SQLiteDatabase, supabase: SupabaseClient, userId: string): Promise<SyncResult> {
  // Push: anything never synced, or edited since it was.
  const pending = await listUnsyncedSightings(db, userId);
  if (pending.length > 0) {
    const rows = pending.map((s) => ({
      id: s.id,
      user_id: userId,
      species_code: s.speciesCode,
      observed_at: s.observedAt,
      lat: s.lat,
      lng: s.lng,
      method: s.method,
      note: s.note,
      created_at: s.createdAt,
      updated_at: s.updatedAt,
      deleted_at: s.deletedAt,
    }));
    const { error } = await supabase.from('sightings').upsert(rows, { onConflict: 'id' });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    await markSightingsSynced(db, pending.map((s) => ({ id: s.id, updatedAt: s.updatedAt })));
  }

  // Pull: pages ordered by the server's clock, resuming from a per-user cursor.
  let cursor = (await getMeta(db, cursorKey(userId))) ?? '1970-01-01T00:00:00Z';
  let pulled = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('sightings')
      .select('*')
      .gt('server_updated_at', cursor)
      .order('server_updated_at', { ascending: true })
      .limit(PAGE);
    if (error) throw new Error(`Download failed: ${error.message}`);
    const page = (data ?? []) as RemoteSighting[];
    for (const row of page) {
      await applyRemoteSighting(db, row);
    }
    pulled += page.length;
    if (page.length > 0) {
      cursor = page[page.length - 1].server_updated_at;
      await setMeta(db, cursorKey(userId), cursor);
    }
    if (page.length < PAGE) break;
  }

  // Badges: push the ones earned here, pull the ones earned elsewhere, then re-check.
  const badgesPending = await listUnsyncedBadges(db);
  if (badgesPending.length) {
    const { error } = await supabase
      .from('badges')
      .upsert(badgesPending.map((b) => ({ user_id: userId, badge_id: b.badgeId, earned_at: b.earnedAt })), { onConflict: 'user_id,badge_id', ignoreDuplicates: true });
    if (error) throw new Error(`Badge upload failed: ${error.message}`);
    await markBadgesSynced(db, badgesPending.map((b) => b.badgeId));
  }
  const remoteBadges = await supabase.from('badges').select('badge_id, earned_at').eq('user_id', userId);
  if (remoteBadges.error) throw new Error(`Badge download failed: ${remoteBadges.error.message}`);
  for (const b of remoteBadges.data ?? []) await applyRemoteBadge(db, b.badge_id, b.earned_at);
  await checkBadges(db);

  return { pushed: pending.length, pulled };
}

// A tiny signal so screens can ask for a sync after a write without knowing about the provider.
type Listener = () => void;
const listeners = new Set<Listener>();

export function requestSync(): void {
  for (const l of listeners) l();
}

export function onSyncRequested(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
