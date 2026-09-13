import type { SQLiteDatabase } from 'expo-sqlite';

export type EarnedBadge = { badgeId: string; earnedAt: string; syncedAt: string | null };

export async function listEarnedBadges(db: SQLiteDatabase): Promise<EarnedBadge[]> {
  return db.getAllAsync<EarnedBadge>('SELECT badge_id AS badgeId, earned_at AS earnedAt, synced_at AS syncedAt FROM badges_earned');
}

export async function countEarnedBadges(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM badges_earned');
  return row?.n ?? 0;
}

export async function insertEarnedBadges(db: SQLiteDatabase, ids: string[], earnedAt: string): Promise<void> {
  for (const id of ids) {
    await db.runAsync('INSERT OR IGNORE INTO badges_earned (badge_id, earned_at) VALUES (?, ?)', id, earnedAt);
  }
}

export async function listUnsyncedBadges(db: SQLiteDatabase): Promise<EarnedBadge[]> {
  return db.getAllAsync<EarnedBadge>('SELECT badge_id AS badgeId, earned_at AS earnedAt, synced_at AS syncedAt FROM badges_earned WHERE synced_at IS NULL');
}

export async function markBadgesSynced(db: SQLiteDatabase, ids: string[]): Promise<void> {
  const now = new Date().toISOString();
  for (const id of ids) await db.runAsync('UPDATE badges_earned SET synced_at = ? WHERE badge_id = ?', now, id);
}

/** A badge the server already knows about (earned on another device). Keeps the earliest date. */
export async function applyRemoteBadge(db: SQLiteDatabase, badgeId: string, earnedAt: string): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO badges_earned (badge_id, earned_at, synced_at) VALUES (?, ?, ?)
     ON CONFLICT (badge_id) DO UPDATE SET earned_at = MIN(earned_at, excluded.earned_at), synced_at = COALESCE(synced_at, excluded.synced_at)`,
    badgeId, earnedAt, now,
  );
}
